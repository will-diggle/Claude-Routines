"""
bilinguist_write.py
===================
Stages 2S, 2M, 3, and 4 of the Bilinguist Brief daily pipeline.

Reads the factbase produced by bilinguist_gather.py and:
  2S — Short writing    : gemini-2.5-flash  Concurrent  all levels short
  2M — Medium/long      : gemini-2.5-flash  Concurrent  all levels medium + longer
  3  — Native journalism : gemini-2.5-flash  Concurrent  one per language
  4  — Grading           : gemini-2.5-flash  Sequential  grades Stage 3 output

All stages use direct generate_content() calls with a thread pool (max 5 concurrent)
rather than the Gemini Batch API. This avoids batch quota requirements and is
faster (no polling delay) while naturally handling rate limits via the semaphore.

Outputs:
  scripts/output/YYYY-MM-DD.json   — archived bundle
  scripts/output/latest.json       — overwritten daily (app fetches this)
  scripts/output/costs_YYYY-MM-DD.json — per-stage token usage and GBP cost

Bundle format (DailyBundle) is the contract with the React Native app.

Usage:
    python bilinguist_write.py [--date YYYY-MM-DD]

Requirements:
    pip install google-genai
    export GEMINI_API_KEY=your_key_from_aistudio.google.com
"""

import argparse
import json
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from google import genai
from google.genai import types


# ── Models ───────────────────────────────────────────────────────────────────

# All stages use Flash — it's the only model reliably available for concurrent
# direct calls. Flash-lite saved cost via the Batch API (50% discount) but the
# Batch API doesn't support flash-lite and returns empty inlined_responses.
MODEL_2S = "gemini-2.5-flash"               # A1/A2 + all short lengths
MODEL_2M = "gemini-2.5-flash"               # B1+ medium and long
MODEL_3  = "gemini-2.5-flash"               # Native journalism, one per language
MODEL_4  = "gemini-2.5-flash"               # Grading of native journalism

# Concurrency limit — keeps total inflight calls below Gemini Flash RPM limit.
# At 5 concurrent × ~10s average = ~30 req/min, within typical free-tier limits.
_MAX_WORKERS   = 5
_API_SEMAPHORE = threading.Semaphore(_MAX_WORKERS)

# Retry settings for transient API errors
MAX_RETRIES   = 3
RETRY_DELAYS  = [30, 60, 120]   # seconds between retries


# ── Token-usage tracking (thread-safe) ───────────────────────────────────────

@dataclass
class _StageUsage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0

_usage_lock = threading.Lock()
_stage_usage: dict[str, _StageUsage] = {
    "2S": _StageUsage(),
    "2M": _StageUsage(),
    "3":  _StageUsage(),
    "4":  _StageUsage(),
}

# Gemini 2.5 Flash pricing (USD per 1M tokens) — verify at ai.google.dev/pricing
FLASH_INPUT_USD_PER_M  = 0.30
FLASH_OUTPUT_USD_PER_M = 2.50
FLASH_THINK_USD_PER_M  = 3.50

# Gemini 2.5 Pro Flex pricing (50 % discount over standard Pro rates)
PRO_FLEX_INPUT_USD_PER_M  = 0.625   # standard $1.25 × 0.5
PRO_FLEX_OUTPUT_USD_PER_M = 5.00    # standard $10.00 × 0.5
PRO_FLEX_THINK_USD_PER_M  = 1.75    # standard $3.50 × 0.5

USD_TO_GBP = 0.79  # approximate — update as needed


# ── Language / level matrix ───────────────────────────────────────────────────
# Testing phase matrix — add languages/levels here as pipeline is validated.

LANGUAGE_LEVELS: dict[str, list[str]] = {
    "fr": ["A1", "A2", "B1", "B2", "C1", "C2"],
    "de": ["A1", "A2", "Native"],
    "sv": ["B2", "Native"],
    "en": ["B2", "C1", "C2", "Native"],
    "it": ["A1", "Native"],
    "es": ["A2"],
    "tr": ["A1"],
}

LANGUAGE_NAMES: dict[str, str] = {
    "fr": "French",
    "de": "German",
    "en": "English",
    "sv": "Swedish",
    "es": "Spanish",
    "it": "Italian",
    "tr": "Turkish",
}

LEVEL_LABELS: dict[str, str] = {
    "A1":     "Beginner",
    "A2":     "Elementary",
    "B1":     "Intermediate",
    "B2":     "Upper Intermediate",
    "C1":     "Advanced",
    "C2":     "Challenge",
    "Native": "Native",
}

WORDS_PER_ARTICLE_BEGINNER: dict[str, int] = {  # A1 / A2
    "short":  55,
    "medium": 110,
    "longer": 190,
}
WORDS_PER_ARTICLE_ADVANCED: dict[str, int] = {  # B1+
    "short":  80,
    "medium": 160,
    "longer": 300,
}

# Sentence count targets per length.
# A1 uses very short sentences so needs more of them to hit the word count.
# These OVERRIDE the per-level sentence counts in the reading level descriptions.
SENTENCES_PER_ARTICLE_A1: dict[str, str] = {
    "short":  "6–8",
    "medium": "12–16",
    "longer": "20–26",
}
SENTENCES_PER_ARTICLE_STANDARD: dict[str, str] = {  # A2 and above
    "short":  "3–4",
    "medium": "6–8",
    "longer": "11–15",
}

# C1 is the native/journalistic writing tier — "Native" maps to C1 prompt level.
NATIVE_WRITING_LEVEL = "C1"

ACTIVE_LANGUAGES = [lang for lang in LANGUAGE_LEVELS if LANGUAGE_LEVELS[lang]]


# ── Combination matrix ────────────────────────────────────────────────────────
# A1/A2 → short only (fixed; TODO: length-per-level policy — revisit for beginner choice)
# B1+   → short (via 2S flash-lite) + medium + longer (via 2M flash)

def build_combinations() -> tuple[list[tuple[str, str, str]], list[tuple[str, str, str]]]:
    """
    Returns (combos_2s, combos_2m).
    combos_2s → MODEL_2S: all levels short
    combos_2m → MODEL_2M: all levels medium + longer
    Every level now gets all 3 length variants; users choose per language in-app.
    """
    combos_2s: list[tuple[str, str, str]] = []
    combos_2m: list[tuple[str, str, str]] = []

    for lang, levels in LANGUAGE_LEVELS.items():
        for level in levels:
            combos_2s.append((lang, level, "short"))
            combos_2m.append((lang, level, "medium"))
            combos_2m.append((lang, level, "longer"))

    return combos_2s, combos_2m


# ── JSON helpers ──────────────────────────────────────────────────────────────

def parse_llm_json(raw: str) -> Optional[dict]:
    """Extract and parse a JSON object, tolerating fences/preamble. Fails soft."""
    if not raw:
        return None
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None


# ── Prompt builders ───────────────────────────────────────────────────────────

# Shared core — assembled into both PROMPT_2S_HEADER and PROMPT_2M_HEADER so
# edits only need to happen in one place. Everything between the opening
# sentence and the level descriptions lives here.
_PROMPT_SHARED_CORE = """\
OUTPUT FORMAT:
Respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Begin with { and end with }.
{"articles":[{"genre":"...","headline":"...","body":"..."}]}

JSON SAFETY:
- Each "body" is a SINGLE continuous string. No literal line breaks. Flowing prose in one unbroken string.
- Use the target language's typographic quotation marks — never straight ASCII quotes:
  French: « … » with non-breaking spaces
  German: „…" (low curly opening U+201E, high curly closing U+201C)
  Spanish: «…»
  Italian: «…»
  English: "…"
  Swedish: "…"
  Turkish: "…"
- Never use the straight double-quote character (") inside any field's text.

WRITING RULES:
- Write every article in {LANGUAGE}.
- Write every story from the fact-base — do not skip any. Every genre, every story appears in the output.
- Write original prose. Do not translate the fact-base word-for-word. Never copy phrasing from any source.
- Use only facts from the fact-base. Do not add events, figures, or claims not present. Preserve all attributions exactly.
- FACT ORDER: follow the "what_happened" order from the fact-base. At A1/A2, sentence clarity takes precedence; at B1 and above, follow the order exactly. Do not reorder for stylistic effect.
- GLOSSARY:
  * LITERAL (numbers, specific names of people/places/orgs): reproduce exactly. Numbers may use target language formatting but value must not change. Names not translated.
  * SEMANTIC (descriptive terms, generic descriptors): translate naturally and consistently. Never leave English inside a non-English article.
- Match the journalistic register of a prestige outlet: French→Le Monde, German→Der Spiegel, English→The Guardian (British), Swedish→Dagens Nyheter, Spanish→El País, Italian→Corriere della Sera. STYLE references only.
- ENGLISH VARIANT: IF {LANGUAGE} is English, write exclusively in British English. This applies ONLY to English.
- HEADLINE: same core event and key noun across all versions — strongly parallel, scaled to level, never clickbait.

NEUTRALITY: honour the verified/contested separation. State verified facts plainly; attribute contested ones to their named source. Parallel treatment of opposing parties. Bias hides in grammar — agency, passive voice, loaded verbs. Keep it even.

ARTICLE LENGTH — {LENGTH_LABEL}: Write exactly {SENTENCE_COUNT} sentences per article (~{WORD_COUNT} words). This sentence count is a HARD CONSTRAINT. Never padded. Never truncated mid-thought.

FACTBASE DEPTH — all lengths follow the SAME order of the "what_happened" list in the fact-base. Shorter articles stop earlier in the list; longer articles continue further. Never reorder facts for stylistic effect.
  Concise: Cover facts 1–2 from "what_happened". Skip numbers, attribution, and contested claims unless essential to understand the story.
  Balanced: Cover facts 1–4 from "what_happened" (or all if fewer than 4). Include the key number(s) and one main attribution if present.
  Long-form: Cover facts 1–6 from "what_happened" (or all if fewer than 6). Add the key numbers, main attributions, and contested claims with named sourcing. Reference relevant key_terms where they aid understanding.

THE READING LEVEL IS THE MASTER CONSTRAINT for vocabulary, grammar, and register. Level governs HOW you write each sentence. The article length above governs HOW MANY sentences you write.

READING LEVEL — {LEVEL} ({LEVEL_LABEL}):
"""

# Level descriptions — vocabulary/grammar/register ONLY. No sentence counts
# (those are injected via {SENTENCE_COUNT} in ARTICLE LENGTH above).
_LEVELS_BEGINNER = """\
A1 — Beginner: Subject-verb-object sentences only. Present tense only. ~500 most common words. No subordinate clauses, no conjunctions beyond "and". One plain fact per sentence. Skip all contested nuance, attribution, and numbers unless essential.

A2 — Elementary: Present and simple past. ~1,000 common words. Simple connectors (and, but, because, so). Minimal attribution kept simple.

"""

_LEVELS_B1_PLUS = """\
B1 — Intermediate: Mixed tenses. Moderate vocabulary. One or two topic words explained by context. Simple attribution. No idioms.

B2 — Upper Intermediate: Full range of tenses. Varied sentence structure. Some idiomatic language. Proper attribution of contested claims. Vocabulary of a well-read adult. Clear, confident, purposeful.

C1 — Advanced: Precision and authority of a senior journalist at a prestige outlet. Complex syntax, rich vocabulary, full journalistic register. Always clear and purposeful — never obscure for its own sake.

C2 — Challenge: Dense, demanding educated native prose — complex subordination, abstract nominalisations, layered sentence structures. Difficulty through sophistication, not obscurity.

C2 / Scholar: Long-form essayist register — cultural critic or intellectual commentator. Multi-clause architecture with embedded subordination and apposition. Deliberate rhetorical devices: inversion, ellipsis, parallelism, antithesis. Precise elevated vocabulary. Analytical meta-commentary contextualising the story within broader political, economic, or cultural currents.

"""

_PROMPT_INTRO = (
    "You are the editorial writer for Bilinguist Brief, a language-learning news app. "
    "You receive a pre-gathered fact-base of today's news in British English and rewrite "
    "every story as an original news article in a target language, at the specified "
    "article length and reading level.\n\n"
)

# 2S: serves all levels (A1/A2 + B1+), all three lengths
PROMPT_2S_HEADER = _PROMPT_INTRO + _PROMPT_SHARED_CORE + _LEVELS_BEGINNER + _LEVELS_B1_PLUS + "[FACTBASE BELOW]\n"

# 2M: serves B1+ only, medium and longer lengths
PROMPT_2M_HEADER = _PROMPT_INTRO + _PROMPT_SHARED_CORE + _LEVELS_B1_PLUS + "[FACTBASE BELOW]\n"

PROMPT_3_HEADER = """\
You are a staff journalist writing for the most respected news outlet in {LANGUAGE}.
French → Le Monde. German → Der Spiegel. English → The Guardian (British English throughout — never American). Swedish → Dagens Nyheter. Spanish → El País. Italian → Corriere della Sera.

You receive a pre-gathered fact-base of today's news. Write every story as a complete, polished news article — exactly as a senior staff journalist would publish it. No level constraints. No concessions to learners. Write with authority, clarity, and precision. This is real journalism.

OUTPUT FORMAT:
Respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Begin with { and end with }.
{"articles":[{"genre":"...","slug":"...","headline":"...","body":"..."}]}

JSON SAFETY:
- Each "body" is a SINGLE continuous string. No literal line breaks. Flowing prose in one unbroken string.
- Use the target language's typographic quotation marks — never straight ASCII quotes:
  French: « … » with non-breaking spaces
  German: „…" (low curly opening U+201E, high curly closing U+201C)
  Spanish: «…»
  Italian: «…»
  English: "…"
  Swedish: "…"
- Never use the straight double-quote character (") inside any field's text.

WRITING RULES:
- Write every story from the fact-base. Do not skip any.
- Write in {LANGUAGE}. British English only if English.
- Write original prose from the facts. Never copy source phrasing.
- Use only facts from the fact-base. Preserve all attributions exactly.
- FACT ORDER: follow the "what_happened" sequence exactly. Do not reorder.
- GLOSSARY:
  * LITERAL (numbers, specific names): reproduce exactly. Names not translated.
  * SEMANTIC (descriptive terms): translate naturally and consistently. Never leave English inside a non-English article.
- NEUTRALITY: honour the verified/contested separation. Attribute contested claims to named sources. Parallel treatment of opposing parties. Bias hides in grammar — agency, passive voice, loaded verbs. Keep it even.
- Write to the natural length the story demands — aim for 150–250 words per article. Never pad, never cut mid-thought.
- Include the "slug" from the corresponding fact-base story in each article's slug field.
- Headlines: exactly as a chief sub-editor would write them. Punchy, precise, informative. Never clickbait.

[FACTBASE BELOW]
"""

PROMPT_4_HEADER = """\
You are a CEFR language assessment specialist. You will receive a set of news articles written in {LANGUAGE} by a native journalist. Assess each article and return a structured verdict.

For each article assess:

1. CEFR LEVEL — which level best describes the reading difficulty for a language learner?
   A1 / A2 / B1 / B2 / C1 / C2
   Base your assessment on: sentence length and complexity, vocabulary range, use of tenses, subordinate clauses, idiomatic language, nominalisations, overall register. Be consistent — near-identical prose should receive the same grade across sessions.

2. LENGTH BAND:
   short: under 100 words
   medium: 100–180 words
   longer: over 180 words

OUTPUT FORMAT:
Respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Begin with { and end with }.

{"assessments":[{
  "genre":"...",
  "slug":"...",
  "level":"B1",
  "length":"medium",
  "reasoning":"one sentence explaining the level assessment"
}]}

Be decisive. One level per article, one length band per article. The app uses these verdicts to dynamically reposition the native article in the level selector — consistency matters more than nuance.

[NATIVE ARTICLES BELOW]
"""


def build_writing_prompt(template: str, lang: str, level: str, length: str, factbase: list) -> str:
    """Build a complete prompt by injecting variables and appending the factbase."""
    level_display = NATIVE_WRITING_LEVEL if level == "Native" else level
    label = LEVEL_LABELS.get(level, level)
    is_beginner = level in ("A1", "A2")
    words_table = WORDS_PER_ARTICLE_BEGINNER if is_beginner else WORDS_PER_ARTICLE_ADVANCED
    word_count = words_table[length]
    sentence_table = SENTENCES_PER_ARTICLE_A1 if level == "A1" else SENTENCES_PER_ARTICLE_STANDARD
    sentence_count = sentence_table[length]
    lang_name = LANGUAGE_NAMES.get(lang, lang)

    length_labels = {"short": "Concise", "medium": "Balanced", "longer": "Long-form"}
    length_label = length_labels.get(length, length)

    prompt = template
    prompt = prompt.replace("{LANGUAGE}", lang_name)
    prompt = prompt.replace("{LEVEL}", level_display)
    prompt = prompt.replace("{LEVEL_LABEL}", label)
    prompt = prompt.replace("{WORD_COUNT}", str(word_count))
    prompt = prompt.replace("{SENTENCE_COUNT}", sentence_count)
    prompt = prompt.replace("{LENGTH_LABEL}", length_label)

    factbase_json = json.dumps(factbase, ensure_ascii=False, indent=2)
    prompt += f"\n{factbase_json}"
    return prompt


def build_native_prompt(lang: str, factbase: list) -> str:
    """Build the native journalism prompt for one language."""
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = PROMPT_3_HEADER.replace("{LANGUAGE}", lang_name)
    factbase_json = json.dumps(factbase, ensure_ascii=False, indent=2)
    prompt += f"\n{factbase_json}"
    return prompt


def build_grading_prompt(lang: str, native_articles: list) -> str:
    """Build the grading prompt for one language's native journalism."""
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = PROMPT_4_HEADER.replace("{LANGUAGE}", lang_name)
    articles_json = json.dumps({"articles": native_articles}, ensure_ascii=False, indent=2)
    prompt += f"\n{articles_json}"
    return prompt


# ── Direct API call helper ────────────────────────────────────────────────────

def call_gemini(
    client: genai.Client, model: str, prompt: str, label: str,
    stage: Optional[str] = None,
) -> Optional[str]:
    """
    Call generate_content() directly with retry logic for transient errors.
    Uses a shared semaphore to cap concurrent inflight requests.
    Records token usage in _stage_usage[stage] when stage is provided.
    Returns the raw text response or None on failure.
    """
    for attempt in range(MAX_RETRIES + 1):
        try:
            with _API_SEMAPHORE:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        response_mime_type="application/json",
                    ),
                )
            # Accumulate token usage for cost tracking
            if stage and stage in _stage_usage:
                um = response.usage_metadata
                if um:
                    inp = getattr(um, "prompt_token_count",     0) or 0
                    out = getattr(um, "candidates_token_count", 0) or 0
                    thi = getattr(um, "thoughts_token_count",   0) or 0
                    with _usage_lock:
                        u = _stage_usage[stage]
                        u.calls           += 1
                        u.input_tokens    += inp
                        u.output_tokens   += out
                        u.thinking_tokens += thi
            return response.text
        except Exception as e:
            code = getattr(e, "code", None) or getattr(e, "status_code", None)
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                print(f"[{label}] Attempt {attempt + 1} failed (code={code}): {e} — retrying in {delay}s",
                      file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[{label}] All {MAX_RETRIES + 1} attempts failed: {e}", file=sys.stderr)
                return None
    return None


# ── Cost report ───────────────────────────────────────────────────────────────

def write_costs_report(date: str, script_dir: str) -> dict:
    """
    Reads gather usage from factbase_<date>.json, combines with accumulated stage
    costs, writes output/costs_<date>.json, and returns the cost dict.
    """
    gather_usage: dict = {}
    gather_model = "gemini-2.5-pro"
    factbase_path = os.path.join(script_dir, f"factbase_{date}.json")
    if os.path.exists(factbase_path):
        try:
            with open(factbase_path, encoding="utf-8") as f:
                fb = json.load(f)
            gather_usage = fb.get("usage_metadata", {}) or {}
            gather_model = fb.get("model", "gemini-2.5-pro")
        except Exception:
            pass

    costs: dict = {"date": date, "stages": {}, "total_usd": 0.0, "total_gbp": 0.0}

    # Gather stage (Pro Flex pricing)
    if gather_usage:
        g_in  = gather_usage.get("prompt_token_count",          0) or 0
        g_out = gather_usage.get("candidates_token_count",      0) or 0
        g_thi = gather_usage.get("thoughts_token_count",        0) or 0
        g_usd = (
            (g_in  / 1_000_000) * PRO_FLEX_INPUT_USD_PER_M
            + (g_out / 1_000_000) * PRO_FLEX_OUTPUT_USD_PER_M
            + (g_thi / 1_000_000) * PRO_FLEX_THINK_USD_PER_M
        )
        costs["stages"]["1_gather"] = {
            "model":          gather_model,
            "calls":          1,
            "input_tokens":   g_in,
            "output_tokens":  g_out,
            "thinking_tokens": g_thi,
            "cost_usd":       round(g_usd, 4),
            "cost_gbp":       round(g_usd * USD_TO_GBP, 4),
        }
        costs["total_usd"] += g_usd

    # Write / grade stages (all Flash)
    for sname, usage in _stage_usage.items():
        in_usd  = (usage.input_tokens    / 1_000_000) * FLASH_INPUT_USD_PER_M
        out_usd = (usage.output_tokens   / 1_000_000) * FLASH_OUTPUT_USD_PER_M
        thi_usd = (usage.thinking_tokens / 1_000_000) * FLASH_THINK_USD_PER_M
        s_usd   = in_usd + out_usd + thi_usd
        costs["stages"][sname] = {
            "model":          "gemini-2.5-flash",
            "calls":          usage.calls,
            "input_tokens":   usage.input_tokens,
            "output_tokens":  usage.output_tokens,
            "thinking_tokens": usage.thinking_tokens,
            "cost_usd":       round(s_usd, 4),
            "cost_gbp":       round(s_usd * USD_TO_GBP, 4),
        }
        costs["total_usd"] += s_usd

    costs["total_usd"] = round(costs["total_usd"], 4)
    costs["total_gbp"] = round(costs["total_usd"] * USD_TO_GBP, 4)

    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    costs_path = os.path.join(output_dir, f"costs_{date}.json")
    with open(costs_path, "w", encoding="utf-8") as f:
        json.dump(costs, f, indent=2)

    print(f"[costs] Total: ${costs['total_usd']:.4f} (£{costs['total_gbp']:.4f})")
    for sname, sdata in costs["stages"].items():
        print(
            f"[costs]   {sname}: {sdata['calls']} calls, "
            f"{sdata['input_tokens']:,} in + {sdata['output_tokens']:,} out"
            f" = ${sdata['cost_usd']:.4f}"
        )

    return costs


# ── Stage runners ─────────────────────────────────────────────────────────────

def run_writing_concurrent(
    client: genai.Client,
    factbase: list,
    generated_at: int,
    date: str,
) -> tuple[dict, dict]:
    """
    Run stages 2S, 2M, and 3 concurrently using direct generate_content() calls.
    Returns (briefings, native_journalism).
    """
    combos_2s, combos_2m = build_combinations()
    native_langs = list(LANGUAGE_LEVELS.keys())

    # Build task list: (stage, lang, level, length, model, prompt)
    tasks: list[tuple[str, str, Optional[str], Optional[str], str, str]] = []

    for lang, level, length in combos_2s:
        prompt = build_writing_prompt(PROMPT_2S_HEADER, lang, level, length, factbase)
        tasks.append(("2S", lang, level, length, MODEL_2S, prompt))

    for lang, level, length in combos_2m:
        prompt = build_writing_prompt(PROMPT_2M_HEADER, lang, level, length, factbase)
        tasks.append(("2M", lang, level, length, MODEL_2M, prompt))

    for lang in native_langs:
        prompt = build_native_prompt(lang, factbase)
        tasks.append(("3", lang, None, None, MODEL_3, prompt))

    print(f"[write] Running {len(tasks)} writing requests concurrently (max {_MAX_WORKERS} at a time)...")

    briefings: dict = {}
    native_journalism: dict = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_meta = {
            executor.submit(call_gemini, client, model, prompt, f"{stage}/{lang}", stage): (stage, lang, level, length)
            for stage, lang, level, length, model, prompt in tasks
        }

        for future in as_completed(future_to_meta):
            stage, lang, level, length = future_to_meta[future]
            label = f"{stage}/{lang}-{level}-{length}" if level else f"{stage}/{lang}"
            raw = future.result()

            if not raw:
                print(f"[{stage}] SKIP {lang}-{level}-{length}: no response", file=sys.stderr)
                continue

            parsed = parse_llm_json(raw)
            if not parsed:
                print(f"[{stage}] SKIP {lang}-{level}-{length}: JSON parse failed", file=sys.stderr)
                continue

            if stage in ("2S", "2M"):
                articles = parsed.get("articles", [])
                if not articles:
                    print(f"[{stage}] SKIP {lang}-{level}-{length}: empty articles list", file=sys.stderr)
                    continue
                briefings.setdefault(lang, {}).setdefault(level, {})[length] = {
                    "articles": articles,
                    "date": date,
                    "language": lang,
                    "level": level,
                    "length": length,
                    "generatedAt": generated_at,
                }
                print(f"[{stage}] {lang}-{level}-{length}: {len(articles)} articles ✓")

            elif stage == "3":
                articles = parsed.get("articles", [])
                if not articles:
                    print(f"[3] SKIP {lang}: empty native articles", file=sys.stderr)
                    continue
                native_journalism[lang] = articles
                print(f"[3] {lang}: {len(articles)} native articles ✓")

    return briefings, native_journalism


def run_grading(
    client: genai.Client,
    native_journalism: dict,
) -> dict:
    """Run Stage 4 grading with direct concurrent calls. Returns grading dict."""
    langs_with_articles = [lang for lang, arts in native_journalism.items() if arts]
    if not langs_with_articles:
        print("[4] No native articles to grade — skipping", file=sys.stderr)
        return {}

    print(f"[4] Grading {len(langs_with_articles)} languages...")
    grading: dict = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_lang = {
            executor.submit(
                call_gemini, client, MODEL_4,
                build_grading_prompt(lang, native_journalism[lang]),
                f"4/{lang}",
                "4",
            ): lang
            for lang in langs_with_articles
        }

        for future in as_completed(future_to_lang):
            lang = future_to_lang[future]
            raw = future.result()
            if not raw:
                print(f"[4] SKIP {lang}: no response", file=sys.stderr)
                grading[lang] = []
                continue
            parsed = parse_llm_json(raw)
            assessments = parsed.get("assessments", []) if parsed else []
            grading[lang] = assessments
            print(f"[4] {lang}: {len(assessments)} assessments ✓")

    return grading


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Bilinguist Brief — writing/grading pipeline")
    parser.add_argument("--date", help="Override date (YYYY-MM-DD). Defaults to today UTC.")
    args = parser.parse_args()

    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"[write] Starting writing/grading pipeline — {date}")

    # Locate the factbase produced by Stage 1
    script_dir = os.path.dirname(os.path.abspath(__file__))
    factbase_path = os.path.join(script_dir, f"factbase_{date}.json")
    if not os.path.exists(factbase_path):
        print(f"[write] ERROR: Factbase not found at {factbase_path}", file=sys.stderr)
        print("[write] Run bilinguist_gather.py first.", file=sys.stderr)
        sys.exit(1)

    with open(factbase_path, "r", encoding="utf-8") as f:
        gather_output = json.load(f)

    factbase = gather_output.get("factbase", [])
    gather_source = gather_output.get("model", "gemini")
    print(f"[write] Loaded {len(factbase)} stories from factbase (source: {gather_source})")

    combos_2s, combos_2m = build_combinations()
    print(f"[write] Matrix: {len(combos_2s)} 2S requests + {len(combos_2m)} 2M requests + {len(ACTIVE_LANGUAGES)} native + {len(ACTIVE_LANGUAGES)} grading")
    for lang in ACTIVE_LANGUAGES:
        print(f"[write]   {lang}: {', '.join(LANGUAGE_LEVELS[lang])}")

    # Initialise Gemini client
    client = genai.Client()
    print("[write] Gemini client initialised")

    # ── Stages 2S + 2M + 3 — run concurrently ────────────────────────────────
    briefings, native_journalism = run_writing_concurrent(client, factbase, 0, date)
    # Stamp generatedAt AFTER writing completes so "Published at" shows when
    # articles finished, not when the pipeline launched (which can be minutes
    # earlier when Gemini is returning 503s and retrying).
    generated_at = int(datetime.now(timezone.utc).timestamp() * 1000)
    for _ld in briefings.values():
        for _lvl in _ld.values():
            for _b in _lvl.values():
                _b["generatedAt"] = generated_at

    total_briefings = sum(
        1
        for lang_data in briefings.values()
        for level_data in lang_data.values()
        for _ in level_data.values()
    )
    print(f"[write] Writing done: {total_briefings} / {len(combos_2s) + len(combos_2m)} briefings assembled")

    # ── Stage 4 — grading (depends on Stage 3 output) ────────────────────────
    grading = run_grading(client, native_journalism)

    # ── Cost report ───────────────────────────────────────────────────────────
    write_costs_report(date, script_dir)

    # ── Assemble DailyBundle ──────────────────────────────────────────────────
    bundle = {
        "date": date,
        "generatedAt": generated_at,
        "factbase": factbase,
        "gatherSource": "gemini",
        "briefings": briefings,
        "nativeJournalism": native_journalism,
        "grading": grading,
    }

    # ── Write output files ────────────────────────────────────────────────────
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)

    bundle_json = json.dumps(bundle, ensure_ascii=False, indent=2)
    dated_path  = os.path.join(output_dir, f"{date}.json")
    latest_path = os.path.join(output_dir, "latest.json")

    with open(dated_path,  "w", encoding="utf-8") as f:
        f.write(bundle_json)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(bundle_json)

    approx_kb = len(bundle_json.encode("utf-8")) // 1024
    print(f"[write] Done — output/{date}.json ({approx_kb} KB)")
    print(f"[write] Briefings: {total_briefings} | Native: {sum(len(v) for v in native_journalism.values())} | Gradings: {sum(len(v) for v in grading.values())}")


if __name__ == "__main__":
    main()

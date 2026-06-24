"""
bilinguist_write.py
===================
Stages 2S, 2B, 2M, 3, and 4 of the Bilinguist Brief daily pipeline.

Reads the factbase produced by bilinguist_gather.py and:
  2S — Short writing (B1+)  : gemini-2.5-flash  Concurrent  B1+/Native short
  2B — Beginner writing     : gemini-2.5-flash  Concurrent  A1/A2 all lengths
  2M — Medium/long (B1+)    : gemini-2.5-flash  Concurrent  B1+/Native medium (2 batches) + longer (3 batches)
  3  — Native journalism    : gemini-2.5-flash  Concurrent  one per language (2 proactive batches)
  4  — Grading              : gemini-2.5-flash  Sequential  grades Stage 3 output

Proactive splitting (2M and 3): medium→2 batches, longer→3 batches, native→2 batches.
This eliminates MAX_TOKENS cascades by keeping each output stream well within 8192 tokens.

A1/A2 tasks run on gemini-2.5-flash (same model as B1+). Article output for beginner
levels is small enough (~110–190 words × 10 stories) that proactive splitting is not needed.

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

MODEL_BEGINNER = "gemini-2.5-flash"          # A1/A2: same model as B1+ for reliability
MODEL_2S = "gemini-2.5-flash"               # B1+/Native short lengths
MODEL_2M = "gemini-2.5-flash"               # B1+/Native medium and longer
MODEL_3  = "gemini-2.5-flash"               # Native journalism, one per language
MODEL_4A = "gemini-2.0-flash-lite"          # P4a: grade native journalism → overall CEFR level
MODEL_4B = "gemini-2.0-flash-lite"          # P4b: grade CEFR level articles (quality gate)

# Concurrency limit — 6 workers balances throughput against Gemini Flash demand
# spikes (503s); 10 workers caused cascade failures when the API was under load.
_MAX_WORKERS   = 6
_API_SEMAPHORE = threading.Semaphore(_MAX_WORKERS)

# Retry settings for transient API errors (503 high-demand spikes need longer waits)
MAX_RETRIES   = 4
RETRY_DELAYS  = [30, 60, 120, 180]   # seconds between retries

# ── Response schemas ──────────────────────────────────────────────────────────
# Passed as response_schema to GenerateContentConfig on write stages so the API
# engine enforces output structure — replaces prompt-pressure JSON instructions.

_SCHEMA_WRITING = {
    "type": "object",
    "properties": {
        "articles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "genre":    {"type": "string"},
                    "headline": {"type": "string"},
                    "body":     {"type": "string"},
                },
                "required": ["genre", "headline", "body"],
            },
        },
    },
    "required": ["articles"],
}

_SCHEMA_NATIVE = {
    "type": "object",
    "properties": {
        "articles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "genre":    {"type": "string"},
                    "slug":     {"type": "string"},
                    "headline": {"type": "string"},
                    "body":     {"type": "string"},
                },
                "required": ["genre", "slug", "headline", "body"],
            },
        },
    },
    "required": ["articles"],
}

_SCHEMA_GRADING = {
    "type": "object",
    "properties": {
        "assessments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "genre":     {"type": "string"},
                    "slug":      {"type": "string"},
                    "level":     {"type": "string", "enum": ["A1", "A2", "B1", "B2", "C1", "C2"]},
                    "length":    {"type": "string", "enum": ["short", "medium", "longer"]},
                    "reasoning": {"type": "string"},
                },
                "required": ["genre", "slug", "level", "length", "reasoning"],
            },
        },
    },
    "required": ["assessments"],
}

# P4a schema — single overall CEFR level per language (one call per language)
_SCHEMA_GRADE_NATIVE = {
    "type": "object",
    "properties": {
        "cefr_level": {"type": "string", "enum": ["A1", "A2", "B1", "B2", "C1", "C2"]},
        "reasoning":  {"type": "string"},
    },
    "required": ["cefr_level", "reasoning"],
}


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
    "2B": _StageUsage(),
    "2M": _StageUsage(),
    "3":  _StageUsage(),
    "4a": _StageUsage(),  # grade native journalism → overall CEFR level (Flash-Lite)
    "4b": _StageUsage(),  # grade CEFR level articles (Flash-Lite)
}


@dataclass
class _WriteTask:
    stage: str
    lang: str
    level: Optional[str]
    length: Optional[str]
    model: str
    prompt: str
    schema: Optional[dict]
    max_output_tokens: Optional[int]
    template: Optional[str]   # stored for proactive split-batch prompt building
    factbase: Optional[list]  # stored for proactive split-batch prompt building
    n_splits: int = 1         # 1 = single call; >1 = proactive split into N batches

# Gemini 2.5 Flash pricing (USD per 1M tokens) — verify at ai.google.dev/pricing
FLASH_INPUT_USD_PER_M  = 0.30
FLASH_OUTPUT_USD_PER_M = 2.50
FLASH_THINK_USD_PER_M  = 3.50

# Gemini 2.0 Flash pricing (no thinking tokens) — verify at ai.google.dev/pricing
FLASH2_INPUT_USD_PER_M  = 0.10
FLASH2_OUTPUT_USD_PER_M = 0.40

# Gemini 2.0 Flash-Lite pricing — verify at ai.google.dev/pricing
FLASH_LITE_INPUT_USD_PER_M  = 0.075
FLASH_LITE_OUTPUT_USD_PER_M = 0.30

# Gemini 2.5 Pro Flex pricing (50 % discount over standard Pro rates)
PRO_FLEX_INPUT_USD_PER_M  = 0.625   # standard $1.25 × 0.5
PRO_FLEX_OUTPUT_USD_PER_M = 5.00    # standard $10.00 × 0.5
PRO_FLEX_THINK_USD_PER_M  = 1.75    # standard $3.50 × 0.5

USD_TO_GBP = 0.79  # approximate — update as needed


# ── CEFR ordering (used by skip logic in build_combinations) ─────────────────
# Levels in ascending difficulty. P4a grades native journalism to a position in
# this list; P2S/2M then only writes levels strictly below that position.
CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "Native"]

# ── Language / level matrix ───────────────────────────────────────────────────
# Testing phase matrix — add languages/levels here as pipeline is validated.

LANGUAGE_LEVELS: dict[str, list[str]] = {
    "fr": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "de": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "sv": ["B2", "Native"],
    "en": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "it": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "es": ["A2"],
    "tr": ["A1"],
    "hu": ["Native"],  # Hungarian — native journalism only; CEFR levels added after P4a validation
}

LANGUAGE_NAMES: dict[str, str] = {
    "fr": "French",
    "de": "German",
    "en": "English",
    "sv": "Swedish",
    "es": "Spanish",
    "it": "Italian",
    "tr": "Turkish",
    "hu": "Hungarian",
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

WORDS_PER_ARTICLE_BEGINNER: dict[str, str] = {  # A1 / A2
    "short":  "65–85",
    "longer": "170–220",
}
WORDS_PER_ARTICLE_ADVANCED: dict[str, str] = {  # B1+
    "short":  "75–105",
    "longer": "270–340",
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

def build_combinations(
    native_grades: Optional[dict] = None,
) -> tuple[list[tuple[str, str, str]], list[tuple[str, str, str]]]:
    """
    Returns (combos_2s, combos_2m).
    combos_2s → short length for all eligible CEFR levels
    combos_2m → medium + longer for all eligible CEFR levels

    native_grades: dict[lang, cefr_level] from P4a. For each language, levels at
    or above the native grade are skipped — P3 native journalism already covers them.
    "Native" is always excluded from P2 (Stage 3 handles it).
    """
    combos_2s: list[tuple[str, str, str]] = []
    combos_2m: list[tuple[str, str, str]] = []

    for lang, levels in LANGUAGE_LEVELS.items():
        # Determine the skip threshold from P4a output
        skip_from_idx = len(CEFR_ORDER)  # default: skip nothing
        if native_grades and lang in native_grades:
            native_cefr = native_grades[lang]
            if native_cefr in CEFR_ORDER:
                skip_from_idx = CEFR_ORDER.index(native_cefr)

        for level in levels:
            if level == "Native":
                continue  # always handled by Stage 3
            if level not in CEFR_ORDER:
                continue
            if CEFR_ORDER.index(level) >= skip_from_idx:
                continue  # at or above native grade — skip
            combos_2s.append((lang, level, "short"))
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
  Hungarian: „…" (same low-high curly style as German)

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

ARTICLE LENGTH — {LENGTH_LABEL}: Write exactly {SENTENCE_COUNT} sentences per article ({WORD_COUNT} words). This sentence count is a HARD CONSTRAINT. Never padded. Never truncated mid-thought.

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

"""

_PROMPT_INTRO = (
    "You are the editorial writer for Bilinguist Brief, a language-learning news app. "
    "You receive a pre-gathered fact-base of today's news in British English and rewrite "
    "every story as an original news article in a target language, at the specified "
    "article length and reading level.\n\n"
)

# Used for both 2S (B1+ short) and 2B (A1/A2 all lengths) — contains all level descriptions
PROMPT_2S_HEADER = _PROMPT_INTRO + _PROMPT_SHARED_CORE + _LEVELS_BEGINNER + _LEVELS_B1_PLUS + "[FACTBASE BELOW]\n"

# 2M: B1+/Native medium and longer only
PROMPT_2M_HEADER = _PROMPT_INTRO + _PROMPT_SHARED_CORE + _LEVELS_B1_PLUS + "[FACTBASE BELOW]\n"

PROMPT_3_HEADER = """\
You are a staff journalist writing for the most respected news outlet in {LANGUAGE}.
French → Le Monde. German → Der Spiegel. English → The Guardian (British English throughout — never American). Swedish → Dagens Nyheter. Spanish → El País. Italian → Corriere della Sera. Hungarian → HVG.

You receive a pre-gathered fact-base of today's news. Write every story as a complete, polished news article — exactly as a senior staff journalist would publish it. No level constraints. No concessions to learners. Write with authority, clarity, and precision. This is real journalism.

OUTPUT FORMAT:
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
  Hungarian: „…" (same low-high curly style as German)

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
- Write to the natural length the story demands — aim for 200–300 words per article. Never pad, never cut mid-thought.
- Include the "slug" from the corresponding fact-base story in each article's slug field.
- Headlines: exactly as a chief sub-editor would write them. Punchy, precise, informative. Never clickbait.

[FACTBASE BELOW]
"""

# Prompt 4 length bands (short <100 / medium 100–180 / longer >180) are calibrated
# explicitly for unconstrained Native journalism text lengths; do not map these bands
# directly against learner text generation.
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

CALIBRATION EXAMPLES — anchor your grading against these two reference texts. Both are in French; the same complexity principles apply across all languages:

B1 — Intermediate:
"Les dirigeants du G7 se sont réunis pour parler de l'économie mondiale. Ils ont discuté de l'inflation et du commerce international. Les pays membres ont décidé de travailler ensemble pour trouver des solutions. Un porte-parole a dit que les discussions ont été positives."
Why B1: Short subject-verb-object sentences. Common vocabulary. Simple past tense throughout. One fact per sentence. No subordinate clauses, no idiomatic language.

C1 — Advanced:
"Réunis en sommet extraordinaire pour la deuxième fois en six mois, les chefs d'État du G7 ont adopté, non sans heurts diplomatiques, une déclaration commune appelant à une coordination renforcée des politiques monétaires face à une inflation persistante qui continue d'éroder le pouvoir d'achat des ménages dans l'ensemble des économies avancées."
Why C1: Participial opening clause, embedded relative clauses, abstract nominalisations (coordination renforcée, le pouvoir d'achat), journalistic hedging register (non sans heurts), dense multi-clause sentence architecture.

OUTPUT FORMAT:
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


PROMPT_4A_HEADER = """\
You are a CEFR language assessment specialist. You will receive a set of news articles written in {LANGUAGE} by a native journalist.

Assess the collection as a whole and return the single CEFR level that best describes the overall reading difficulty for a language learner.

CEFR levels: A1 / A2 / B1 / B2 / C1 / C2

Base your assessment on: sentence length and complexity, vocabulary range, use of tenses, subordinate clauses, idiomatic language, nominalisations, overall register. Return the dominant level across all articles — the level that fits the majority. Ignore outliers.

OUTPUT FORMAT:
{"cefr_level": "B2", "reasoning": "one sentence explaining the assessment"}

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

    factbase_json = json.dumps(factbase, ensure_ascii=False, separators=(',', ':'))
    prompt += f"\n{factbase_json}"
    return prompt


def build_native_prompt(lang: str, factbase: list) -> str:
    """Build the native journalism prompt for one language."""
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = PROMPT_3_HEADER.replace("{LANGUAGE}", lang_name)
    factbase_json = json.dumps(factbase, ensure_ascii=False, separators=(',', ':'))
    prompt += f"\n{factbase_json}"
    return prompt


def build_grading_prompt(lang: str, native_articles: list) -> str:
    """Build the P4b grading prompt for one language's CEFR-level articles."""
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = PROMPT_4_HEADER.replace("{LANGUAGE}", lang_name)
    articles_json = json.dumps({"articles": native_articles}, ensure_ascii=False, indent=2)
    prompt += f"\n{articles_json}"
    return prompt


def build_grade_native_prompt(lang: str, native_articles: list) -> str:
    """Build the P4a prompt: assess overall CEFR level of native journalism batch."""
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = PROMPT_4A_HEADER.replace("{LANGUAGE}", lang_name)
    articles_json = json.dumps({"articles": native_articles}, ensure_ascii=False, indent=2)
    prompt += f"\n{articles_json}"
    return prompt


# ── Direct API call helper ────────────────────────────────────────────────────

def call_gemini(
    client: genai.Client, model: str, prompt: str, label: str,
    stage: Optional[str] = None,
    schema: Optional[dict] = None,
    max_output_tokens: Optional[int] = None,
) -> tuple[Optional[str], Optional[str]]:
    """
    Call generate_content() directly with retry logic for transient errors.
    Uses a shared semaphore to cap concurrent inflight requests.
    Records token usage in _stage_usage[stage] when stage is provided.
    Returns (text, finish_reason). finish_reason is None on normal completion
    or "MAX_TOKENS" when the response was truncated.
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
                        response_schema=schema,
                        max_output_tokens=max_output_tokens,
                        thinking_config=types.ThinkingConfig(thinking_budget=0),
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
            # Detect truncation
            finish_reason = None
            if response.candidates:
                fr = response.candidates[0].finish_reason
                if fr is not None:
                    finish_reason = fr.name if hasattr(fr, "name") else str(fr)
            if finish_reason == "MAX_TOKENS":
                print(f"[ERROR] [{label}] MAX_TOKENS — response truncated",
                      file=sys.stderr)
                return response.text, "MAX_TOKENS"
            return response.text, None
        except Exception as e:
            code = getattr(e, "code", None) or getattr(e, "status_code", None)
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                print(f"[{label}] Attempt {attempt + 1} failed (code={code}): {e} — retrying in {delay}s",
                      file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[ERROR] [{label}] All {MAX_RETRIES + 1} attempts failed: {e}", file=sys.stderr)
                return None, None
    return None, None


# ── Task executor (handles proactive splitting) ───────────────────────────────

def _execute_task(client: genai.Client, task: _WriteTask) -> list[dict]:
    """
    Execute a write task. If n_splits == 1, makes a single API call.
    If n_splits > 1, slices the factbase into N parts, calls each, and merges.
    Returns the merged articles list (empty on total failure).
    """
    label = (f"{task.stage}/{task.lang}-{task.level}-{task.length}"
             if task.level else f"{task.stage}/{task.lang}")

    if task.n_splits == 1:
        raw, finish_reason = call_gemini(
            client, task.model, task.prompt, label,
            task.stage, task.schema, task.max_output_tokens,
        )
        if not raw:
            print(f"[ERROR] [{task.stage}] {label}: no response — output incomplete", file=sys.stderr)
            return []
        if finish_reason == "MAX_TOKENS":
            print(f"[ERROR] [{label}] MAX_TOKENS on single call — output incomplete", file=sys.stderr)
            return []
        parsed = parse_llm_json(raw)
        if not parsed:
            print(f"[ERROR] [{task.stage}] {label}: JSON parse failed — output incomplete", file=sys.stderr)
            return []
        articles = parsed.get("articles", [])
        if not articles:
            print(f"[ERROR] [{task.stage}] {label}: empty articles list — output incomplete", file=sys.stderr)
        return articles

    # Proactive split: divide factbase into n_splits slices
    factbase = task.factbase or []
    n = task.n_splits
    size = max(1, len(factbase) // n)
    slices = [factbase[i * size:(i + 1) * size] for i in range(n - 1)]
    slices.append(factbase[(n - 1) * size:])
    slices = [s for s in slices if s]  # drop empty tail slices

    all_articles: list[dict] = []
    for i, fb_slice in enumerate(slices):
        if task.stage in ("2S", "2B", "2M"):
            sub_prompt = build_writing_prompt(
                task.template, task.lang, task.level, task.length, fb_slice
            )
        else:  # stage "3"
            sub_prompt = build_native_prompt(task.lang, fb_slice)
        sub_label = f"{label}-p{i + 1}"
        text, reason = call_gemini(
            client, task.model, sub_prompt, sub_label,
            task.stage, task.schema, task.max_output_tokens,
        )
        if reason == "MAX_TOKENS":
            print(f"[ERROR] [{sub_label}] MAX_TOKENS on proactive split part — skipping",
                  file=sys.stderr)
            continue
        if text:
            parsed = parse_llm_json(text)
            if parsed:
                all_articles.extend(parsed.get("articles", []))

    if not all_articles:
        print(f"[ERROR] [{label}] no articles after {n}-way proactive split", file=sys.stderr)
    return all_articles


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
            "model":           gather_model,
            "calls":           1,
            "input_tokens":    g_in,
            "output_tokens":   g_out,
            "thinking_tokens": g_thi,
            "cost_usd":        round(g_usd, 4),
            "cost_gbp":        round(g_usd * USD_TO_GBP, 4),
        }
        costs["total_usd"] += g_usd

    # Write / grade stages — Flash-Lite for 4a/4b, Flash 2.5 for everything else
    FLASH_LITE_STAGES = {"4a", "4b"}
    for sname, usage in _stage_usage.items():
        if sname in FLASH_LITE_STAGES:
            in_usd  = (usage.input_tokens  / 1_000_000) * FLASH_LITE_INPUT_USD_PER_M
            out_usd = (usage.output_tokens / 1_000_000) * FLASH_LITE_OUTPUT_USD_PER_M
            thi_usd = 0.0
            model_name = "gemini-2.0-flash-lite"
        else:
            in_usd  = (usage.input_tokens    / 1_000_000) * FLASH_INPUT_USD_PER_M
            out_usd = (usage.output_tokens   / 1_000_000) * FLASH_OUTPUT_USD_PER_M
            thi_usd = (usage.thinking_tokens / 1_000_000) * FLASH_THINK_USD_PER_M
            model_name = "gemini-2.5-flash"
        s_usd = in_usd + out_usd + thi_usd
        costs["stages"][sname] = {
            "model":           model_name,
            "calls":           usage.calls,
            "input_tokens":    usage.input_tokens,
            "output_tokens":   usage.output_tokens,
            "thinking_tokens": usage.thinking_tokens,
            "cost_usd":        round(s_usd, 4),
            "cost_gbp":        round(s_usd * USD_TO_GBP, 4),
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
            f"[costs]   {sname} ({sdata['model']}): {sdata['calls']} calls, "
            f"{sdata['input_tokens']:,} in + {sdata['output_tokens']:,} out"
            f" = ${sdata['cost_usd']:.4f}"
        )

    return costs


# ── Stage runners ─────────────────────────────────────────────────────────────

def run_native_journalism(
    client: genai.Client,
    factbase: list,
) -> dict:
    """Stage 3 — generate native journalism for all languages. Returns native_journalism dict."""
    native_langs = list(LANGUAGE_LEVELS.keys())
    tasks: list[_WriteTask] = [
        _WriteTask(
            stage="3", lang=lang, level=None, length=None,
            model=MODEL_3, prompt=build_native_prompt(lang, factbase),
            schema=_SCHEMA_NATIVE, max_output_tokens=8192,
            template=PROMPT_3_HEADER, factbase=factbase, n_splits=2,
        )
        for lang in native_langs
    ]

    print(f"[3] Generating native journalism for {len(native_langs)} languages...")
    native_journalism: dict = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_task = {executor.submit(_execute_task, client, t): t for t in tasks}
        for future in as_completed(future_to_task):
            task = future_to_task[future]
            articles = future.result()
            if articles:
                native_journalism[task.lang] = articles
                print(f"[3] {task.lang}: {len(articles)} native articles ✓")

    return native_journalism


def run_grade_native(
    client: genai.Client,
    native_journalism: dict,
) -> dict:
    """
    Stage P4a — grade native journalism to determine overall CEFR level per language.
    Returns dict[lang → cefr_level_str]. Uses gemini-2.0-flash-lite (classification only).
    """
    langs_with_articles = [lang for lang, arts in native_journalism.items() if arts]
    if not langs_with_articles:
        print("[4a] No native articles to grade — skipping", file=sys.stderr)
        return {}

    print(f"[4a] Grading native journalism level for {len(langs_with_articles)} languages...")
    native_grades: dict = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_lang = {
            executor.submit(
                call_gemini, client, MODEL_4A,
                build_grade_native_prompt(lang, native_journalism[lang]),
                f"4a/{lang}", "4a", _SCHEMA_GRADE_NATIVE,
            ): lang
            for lang in langs_with_articles
        }

        for future in as_completed(future_to_lang):
            lang = future_to_lang[future]
            raw, finish_reason = future.result()
            if not raw:
                print(f"[ERROR] [4a] {lang}: no response — using default B2", file=sys.stderr)
                native_grades[lang] = "B2"
                continue
            parsed = parse_llm_json(raw)
            cefr = parsed.get("cefr_level") if parsed else None
            if not cefr or cefr not in CEFR_ORDER:
                print(f"[ERROR] [4a] {lang}: unparseable level '{cefr}' — using default B2",
                      file=sys.stderr)
                native_grades[lang] = "B2"
                continue
            reasoning = (parsed.get("reasoning") or "")[:120]
            native_grades[lang] = cefr
            print(f"[4a] {lang}: {cefr} — {reasoning}")

    return native_grades


def run_writing_concurrent(
    client: genai.Client,
    factbase: list,
    generated_at: int,
    date: str,
    native_grades: Optional[dict] = None,
) -> dict:
    """
    Stages 2S, 2B, 2M — write CEFR level articles.
    Levels at or above native_grades[lang] are skipped (P3 already covers them).
    Returns briefings dict.
    """
    combos_2s, combos_2m = build_combinations(native_grades)

    tasks: list[_WriteTask] = []

    # Short combos — A1/A2 → 2B, B1+ → 2S
    for lang, level, length in combos_2s:
        is_beginner = level in ("A1", "A2")
        stage = "2B" if is_beginner else "2S"
        model = MODEL_BEGINNER if is_beginner else MODEL_2S
        prompt = build_writing_prompt(PROMPT_2S_HEADER, lang, level, length, factbase)
        tasks.append(_WriteTask(
            stage=stage, lang=lang, level=level, length=length,
            model=model, prompt=prompt, schema=_SCHEMA_WRITING,
            max_output_tokens=8192, template=PROMPT_2S_HEADER, factbase=factbase,
            n_splits=1,
        ))

    # Medium/longer combos — A1/A2 → 2B, B1+ → 2M with proactive splitting
    for lang, level, length in combos_2m:
        is_beginner = level in ("A1", "A2")
        stage = "2B" if is_beginner else "2M"
        model = MODEL_BEGINNER if is_beginner else MODEL_2M
        template = PROMPT_2S_HEADER if is_beginner else PROMPT_2M_HEADER
        if is_beginner:
            n_splits = 2 if (level == "A1" and length == "longer") else 1
        else:
            n_splits = 3  # longer only — medium removed
        prompt = build_writing_prompt(template, lang, level, length, factbase)
        tasks.append(_WriteTask(
            stage=stage, lang=lang, level=level, length=length,
            model=model, prompt=prompt, schema=_SCHEMA_WRITING,
            max_output_tokens=8192, template=template, factbase=factbase,
            n_splits=n_splits,
        ))

    if not tasks:
        print("[write] No CEFR level combos to generate (all skipped by P4a grades)")
        return {}

    beginner_count = sum(1 for t in tasks if t.stage == "2B")
    print(
        f"[write] Running {len(tasks)} writing requests (max {_MAX_WORKERS} at a time)... "
        f"({beginner_count} beginner, {len(tasks) - beginner_count} standard)"
    )

    briefings: dict = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_task = {executor.submit(_execute_task, client, t): t for t in tasks}

        for future in as_completed(future_to_task):
            task = future_to_task[future]
            stage, lang, level, length = task.stage, task.lang, task.level, task.length
            articles = future.result()

            if not articles:
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

    return briefings


def run_grade_cefr(
    client: genai.Client,
    briefings: dict,
) -> dict:
    """
    Stage P4b — grade the CEFR level articles that were actually written.
    Uses gemini-2.0-flash-lite. Returns grading dict (per-article assessments).
    """
    # Collect all written articles per language for grading
    articles_by_lang: dict = {}
    for lang, levels in briefings.items():
        flat: list = []
        for level_data in levels.values():
            for length_data in level_data.values():
                flat.extend(length_data.get("articles", []))
        if flat:
            articles_by_lang[lang] = flat

    langs_to_grade = list(articles_by_lang.keys())
    if not langs_to_grade:
        print("[4b] No CEFR articles to grade — skipping", file=sys.stderr)
        return {}

    print(f"[4b] Grading CEFR articles for {len(langs_to_grade)} languages...")
    grading: dict = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_lang = {
            executor.submit(
                call_gemini, client, MODEL_4B,
                build_grading_prompt(lang, articles_by_lang[lang]),
                f"4b/{lang}", "4b", _SCHEMA_GRADING,
            ): lang
            for lang in langs_to_grade
        }

        for future in as_completed(future_to_lang):
            lang = future_to_lang[future]
            raw, finish_reason = future.result()
            if not raw:
                print(f"[ERROR] [4b] {lang}: no response — grading incomplete", file=sys.stderr)
                grading[lang] = []
                continue
            if finish_reason == "MAX_TOKENS":
                print(f"[ERROR] [4b] {lang}: MAX_TOKENS — grading incomplete", file=sys.stderr)
                grading[lang] = []
                continue
            parsed = parse_llm_json(raw)
            assessments = parsed.get("assessments", []) if parsed else []
            if not assessments:
                print(f"[ERROR] [4b] {lang}: empty assessments", file=sys.stderr)
            grading[lang] = assessments
            print(f"[4b] {lang}: {len(assessments)} assessments ✓")

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

    print(f"[write] Languages: {', '.join(ACTIVE_LANGUAGES)}")
    for lang in ACTIVE_LANGUAGES:
        print(f"[write]   {lang}: {', '.join(LANGUAGE_LEVELS[lang])}")

    # Initialise Gemini client
    client = genai.Client()
    print("[write] Gemini client initialised")

    # ── Stage 3 — native journalism (runs before CEFR writing) ───────────────
    native_journalism = run_native_journalism(client, factbase)

    # ── Stage P4a — grade native journalism → CEFR level per language ─────────
    # This gates P2S/2M: levels at or above the native grade are skipped.
    native_grades = run_grade_native(client, native_journalism)
    if native_grades:
        print(f"[write] Native grades: {native_grades}")

    # ── Stages 2S + 2B + 2M — write CEFR levels below native grade ───────────
    briefings = run_writing_concurrent(client, factbase, 0, date, native_grades)
    # Stamp generatedAt AFTER writing completes so "Published at" reflects when
    # articles finished, not when the pipeline launched.
    generated_at = int(datetime.now(timezone.utc).timestamp() * 1000)
    for _ld in briefings.values():
        for _lvl in _ld.values():
            for _b in _lvl.values():
                _b["generatedAt"] = generated_at

    combos_2s, combos_2m = build_combinations(native_grades)
    total_briefings = sum(
        1
        for lang_data in briefings.values()
        for level_data in lang_data.values()
        for _ in level_data.values()
    )
    print(f"[write] Writing done: {total_briefings} / {len(combos_2s) + len(combos_2m)} briefings assembled")

    # ── Stage P4b — grade the CEFR level articles that were written ───────────
    grading = run_grade_cefr(client, briefings)

    # ── Cost report ───────────────────────────────────────────────────────────
    write_costs_report(date, script_dir)

    # ── Assemble DailyBundle ──────────────────────────────────────────────────
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)

    # Persistent volume counter — increments once per successful daily run.
    # Stored as output/volume.json so it's committed alongside the bundle and
    # survives across pipeline runs. Every device reads the same number.
    volume_path = os.path.join(output_dir, "volume.json")
    try:
        with open(volume_path, "r", encoding="utf-8") as f:
            prev_volume = json.load(f).get("volume", 0)
    except (FileNotFoundError, ValueError):
        prev_volume = 0
    current_volume = prev_volume + 1

    bundle = {
        "date": date,
        "generatedAt": generated_at,
        "volume": current_volume,
        "factbase": factbase,
        "gatherSource": "gemini",
        "briefings": briefings,
        "nativeJournalism": native_journalism,
        "nativeGrades": native_grades,   # P4a output: dict[lang → cefr_level]
        "grading": grading,
    }

    bundle_json = json.dumps(bundle, ensure_ascii=False, indent=2)
    dated_path  = os.path.join(output_dir, f"{date}.json")
    latest_path = os.path.join(output_dir, "latest.json")

    with open(dated_path,  "w", encoding="utf-8") as f:
        f.write(bundle_json)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(bundle_json)

    # Write volume counter so the next run can increment from here
    with open(volume_path, "w", encoding="utf-8") as f:
        json.dump({"volume": current_volume}, f)

    approx_kb = len(bundle_json.encode("utf-8")) // 1024
    print(f"[write] Done — output/{date}.json ({approx_kb} KB) | Vol. {current_volume}")
    print(f"[write] Briefings: {total_briefings} | Native: {sum(len(v) for v in native_journalism.values())} | Gradings: {sum(len(v) for v in grading.values())}")


if __name__ == "__main__":
    main()

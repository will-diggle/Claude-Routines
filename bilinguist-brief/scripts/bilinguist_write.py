"""
bilinguist_write.py
===================
Stages 2S, 2M, 3, and 4 of the Bilinguist Brief daily pipeline.

Reads the factbase produced by bilinguist_gather.py and:
  2S — Short writing    : gemini-2.5-flash  Concurrent  A1/A2 + all short lengths
  2M — Medium/long      : gemini-2.5-flash  Concurrent  B1+ medium and long
  3  — Native journalism : gemini-2.5-flash  Concurrent  one per language
  4  — Grading           : gemini-2.5-flash  Sequential  grades Stage 3 output

All stages use direct generate_content() calls with a thread pool (max 5 concurrent)
rather than the Gemini Batch API. This avoids batch quota requirements and is
faster (no polling delay) while naturally handling rate limits via the semaphore.

Outputs:
  scripts/output/YYYY-MM-DD.json   — archived bundle
  scripts/output/latest.json       — overwritten daily (app fetches this)

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

WORDS_PER_ARTICLE: dict[str, int] = {
    "short":  80,
    "medium": 140,
    "longer": 220,
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
    combos_2s → MODEL_2S (flash-lite): A1/A2 short + B1+ short
    combos_2m → MODEL_2M (flash):      B1+ medium + B1+ longer
    """
    combos_2s: list[tuple[str, str, str]] = []
    combos_2m: list[tuple[str, str, str]] = []

    for lang, levels in LANGUAGE_LEVELS.items():
        for level in levels:
            if level in ("A1", "A2"):
                # Beginner: short only
                # TODO: length-per-level policy — A1/A2 always Concise for now
                combos_2s.append((lang, level, "short"))
            else:
                combos_2s.append((lang, level, "short"))    # short via 2S
                combos_2m.append((lang, level, "medium"))   # medium via 2M
                combos_2m.append((lang, level, "longer"))   # longer via 2M

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

PROMPT_2S_HEADER = """\
You are the editorial writer for Bilinguist Brief, a language-learning news app. You receive a pre-gathered fact-base of today's news in British English and rewrite every story as a short original news article in a target language, at a specific reading level.

OUTPUT FORMAT:
Respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Begin with { and end with }.
{"articles":[{"genre":"...","headline":"...","body":"..."}]}

JSON SAFETY:
- Each "body" is a SINGLE continuous string. No literal line breaks. Flowing prose in one unbroken string.
- Use the target language's typographic quotation marks — never straight ASCII quotes:
  French: « … » with non-breaking spaces inside
  German: „…" (low curly opening U+201E, high curly closing U+201C)
  Spanish: «…» or "…"
  Italian: «…»
  English: "…"
  Swedish: "…"
  Turkish: "…"
- Never use the straight double-quote character (") inside any field's text.

WRITING RULES:
- Write every article in {LANGUAGE}.
- Write every story from the fact-base — do not skip any.
- Write original prose from the facts. Never copy source phrasing.
- Use only facts from the fact-base. Preserve all attributions exactly.
- FACT ORDER: at A1 and A2, prioritise clarity and natural sentence flow. At B1 and above, follow the fact-base "what_happened" order exactly.
- GLOSSARY:
  * LITERAL (numbers, specific names of people/places/orgs): reproduce exactly. Names not translated.
  * SEMANTIC (descriptive terms, generic descriptors): translate naturally and consistently. Never leave English inside a non-English article.
- Match the journalistic register of a prestige outlet: French→Le Monde, German→Der Spiegel, English→The Guardian (British), Swedish→Dagens Nyheter, Spanish→El País, Italian→Corriere della Sera. STYLE references only, not sources.
- ENGLISH VARIANT: IF {LANGUAGE} is English, write exclusively in British English. This applies ONLY to English.
- HEADLINE: same core event and key noun across all versions — strongly parallel, scaled to level, never clickbait.

NEUTRALITY: honour the verified/contested separation. State verified facts plainly; attribute contested ones to their named source. Parallel treatment of opposing parties. No loaded language.

LENGTH: target approximately {WORD_COUNT} words per article. Write natively short — focused on the core. Never padded, never truncated mid-thought.

THE READING LEVEL IS THE MASTER CONSTRAINT. Level always wins over word count.

READING LEVEL — {LEVEL} ({LEVEL_LABEL}):

A1 — Beginner: MAXIMUM 3 sentences. Never more — not 4, not 5. Every sentence: subject + verb + object only. Present tense only. ~500 most common words. No subordinate clauses, no conjunctions beyond "and". Plainest single verified fact per sentence. Skip all contested nuance, all attribution, all numbers unless essential.

A2 — Elementary: 4–5 sentences. Present and simple past. ~1,000 common words. Simple connectors (and, but, because, so). Minimal attribution kept simple.

B1 — Intermediate: 5–6 sentences. Mixed tenses. Moderate vocabulary. One or two topic words explained by context. Simple attribution. No idioms.

B2 — Upper Intermediate: 6–7 sentences. Full tenses. Varied structure. Some idiom. Proper attribution of contested claims. Well-read adult vocabulary. Clear, confident, purposeful.

C1 — Advanced: 7–8 sentences. Precision and authority of a senior journalist. Complex syntax, rich vocabulary, full journalistic register. Clear and purposeful — never obscure for its own sake.

C2 — Challenge: 8–10 sentences. Dense, demanding educated native prose. Complex subordination, abstract nominalisations, layered structures. Sophisticated not obscure.

C2 / Scholar: 10–14 sentences. Long-form essayist register. Rhetorical devices: inversion, ellipsis, parallelism, antithesis. Elevated precise vocabulary. Analytical meta-commentary contextualising the story within broader currents.

[FACTBASE BELOW]
"""

PROMPT_2M_HEADER = """\
You are the editorial writer for Bilinguist Brief, a language-learning news app. You receive a pre-gathered fact-base of today's news in British English and rewrite every story as an original news article in a target language, at a specific reading level, for language learners.

OUTPUT FORMAT:
Respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Begin with { and end with }.
{"articles":[{"genre":"...","headline":"...","body":"..."}]}

JSON SAFETY:
- Each "body" is a SINGLE continuous string. No literal line breaks. Flowing prose in one unbroken string.
- Use the target language's typographic quotation marks — never straight ASCII quotes:
  French: « … » with non-breaking spaces
  German: „…" (low curly opening U+201E, high curly closing U+201C)
  Spanish: «…» or "…"
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
- FACT ORDER: present facts in the SAME ORDER as the "what_happened" list in the fact-base. Do not reorder for stylistic effect.
- GLOSSARY:
  * LITERAL (numbers, specific names of people/places/orgs): reproduce exactly. Numbers may use target language formatting but value must not change. Names not translated.
  * SEMANTIC (descriptive terms, generic descriptors): translate naturally and consistently. Never leave English inside a non-English article.
- Match the journalistic register of a prestige outlet: French→Le Monde, German→Der Spiegel, English→The Guardian (British), Swedish→Dagens Nyheter, Spanish→El País, Italian→Corriere della Sera. STYLE references only.
- ENGLISH VARIANT: IF {LANGUAGE} is English, write exclusively in British English. This applies ONLY to English.
- HEADLINE: same core event and key noun across all versions — strongly parallel, scaled to level, never clickbait.

NEUTRALITY: honour the verified/contested separation. State verified facts plainly; attribute contested ones to their named source. Parallel treatment of opposing parties. Bias hides in grammar — agency, passive voice, loaded verbs. Keep it even.

LENGTH: target approximately {WORD_COUNT} words per article. Write natively to this length. Never padded. Never truncated mid-thought.

THE READING LEVEL IS THE MASTER CONSTRAINT. Level always wins over word count. Write fewer words rather than break the level.

READING LEVEL — {LEVEL} ({LEVEL_LABEL}):

B1 — Intermediate: 5–6 sentences. Mixed tenses. Moderate vocabulary. One or two topic words explained by context. Simple attribution. No idioms.

B2 — Upper Intermediate: 6–7 sentences. Full range of tenses. Varied sentence structure. Some idiomatic language. Proper attribution of contested claims. Vocabulary of a well-read adult. Clear, confident, purposeful.

C1 — Advanced: 7–8 sentences. Write with the precision and authority of a senior journalist at a prestige outlet. Complex syntax, rich vocabulary, full journalistic register. Always clear and purposeful. Never obscure for its own sake.

C2 — Challenge: 8–10 sentences. Push beyond standard journalistic register into dense, demanding educated native prose — complex subordination, abstract nominalisations, layered sentence structures. Excellent, considered writing. Difficulty through sophistication, not obscurity.

C2 / Scholar: 10–14 sentences. Long-form essayist register — cultural critic or intellectual commentator. Dense multi-clause architecture with embedded subordination and apposition. Deliberate rhetorical devices: inversion, ellipsis, parallelism, antithesis. Precise elevated vocabulary. Analytical meta-commentary contextualising the story within broader political, economic, or cultural currents.

[FACTBASE BELOW]
"""

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
- NEUTRALITY: honour the verified/contested separation. Attribute contested claims to named sources. Parallel treatment of opposing parties. No loaded language.
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
    word_count = WORDS_PER_ARTICLE[length]
    lang_name = LANGUAGE_NAMES.get(lang, lang)

    prompt = template
    prompt = prompt.replace("{LANGUAGE}", lang_name)
    prompt = prompt.replace("{LEVEL}", level_display)
    prompt = prompt.replace("{LEVEL_LABEL}", label)
    prompt = prompt.replace("{WORD_COUNT}", str(word_count))

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

def call_gemini(client: genai.Client, model: str, prompt: str, label: str) -> Optional[str]:
    """
    Call generate_content() directly with retry logic for transient errors.
    Uses a shared semaphore to cap concurrent inflight requests.
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
            executor.submit(call_gemini, client, model, prompt, f"{stage}/{lang}"): (stage, lang, level, length)
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
                f"4/{lang}"
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

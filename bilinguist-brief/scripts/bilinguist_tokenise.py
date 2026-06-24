"""
bilinguist_tokenise.py
======================
Stage P5 of the Bilinguist Brief daily pipeline.

Runs after P4b (grading). For every article variant in today's bundle:
  1. Sends the full article text (headline + body) to Gemini 2.5 Flash-Lite
     for linguistic token analysis — lemmas, POS, linked positions (separable
     verbs, gendered articles, idioms).
  2. Embeds the resulting tokenMap into the article JSON object in-place.
  3. Collects all unique (language, lemma) pairs from the day's output.
  4. Queries Supabase: which lemmas already exist and are complete?
  5. Generates full dictionary cards for new / incomplete lemmas via Gemini
     Flash-Lite.
  6. Upserts to word_dictionary.
  7. Writes the updated bundle back to output/{date}.json and output/latest.json.

Usage:
    python bilinguist_tokenise.py [--date YYYY-MM-DD]

Requirements:
    pip install google-genai supabase regex
    export GEMINI_API_KEY=your_key
    EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in bilinguist-brief/.env
"""

import argparse
import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import regex as uregex                          # pip install regex — true \p{L} support
from google import genai
from google.genai import types
from supabase import create_client

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ENV_FILE   = SCRIPT_DIR.parent / ".env"
OUTPUT_DIR = SCRIPT_DIR / "output"

# ── Models ────────────────────────────────────────────────────────────────────

MODEL_P5   = "gemini-2.0-flash-lite"   # token analysis — classification task
MODEL_DICT = "gemini-2.0-flash-lite"   # dictionary card generation

# ── Concurrency ───────────────────────────────────────────────────────────────

_MAX_WORKERS   = 6
_API_SEMAPHORE = threading.Semaphore(_MAX_WORKERS)
MAX_RETRIES    = 3
RETRY_DELAYS   = [15, 30, 60]

# ── Pricing (USD per 1M tokens) ───────────────────────────────────────────────

FLASH_LITE_INPUT_USD_PER_M  = 0.075
FLASH_LITE_OUTPUT_USD_PER_M = 0.30
USD_TO_GBP                  = 0.79

# ── Tokenisation — must exactly match TappableText.tsx ───────────────────────
# TappableText regex: /(\p{L}+(?:'\p{L}+)?)|([^\p{L}]+)/gu
# Words are group 1 matches; sequential word indices (skipping non-word tokens)
# are the positions we use in the token map.

_WORD_RE = uregex.compile(r"\p{L}+(?:'\p{L}+)?", uregex.UNICODE)


def word_positions(text: str) -> list[tuple[int, str]]:
    """
    Return list of (position, surface_word) for every word token in `text`,
    using the same Unicode letter regex as TappableText.tsx.
    Positions are zero-indexed, counting only word tokens (not spaces/punctuation).
    """
    return [(i, m.group(0)) for i, m in enumerate(_WORD_RE.finditer(text))]


def count_words(text: str) -> int:
    return len(_WORD_RE.findall(text))


# ── Gemini schema for P5 token analysis ──────────────────────────────────────

_TOKEN_SCHEMA = {
    "type": "object",
    "properties": {
        "tokens": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "position":         {"type": "integer"},
                    "surface":          {"type": "string"},
                    "lemma":            {"type": "string"},
                    "pos":              {"type": "string"},
                    "linked_positions": {"type": "array", "items": {"type": "integer"}},
                    "gender":           {"type": "string"},
                },
                "required": ["position", "surface", "lemma", "pos", "linked_positions"],
            },
        },
    },
    "required": ["tokens"],
}

# ── Gemini schema for dictionary card generation ──────────────────────────────

_DICT_SCHEMA = {
    "type": "object",
    "properties": {
        "lemma":         {"type": "string"},
        "translation":   {"type": "string"},
        "wordType":      {"type": "string"},
        "explanation":   {"type": "string"},
        "example":       {"type": "string"},
        "pronunciation": {"type": "string"},
        "verbTable":     {"type": "object"},
        "verbTablePast": {"type": "object"},
        "forms":         {"type": "object"},
        "tip":           {"type": "string"},
        "meta":          {"type": "object"},
        "level":         {"type": "string"},
    },
    "required": ["lemma", "translation", "wordType"],
}


# ── Token-usage tracking ──────────────────────────────────────────────────────

@dataclass
class _Usage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0

_usage_lock = threading.Lock()
_token_usage = _Usage()
_dict_usage  = _Usage()


def _record_usage(target: _Usage, resp):
    um = getattr(resp, "usage_metadata", None) or {}
    i = getattr(um, "prompt_token_count",     0) or 0
    o = getattr(um, "candidates_token_count", 0) or 0
    with _usage_lock:
        target.calls         += 1
        target.input_tokens  += i
        target.output_tokens += o


# ── Gemini helper ─────────────────────────────────────────────────────────────

def _call_gemini(client: genai.Client, model: str, prompt: str,
                 schema: dict, label: str) -> Optional[dict]:
    import time
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        _API_SEMAPHORE.acquire()
        try:
            resp = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    max_output_tokens=4096,
                ),
            )
            text = (resp.text or "").strip()
            if not text:
                raise ValueError("empty response")
            parsed = json.loads(text)
            # Record regardless of success
            _record_usage(_token_usage if schema is _TOKEN_SCHEMA else _dict_usage, resp)
            return parsed
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                print(f"[WARN] [{label}] attempt {attempt+1} failed: {e} — retrying in {delay}s",
                      file=sys.stderr)
                time.sleep(delay)
        finally:
            _API_SEMAPHORE.release()
    print(f"[ERROR] [{label}] all retries exhausted: {last_err}", file=sys.stderr)
    return None


# ── Env loader ────────────────────────────────────────────────────────────────

def _load_env() -> dict:
    env: dict = {}
    if not ENV_FILE.exists():
        return env
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


# ── P5 — per-article token analysis ──────────────────────────────────────────

_P5_PROMPT = """\
You are analysing a {language} news article written for language learners.

Every word token has already been assigned a position: position 0 is the first
word, position 1 is the second word, and so on (spaces and punctuation are NOT
counted — only Unicode letter sequences get positions).

For each word token, identify:
- Its lemma (dictionary/citation form). For German separable verbs the lemma is
  the combined infinitive (e.g. "anrufen" not "rufen") even though the prefix
  appears elsewhere in the sentence.
- Its part of speech (coarse tagset: NOUN VERB PART ADJ ADV PRON DET ADP CONJ
  NUM PROPN PUNCT IDIOM OTHER).
- Any other word positions in the SAME SENTENCE that must be combined with this
  token to form one complete lexical unit:
  * Separable verb + particle (both halves point at each other)
  * Article + noun where the article carries gender information (French le/la/un/une,
    Italian il/la/un/una, Spanish el/la/un/una)
  * Fixed idiom members (3+ tokens forming an inseparable expression — set pos
    to IDIOM on all members)
- Optional: gender field (m/f/n) on nouns in gendered languages.

Return ONLY valid JSON — no markdown fences, no commentary.

Article text (headline then body, positions are global across both):
{article_text}
"""


def _p5_article_text(article: dict) -> str:
    """Concatenate headline + body as P5 sees it (matches client word positions)."""
    return article.get("headline", "") + "\n" + article.get("body", "")


def run_token_analysis(
    client: genai.Client,
    article: dict,
    lang: str,
    label: str,
) -> Optional[list]:
    """
    Run P5 on one article. Returns the list of token dicts, or None on failure.
    On success, also validates that linked_positions are symmetric and in-bounds.
    """
    lang_names = {
        "fr": "French", "de": "German", "en": "English",
        "sv": "Swedish", "es": "Spanish", "it": "Italian",
        "tr": "Turkish", "hu": "Hungarian",
    }
    article_text = _p5_article_text(article)
    prompt = _P5_PROMPT.format(
        language=lang_names.get(lang, lang),
        article_text=article_text,
    )

    result = _call_gemini(client, MODEL_P5, prompt, _TOKEN_SCHEMA, label)
    if not result:
        return None

    tokens = result.get("tokens", [])
    if not tokens:
        print(f"[WARN] [{label}] P5 returned empty token list", file=sys.stderr)
        return None

    # Validate linked_positions: references must exist in the token array
    pos_set = {t["position"] for t in tokens}
    for t in tokens:
        bad = [p for p in t.get("linked_positions", []) if p not in pos_set]
        if bad:
            print(f"[WARN] [{label}] token @{t['position']} has dangling linked_positions {bad} "
                  f"— removing", file=sys.stderr)
            t["linked_positions"] = [p for p in t["linked_positions"] if p in pos_set]

    return tokens


# ── P5 — run over whole bundle ────────────────────────────────────────────────

def enrich_bundle_with_token_maps(
    client: genai.Client,
    bundle: dict,
) -> dict:
    """
    Walk every article variant in briefings and nativeJournalism, run P5,
    embed tokenMap. Returns dict[lang][lemma] = True (all lemmas found this day).
    """
    briefings         = bundle.get("briefings", {})
    native_journalism = bundle.get("nativeJournalism", {})

    tasks: list[tuple[dict, str, str]] = []  # (article_obj, lang, label)

    # CEFR briefings: briefings[lang][level][length] = {articles: [...]}
    for lang, lang_data in briefings.items():
        for level, level_data in lang_data.items():
            for length, briefing in level_data.items():
                for i, article in enumerate(briefing.get("articles", [])):
                    label = f"P5/{lang}/{level}/{length}/{i}"
                    tasks.append((article, lang, label))

    # Native journalism: nativeJournalism[lang] = [{slug, headline, body, ...}]
    for lang, articles in native_journalism.items():
        for i, article in enumerate(articles):
            label = f"P5/{lang}/Native/{i}"
            tasks.append((article, lang, label))

    total = len(tasks)
    done  = 0
    print(f"[P5] Token analysis — {total} article variants")

    # Collect all (lang, lemma) pairs for dictionary population
    lemmas_by_lang: dict[str, set] = {}  # lang → set of lemmas

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_task = {
            executor.submit(run_token_analysis, client, art, lang, lbl): (art, lang, lbl)
            for art, lang, lbl in tasks
        }
        for future in as_completed(future_to_task):
            art, lang, lbl = future_to_task[future]
            tokens = future.result()
            done += 1
            if tokens is not None:
                art["tokenMap"] = tokens
                # Collect lemmas (skip punctuation/determiners for dictionary)
                skip_pos = {"PRON", "DET", "PUNCT", "NUM", "CONJ", "ADP"}
                for t in tokens:
                    if t.get("pos") not in skip_pos and t.get("lemma"):
                        lemma = t["lemma"].lower()
                        lemmas_by_lang.setdefault(lang, set()).add(lemma)
                print(f"[P5] {lbl}: {len(tokens)} tokens ✓  [{done}/{total}]")
            else:
                print(f"[WARN] [P5] {lbl}: no token map (article ships without it)", file=sys.stderr)

    print(f"[P5] Done — {sum(len(v) for v in lemmas_by_lang.values())} unique lemmas across "
          f"{len(lemmas_by_lang)} languages")
    return lemmas_by_lang


# ── Dictionary card generation ────────────────────────────────────────────────

_DICT_PROMPT = """\
A language learner is studying {language}. Generate a complete dictionary entry
for the word "{lemma}".

Return ONLY valid JSON — no markdown fences, no commentary:
{{
  "lemma": "the base dictionary form (same as input unless you correct a misspelling)",
  "translation": "the primary English meaning in 1-5 words",
  "wordType": one of "verb" | "noun" | "adjective" | "adverb" | "phrase" | "other",
  "explanation": "Meaning in English, 1-2 sentences",
  "example": "A {language} example sentence using this word",
  "pronunciation": "IPA pronunciation",
  "verbTable": if verb — present tense conjugation table as JSON object (pronoun:form pairs) — else null,
  "verbTablePast": if verb — past tense conjugation table as JSON object — else null,
  "forms": if noun — {{"gender": "m|f|n", "plural": "...", "article": "..."}} — if adjective — {{"feminine": "...", "comparative": "...", "superlative": "..."}} — else null,
  "tip": "a short memorable tip — etymology, common learner mistake, or memory hook — or null",
  "meta": if verb — {{"isRegular": true|false, "auxiliary": "avoir|sein|haben|avere|etc or null", "verbClass": "...", "isSeparable": true|false}} — else null,
  "level": the CEFR difficulty level of this word: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
}}
"""

LANG_NAMES = {
    "fr": "French", "de": "German", "en": "English",
    "sv": "Swedish", "es": "Spanish", "it": "Italian",
    "tr": "Turkish", "hu": "Hungarian",
}


def generate_dict_card(client: genai.Client, lang: str, lemma: str) -> Optional[dict]:
    prompt = _DICT_PROMPT.format(language=LANG_NAMES.get(lang, lang), lemma=lemma)
    result = _call_gemini(client, MODEL_DICT, prompt, _DICT_SCHEMA, f"dict/{lang}/{lemma}")
    if not result:
        print(f"[ERROR] [dict] Failed to generate card for {lang}/{lemma}", file=sys.stderr)
        return None
    # Normalise nulls — Gemini sometimes returns "null" as string
    for key in ("verbTable", "verbTablePast", "forms", "meta", "tip"):
        val = result.get(key)
        if val == "null" or val == "":
            result[key] = None
    return result


def populate_dictionary(
    client: genai.Client,
    supa,
    lemmas_by_lang: dict[str, set],
) -> None:
    """
    1. Query Supabase for which (lang, lemma) already exist and are complete.
    2. Generate cards for new / incomplete ones.
    3. Upsert to word_dictionary.
    """
    if not supa:
        print("[dict] No Supabase client — skipping dictionary population", file=sys.stderr)
        return

    # Build flat list: (lang, lemma)
    all_pairs = [
        (lang, lemma)
        for lang, lemma_set in lemmas_by_lang.items()
        for lemma in sorted(lemma_set)
    ]
    if not all_pairs:
        print("[dict] No lemmas to populate")
        return

    print(f"[dict] {len(all_pairs)} (lang, lemma) pairs — querying Supabase...")

    # Query existing entries in batches of 500
    existing: dict[tuple, bool] = {}  # (lang, lemma) → is_complete
    BATCH = 500
    for start in range(0, len(all_pairs), BATCH):
        batch = all_pairs[start:start + BATCH]
        # Supabase python client doesn't natively support (lang, lemma) IN (...) tuples,
        # so we query per language to avoid enormous OR chains
        langs_in_batch = list({lang for lang, _ in batch})
        for lang in langs_in_batch:
            lemmas_for_lang = [lemma for l, lemma in batch if l == lang]
            try:
                resp = supa.table("word_dictionary") \
                    .select("lemma, is_complete") \
                    .eq("language", lang) \
                    .in_("lemma", lemmas_for_lang) \
                    .execute()
                for row in resp.data:
                    existing[(lang, row["lemma"])] = row["is_complete"]
            except Exception as e:
                print(f"[ERROR] [dict] Supabase query failed for {lang}: {e}", file=sys.stderr)

    new_pairs = [
        (lang, lemma) for lang, lemma in all_pairs
        if (lang, lemma) not in existing
    ]
    incomplete_pairs = [
        (lang, lemma) for lang, lemma in all_pairs
        if (lang, lemma) in existing and not existing[(lang, lemma)]
    ]
    skip_count = len(all_pairs) - len(new_pairs) - len(incomplete_pairs)

    print(f"[dict] {skip_count} already complete (skip) | "
          f"{len(new_pairs)} new | {len(incomplete_pairs)} incomplete → regenerate")

    generate_pairs = new_pairs + incomplete_pairs
    if not generate_pairs:
        print("[dict] Nothing to generate")
        return

    print(f"[dict] Generating {len(generate_pairs)} dictionary cards...")
    cards_ok = 0
    cards_fail = 0

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_pair = {
            executor.submit(generate_dict_card, client, lang, lemma): (lang, lemma)
            for lang, lemma in generate_pairs
        }
        for future in as_completed(future_to_pair):
            lang, lemma = future_to_pair[future]
            card = future.result()
            if not card:
                cards_fail += 1
                continue

            is_new = (lang, lemma) not in existing
            row = {
                "language":      lang,
                "lemma":         lemma,
                "translation":   card.get("translation") or "",
                "word_type":     card.get("wordType"),
                "explanation":   card.get("explanation"),
                "example":       card.get("example"),
                "pronunciation": card.get("pronunciation"),
                "verb_table":    card.get("verbTable"),
                "verb_table_past": card.get("verbTablePast"),
                "forms":         card.get("forms"),
                "tip":           card.get("tip"),
                "meta":          card.get("meta"),
                "cefr_level":    card.get("level"),
                "source":        "pipeline",
                "is_complete":   True,
            }

            try:
                supa.table("word_dictionary").upsert(
                    row,
                    on_conflict="language,lemma",
                ).execute()
                cards_ok += 1
                action = "INSERT" if is_new else "UPDATE"
                print(f"[dict] {action} {lang}/{lemma} ✓")
            except Exception as e:
                cards_fail += 1
                print(f"[ERROR] [dict] Supabase upsert failed {lang}/{lemma}: {e}", file=sys.stderr)

    print(f"[dict] Done — {cards_ok} upserted, {cards_fail} failed")


# ── Cost report ───────────────────────────────────────────────────────────────

def print_costs() -> None:
    p5_usd = (
        (_token_usage.input_tokens  / 1_000_000) * FLASH_LITE_INPUT_USD_PER_M +
        (_token_usage.output_tokens / 1_000_000) * FLASH_LITE_OUTPUT_USD_PER_M
    )
    d_usd = (
        (_dict_usage.input_tokens  / 1_000_000) * FLASH_LITE_INPUT_USD_PER_M +
        (_dict_usage.output_tokens / 1_000_000) * FLASH_LITE_OUTPUT_USD_PER_M
    )
    total_usd = p5_usd + d_usd
    print(f"[P5] Token analysis: {_token_usage.calls} calls, "
          f"{_token_usage.input_tokens:,} in + {_token_usage.output_tokens:,} out "
          f"= ${p5_usd:.4f}")
    print(f"[dict] Dictionary cards: {_dict_usage.calls} calls, "
          f"{_dict_usage.input_tokens:,} in + {_dict_usage.output_tokens:,} out "
          f"= ${d_usd:.4f}")
    print(f"[P5] Total P5 cost: ${total_usd:.4f} (£{total_usd * USD_TO_GBP:.4f})")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Bilinguist Brief — P5 linguistic tokenisation")
    parser.add_argument("--date", help="Override date (YYYY-MM-DD). Defaults to today UTC.")
    args = parser.parse_args()

    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"[P5] Starting — {date}")

    # Load bundle
    bundle_path = OUTPUT_DIR / f"{date}.json"
    if not bundle_path.exists():
        print(f"[P5] ERROR: Bundle not found at {bundle_path}", file=sys.stderr)
        print("[P5] Run bilinguist_write.py first.", file=sys.stderr)
        sys.exit(1)

    with open(bundle_path, "r", encoding="utf-8") as f:
        bundle = json.load(f)

    article_count = sum(
        len(b.get("articles", []))
        for lang_data in bundle.get("briefings", {}).values()
        for level_data in lang_data.values()
        for b in level_data.values()
    ) + sum(
        len(arts) for arts in bundle.get("nativeJournalism", {}).values()
    )
    print(f"[P5] Bundle loaded — {article_count} article variants")

    # Initialise Gemini
    client = genai.Client()
    print(f"[P5] Gemini client initialised (model: {MODEL_P5})")

    # Initialise Supabase
    env = _load_env()
    supa_url = env.get("EXPO_PUBLIC_SUPABASE_URL", "")
    supa_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    supa = None
    if supa_url and supa_key:
        supa = create_client(supa_url, supa_key)
        print(f"[P5] Supabase client initialised")
    else:
        print("[WARN] [P5] Supabase credentials not found — dictionary population will be skipped",
              file=sys.stderr)

    # ── P5: embed token maps into every article ───────────────────────────────
    lemmas_by_lang = enrich_bundle_with_token_maps(client, bundle)

    # ── Dictionary population ─────────────────────────────────────────────────
    populate_dictionary(client, supa, lemmas_by_lang)

    # ── Cost report ───────────────────────────────────────────────────────────
    print_costs()

    # ── Write updated bundle ──────────────────────────────────────────────────
    bundle_json = json.dumps(bundle, ensure_ascii=False, indent=2)
    with open(bundle_path, "w", encoding="utf-8") as f:
        f.write(bundle_json)

    latest_path = OUTPUT_DIR / "latest.json"
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(bundle_json)

    approx_kb = len(bundle_json.encode("utf-8")) // 1024
    print(f"[P5] Done — bundle updated ({approx_kb} KB)")


if __name__ == "__main__":
    main()

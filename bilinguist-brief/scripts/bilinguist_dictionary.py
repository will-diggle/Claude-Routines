"""
bilinguist_dictionary.py
========================
Runs after bilinguist_check.py in the daily GitHub Actions pipeline.

1. Extracts all unique lemmas from today's bundle (from token maps if P5 has
   run, otherwise from raw article word forms as a fallback).
2. Queries Supabase to find which lemmas are missing or incomplete.
3. In live mode: calls Gemini Flash-Lite (GEMINI_DICTIONARY_API_KEY secret)
   to generate full dictionary cards and writes them to word_dictionary.
4. Reports per-language new-word counts and updates the ntfy notification.

Usage:
    python bilinguist_dictionary.py [--date YYYY-MM-DD] [--dry-run]

Dry-run: reads bundle + queries Supabase for existing entries, then prints a
full missing-word report. No Gemini calls, no Supabase writes.
"""

import argparse
import json
import os
import re
import sys
import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import regex as uregex
    _WORD_RE = uregex.compile(r"\p{L}+(?:'\p{L}+)?", uregex.UNICODE)
except ImportError:
    _WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿÀ-ɏ]+(?:'[A-Za-zÀ-ÖØ-öø-ÿÀ-ɏ]+)?")

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ENV_FILE   = SCRIPT_DIR.parent / ".env"
OUTPUT_DIR = SCRIPT_DIR / "output"

# ── Config ────────────────────────────────────────────────────────────────────

MODEL_DICT = "gemini-2.0-flash-lite"

_MAX_WORKERS = 6
_API_SEMAPHORE = threading.Semaphore(_MAX_WORKERS)
MAX_RETRIES  = 3
RETRY_DELAYS = [15, 30, 60]

FLASH_LITE_INPUT_USD_PER_M  = 0.075
FLASH_LITE_OUTPUT_USD_PER_M = 0.30
USD_TO_GBP = 0.79

LANG_NAMES = {
    "fr": "French", "de": "German", "en": "English",
    "sv": "Swedish", "es": "Spanish", "it": "Italian",
    "tr": "Turkish", "hu": "Hungarian",
}

# POS tags we skip for the dictionary (function words, punctuation)
_SKIP_POS = {"PRON", "DET", "PUNCT", "NUM", "CONJ", "ADP"}

# Minimum word length to consider (filters out single-letter tokens)
_MIN_WORD_LEN = 2

# Very common stop-words to skip when extracting from raw text (no POS info).
# Short list — only extremely high-frequency words that add no learner value.
_STOP_WORDS: dict[str, set[str]] = {
    "de": {"der", "die", "das", "ein", "eine", "und", "ist", "in", "von", "zu",
           "mit", "auf", "für", "den", "dem", "des", "im", "an", "am", "er",
           "sie", "es", "wir", "ich", "du", "ihr", "sich", "aber", "auch",
           "als", "bei", "bis", "aus", "nach", "noch", "schon", "so", "was",
           "wie", "wenn", "dann", "oder", "nicht", "hat", "haben", "sein",
           "hatte", "war", "sind", "wird", "wurden", "worden", "wurde"},
    "fr": {"le", "la", "les", "de", "du", "des", "un", "une", "et", "est",
           "en", "que", "qui", "dans", "par", "sur", "avec", "au", "aux",
           "il", "elle", "ils", "elles", "je", "tu", "nous", "vous", "se",
           "ont", "été", "pas", "plus", "ou", "si", "même", "tout", "comme",
           "aussi", "mais", "car", "donc", "leur", "ses", "son", "sa"},
    "sv": {"och", "att", "det", "är", "en", "ett", "som", "av", "på", "för",
           "med", "till", "den", "de", "i", "har", "om", "sig", "sin", "han",
           "hon", "de", "vi", "ni", "man", "men", "var", "inte", "också",
           "eller", "när", "kan", "ska", "bli", "bli", "efter", "under"},
    "en": {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
           "for", "of", "with", "it", "is", "was", "are", "be", "been",
           "has", "have", "had", "do", "does", "did", "will", "would",
           "could", "should", "may", "might", "that", "this", "which",
           "who", "from", "by", "as", "not", "no", "he", "she", "they",
           "we", "i", "you", "his", "her", "its", "their", "our", "also"},
    "it": {"il", "la", "lo", "i", "le", "gli", "di", "del", "della", "dei",
           "delle", "un", "una", "e", "in", "che", "per", "con", "da", "su",
           "al", "nel", "si", "ha", "hanno", "sono", "è", "era", "stato",
           "ma", "non", "come", "anche", "più", "tra", "questo", "sua"},
    "es": {"el", "la", "los", "las", "de", "del", "un", "una", "y", "en",
           "que", "por", "con", "para", "se", "su", "al", "es", "son",
           "ha", "han", "fue", "sido", "también", "pero", "más", "como",
           "no", "lo", "le", "sus", "este", "esta", "esto", "sobre"},
    "tr": {"bir", "ve", "bu", "da", "de", "ile", "için", "olan", "en", "çok",
           "var", "ki", "o", "bu", "ise", "gibi", "daha", "ne", "ya", "hem",
           "veya", "ama", "fakat", "ancak", "çünkü", "eğer", "her", "kadar"},
    "hu": {"a", "az", "és", "egy", "is", "hogy", "nem", "de", "ez", "van",
           "volt", "már", "ki", "meg", "el", "be", "fel", "le", "mi", "te",
           "ő", "mi", "ti", "ők", "ha", "mint", "csak", "még", "sem"},
}


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


# ── Lemma extraction ──────────────────────────────────────────────────────────

# Sentence-boundary split — same pattern used by findContainingSentence in TappableText.tsx
_SENT_RE = re.compile(r'(?<=[.!?»])\s+')


def _extract_word_forms(text: str, lang: str) -> set[str]:
    """
    Extract unique word forms from raw article text.

    - Skips stop-words.
    - Filters out proper nouns: any token that starts with a capital letter and is
      NOT the first word of its sentence, AND never appears in lowercase elsewhere
      in the text, is treated as a proper noun and excluded.
    """
    stops = _STOP_WORDS.get(lang, set())
    sentences = _SENT_RE.split(text)

    all_lower: set[str] = set()        # every qualifying form (lowercased)
    seen_lowercase: set[str] = set()   # forms that appear in lowercase mid-sentence
    mid_upper: set[str] = set()        # forms that appear ONLY capitalised mid-sentence

    for sentence in sentences:
        words = _WORD_RE.findall(sentence)
        for i, word in enumerate(words):
            if len(word) < _MIN_WORD_LEN:
                continue
            lower = word.lower()
            if lower in stops:
                continue
            all_lower.add(lower)
            if i == 0:
                # Sentence-initial word — could be capitalised for grammar reasons,
                # don't count this against it
                seen_lowercase.add(lower)
            elif word[0].isupper():
                # Mid-sentence capital → probable proper noun (unless also seen lower)
                if lower not in seen_lowercase:
                    mid_upper.add(lower)
            else:
                seen_lowercase.add(lower)
                mid_upper.discard(lower)   # appeared lowercase → not a proper noun

    # Exclude forms that were ONLY ever seen capitalised mid-sentence
    proper_nouns = mid_upper - seen_lowercase
    return all_lower - proper_nouns


def extract_lemmas(bundle: dict) -> dict[str, set[str]]:
    """
    Extract all unique (language → set of lemmas/forms) from the bundle.

    Primary source: tokenMap[].lemma on each article (populated by P5).
    Fallback: raw word forms from headline + body (when P5 has not run).

    Returns a dict[lang_code, set[lemma]].
    """
    lemmas: dict[str, set[str]] = defaultdict(set)
    source_used = "none"

    # Check if any article has a tokenMap
    has_token_maps = any(
        art.get("tokenMap")
        for lang_data in bundle.get("briefings", {}).values()
        for level_data in lang_data.values()
        for briefing in level_data.values()
        for art in briefing.get("articles", [])
    ) or any(
        art.get("tokenMap")
        for arts in bundle.get("nativeJournalism", {}).values()
        for art in arts
    )

    if has_token_maps:
        source_used = "tokenMap (P5 lemmas)"
        for lang, lang_data in bundle.get("briefings", {}).items():
            for level_data in lang_data.values():
                for briefing in level_data.values():
                    for art in briefing.get("articles", []):
                        for tok in art.get("tokenMap") or []:
                            if tok.get("pos") not in _SKIP_POS and tok.get("lemma"):
                                lemmas[lang].add(tok["lemma"].lower())

        for lang, arts in bundle.get("nativeJournalism", {}).items():
            for art in arts:
                for tok in art.get("tokenMap") or []:
                    if tok.get("pos") not in _SKIP_POS and tok.get("lemma"):
                        lemmas[lang].add(tok["lemma"].lower())
    else:
        source_used = "raw word forms (P5 not yet run — lemmas will be more accurate after P5)"
        for lang, lang_data in bundle.get("briefings", {}).items():
            for level_data in lang_data.values():
                for briefing in level_data.values():
                    for art in briefing.get("articles", []):
                        text = art.get("headline", "") + " " + art.get("body", "")
                        lemmas[lang].update(_extract_word_forms(text, lang))

        for lang, arts in bundle.get("nativeJournalism", {}).items():
            for art in arts:
                text = art.get("headline", "") + " " + art.get("body", "")
                lemmas[lang].update(_extract_word_forms(text, lang))

    print(f"[dict] Lemma source: {source_used}")
    return dict(lemmas)


# ── Supabase queries ───────────────────────────────────────────────────────────

def find_missing(supa, lemmas_by_lang: dict[str, set[str]]) -> dict[str, list[str]]:
    """
    Query Supabase to find which forms are absent from word_dictionary.

    Checks both the `lemma` column (base/dictionary form) and the `word` column
    (surface form) — the Kaikki-based table stores inflected forms as their own
    entries, so a surface form like "französischen" may be found in `lemma` even
    though it looks inflected.

    Returns dict[lang, sorted list of missing forms].
    """
    missing: dict[str, list[str]] = {}
    BATCH = 500

    for lang, form_set in sorted(lemmas_by_lang.items()):
        all_forms = sorted(form_set)
        existing: set[str] = set()

        for start in range(0, len(all_forms), BATCH):
            batch = all_forms[start:start + BATCH]

            # Check lemma column
            try:
                resp = (
                    supa.table("word_dictionary")
                    .select("lemma")
                    .eq("language", lang)
                    .in_("lemma", batch)
                    .execute()
                )
                for row in resp.data:
                    existing.add(row["lemma"])
            except Exception as e:
                print(f"[ERROR] [dict] Supabase lemma query failed for {lang}: {e}",
                      file=sys.stderr)

            # Check word column for any still-missing forms
            still_missing = [f for f in batch if f not in existing]
            if still_missing:
                try:
                    resp2 = (
                        supa.table("word_dictionary")
                        .select("word")
                        .eq("language", lang)
                        .in_("word", still_missing)
                        .execute()
                    )
                    for row in resp2.data:
                        if row.get("word"):
                            existing.add(row["word"])
                except Exception as e:
                    print(f"[ERROR] [dict] Supabase word query failed for {lang}: {e}",
                          file=sys.stderr)

        lang_missing = [f for f in all_forms if f not in existing]
        if lang_missing:
            missing[lang] = lang_missing

    return missing


# ── Gemini card generation ────────────────────────────────────────────────────

_DICT_SCHEMA = {
    "type": "object",
    "properties": {
        "lemma":         {"type": "string"},
        "word":          {"type": "string"},
        "word_type":     {"type": "string"},
        "translation":   {"type": "string"},
        "level":         {"type": "string"},
        "ipa":           {"type": "string"},
        "explanation":   {"type": "string"},
        "example_sentence":    {"type": "string"},
        "example_translation": {"type": "string"},
        "tip":           {"type": "string"},
        "word_family":   {"type": "string"},
        "common_collocations": {"type": "string"},
        "governed_prepositions": {"type": "string"},
        "data":          {"type": "object"},
    },
    "required": ["lemma", "translation", "word_type"],
}

_DICT_PROMPT = """\
A language learner is studying {language}. The word "{surface_form}" appeared in an article.

STEP 1 — Identify the lemma: what is the base dictionary form of "{surface_form}" in {language}?
  - For verbs: the infinitive (e.g. "sah an" → "ansehen", "marchant" → "marcher", "gidiyorum" → "gitmek")
  - For nouns: nominative singular (e.g. "Bücher" → "Buch", "chats" → "chat")
  - For adjectives: base/masculine-singular form
  - For other words: the form as it appears in the dictionary

STEP 2 — Build a complete dictionary entry. Return ONLY valid JSON — no markdown, no commentary:

{{
  "lemma": "the base dictionary form identified in step 1",
  "word": "{surface_form}",
  "word_type": "verb" | "noun" | "adjective" | "adverb" | "other",
  "translation": "primary English meaning, 1-5 words",
  "level": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "ipa": "IPA pronunciation of the LEMMA",
  "explanation": "Meaning and usage in English, 1-2 sentences",
  "example_sentence": "A natural {language} sentence using the LEMMA",
  "example_translation": "English translation of the example",
  "tip": "Etymology, common learner mistake, or memory hook — or null",
  "word_family": "Related words comma-separated — or null",
  "common_collocations": "Common phrases using this word — or null",
  "governed_prepositions": "Prepositions/cases this word governs — or null",
  "data": {{
    // VERBS — include all tenses you know, skip what you don't:
    // For {language}: use the correct pronoun set and tense names for this language.
    // "tenses": {{ "TENSE NAME": {{ "pronoun": "conjugated form", ... }}, ... }},
    // "is_regular": true/false,
    // "auxiliary": "haben/avoir/avere/haber/ha etc — or null",
    // "is_separable": true/false (German only),
    // "separable_prefix": "prefix string or null" (German only),
    // "is_reflexive": true/false,
    // "verb_class": "strong/weak/irregular/1st/2nd/3rd etc",
    // "past_participle": "...",
    // "present_participle": "...",
    // "imperative": {{ "pronoun": "form", ... }} or null,

    // NOUNS — include what applies for this language:
    // "gender": "m" | "f" | "n" (not applicable for Turkish/Swedish),
    // "article_definite": "der/la/el/il/den/ett etc",
    // "article_indefinite": "ein/une/un etc",
    // For German: "cases": {{ "nominative_singular": "...", "accusative_singular": "...",
    //   "dative_singular": "...", "genitive_singular": "...",
    //   "nominative_plural": "...", "accusative_plural": "...",
    //   "dative_plural": "...", "genitive_plural": "..." }},
    // For French/Italian: "singular": "...", "plural": "...",
    // For Swedish: "indefinite_singular": "...", "definite_singular": "...",
    //   "indefinite_plural": "...", "definite_plural": "...",
    // For Turkish: "noun_root": "...", "vowel_harmony": "e/i or a/ı",
    //   "cases": {{ "nominative_singular": "...", "accusative_singular": "...",
    //   "dative_singular": "...", "locative_singular": "...",
    //   "ablative_singular": "...", "genitive_singular": "...", ... }},

    // ADJECTIVES:
    // "comparative": "...", "superlative": "...",
    // For German: "declension": {{ "strong_m_nom_sg": "...", ... }},
    // For Romance: "masculine_singular": "...", "feminine_singular": "...",
    //   "masculine_plural": "...", "feminine_plural": "...",
    // For Swedish: "common_singular": "...", "neuter_singular": "...", "plural_definite": "..."
  }}
}}

Language-specific tense names to use for {language}:
- German:  PRÄSENS, PRÄTERITUM, PERFEKT, PLUSQUAMPERFEKT, FUTUR I, FUTUR II, KONJUNKTIV I, KONJUNKTIV II, KONDITIONALIS
- French:  PRÉSENT, PASSÉ COMPOSÉ, IMPARFAIT, PASSÉ SIMPLE, PLUS-QUE-PARFAIT, FUTUR, FUTUR ANTÉRIEUR, CONDITIONNEL, CONDITIONNEL PASSÉ, SUBJONCTIF
- Spanish: PRESENTE, PRETÉRITO INDEFINIDO, IMPERFECTO, PRETÉRITO PERFECTO, PLUSCUAMPERFECTO, FUTURO, CONDICIONAL, SUBJUNTIVO PRESENTE
- Italian: PRESENTE, PASSATO PROSSIMO, IMPERFETTO, PASSATO REMOTO, FUTURO, CONDIZIONALE, CONGIUNTIVO PRESENTE
- Swedish: PRESENS, PRETERITUM, PERFEKT, PLUSKVAMPERFEKT, FUTURUM (ska), KONDITIONALIS
- Turkish: GENİŞ ZAMAN, ŞİMDİKİ ZAMAN, GELECEK ZAMAN, GEÇMİŞ ZAMAN (-DI), ÖĞRENİLEN GEÇMİŞ (-MIŞ)

Pronouns for {language}:
- German: ich, du, er/sie/es, wir, ihr, sie/Sie
- French: je, tu, il/elle, nous, vous, ils/elles
- Spanish: yo, tú, él/ella, nosotros, vosotros, ellos/ellas
- Italian: io, tu, lui/lei, noi, voi, loro
- Swedish: — (Swedish verbs have ONE form per tense, same for all persons — use "—" as the key)
- Turkish: ben, sen, o, biz, siz, onlar
"""


_dict_usage_lock = threading.Lock()
_dict_calls = 0
_dict_input_tokens = 0
_dict_output_tokens = 0

# ── Batch lemmatisation ────────────────────────────────────────────────────────

_LEMMA_BATCH_SIZE = 80  # surface forms per lemmatisation call

_LEMMA_BATCH_PROMPT = """\
For each of the following {language} words/forms, identify the canonical BASE DICTIONARY FORM (lemma).
Return ONLY a JSON object mapping EVERY input word to its lemma.

Rules:
- Verbs → infinitive (e.g. "hast" → "haben", "marchait" → "marcher", "gidiyorum" → "gitmek")
- Nouns → nominative singular (e.g. "Bücher" → "Buch", "maisons" → "maison")
- Adjectives → masculine/base singular form
- Adverbs, conjunctions, prepositions → the dictionary form (usually same as input)
- Proper nouns / unknowns → return the word unchanged

Input words: {words}
"""

_LEMMA_BATCH_SCHEMA = {
    "type": "object",
    "additionalProperties": {"type": "string"},
}


def _batch_lemmatize(client, surface_forms: list, lang: str) -> dict:
    """
    Returns {surface_form: lemma} for every form in surface_forms.
    Processes in batches. Falls back to identity mapping on failure.
    """
    import time
    from google.genai import types as gtypes

    result: dict = {}
    batches = [
        surface_forms[i:i + _LEMMA_BATCH_SIZE]
        for i in range(0, len(surface_forms), _LEMMA_BATCH_SIZE)
    ]

    for b_idx, batch in enumerate(batches):
        prompt = _LEMMA_BATCH_PROMPT.format(
            language=LANG_NAMES.get(lang, lang),
            words=", ".join(batch),
        )
        _API_SEMAPHORE.acquire()
        try:
            resp = client.models.generate_content(
                model=MODEL_DICT,
                contents=prompt,
                config=gtypes.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=_LEMMA_BATCH_SCHEMA,
                    max_output_tokens=2048,
                ),
            )
            text = (resp.text or "").strip()
            if text:
                mapping = json.loads(text)
                for word, lemma in mapping.items():
                    if isinstance(lemma, str) and lemma.strip():
                        result[word.lower()] = lemma.strip().lower()
        except Exception as e:
            print(f"[WARN] [dict] Lemma batch {b_idx+1}/{len(batches)} failed for {lang}: {e}",
                  file=sys.stderr)
        finally:
            _API_SEMAPHORE.release()

        # Fill in anything the model didn't return — fall back to identity
        for word in batch:
            if word.lower() not in result:
                result[word.lower()] = word.lower()

    return result


def _call_gemini(client, prompt: str, label: str) -> Optional[dict]:
    import time
    from google.genai import types as gtypes
    global _dict_calls, _dict_input_tokens, _dict_output_tokens

    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        _API_SEMAPHORE.acquire()
        try:
            resp = client.models.generate_content(
                model=MODEL_DICT,
                contents=prompt,
                config=gtypes.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=_DICT_SCHEMA,
                    max_output_tokens=4096,
                ),
            )
            text = (resp.text or "").strip()
            if not text:
                raise ValueError("empty response")
            parsed = json.loads(text)
            um = getattr(resp, "usage_metadata", None)
            if um:
                with _dict_usage_lock:
                    _dict_calls += 1
                    _dict_input_tokens  += getattr(um, "prompt_token_count",     0) or 0
                    _dict_output_tokens += getattr(um, "candidates_token_count", 0) or 0
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


def generate_and_write(client, supa, missing_by_lang: dict[str, list[str]]) -> dict[str, list[str]]:
    """
    Two-step pipeline:
    1. Batch-lemmatise all surface forms → deduplicate to unique roots.
    2. Enrich each unique lemma not already in Supabase and upsert with word=lemma.

    This means "hast", "hat", "habe", "hätte" all resolve to "haben" → one DB entry.
    Returns dict[lang, list of successfully written lemmas].
    """
    total_surface = sum(len(v) for v in missing_by_lang.values())
    print(f"[dict] Step 1 — lemmatising {total_surface} surface forms across "
          f"{len(missing_by_lang)} languages...")

    enrich_tasks: list = []  # (lang, lemma) to enrich

    for lang, surface_forms in sorted(missing_by_lang.items()):
        # Batch-identify the root form for every surface form
        mapping = _batch_lemmatize(client, surface_forms, lang)
        unique_lemmas = sorted(set(mapping.values()))
        print(f"  [{lang}] {len(surface_forms)} surface forms → "
              f"{len(unique_lemmas)} unique lemmas (saved "
              f"{len(surface_forms) - len(unique_lemmas)} duplicate calls)")

        # Re-check Supabase for lemmas that may already exist post-dedup
        already_in_db: set = set()
        for start in range(0, len(unique_lemmas), 500):
            batch = unique_lemmas[start:start + 500]
            try:
                resp = (supa.table("word_dictionary")
                        .select("lemma")
                        .eq("language", lang)
                        .in_("lemma", batch)
                        .execute())
                for row in resp.data:
                    already_in_db.add(row["lemma"])
            except Exception as e:
                print(f"[WARN] [dict] Supabase re-check failed for {lang}: {e}",
                      file=sys.stderr)

        for lemma in unique_lemmas:
            if lemma not in already_in_db:
                enrich_tasks.append((lang, lemma))

    print(f"[dict] Step 2 — enriching {len(enrich_tasks)} unique lemmas...")

    written: dict[str, list[str]] = defaultdict(list)

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_pair = {
            executor.submit(
                _call_gemini, client,
                # Pass the lemma as the lookup form — model confirms root + builds entry
                _DICT_PROMPT.format(
                    language=LANG_NAMES.get(lang, lang),
                    surface_form=lemma,
                ),
                f"dict/{lang}/{lemma}",
            ): (lang, lemma)
            for lang, lemma in enrich_tasks
        }

        for future in as_completed(future_to_pair):
            lang, lemma = future_to_pair[future]
            card = future.result()
            if not card:
                continue

            # Clean null-as-string values
            for key in ("tip", "word_family", "common_collocations", "governed_prepositions"):
                if card.get(key) in ("null", ""):
                    card[key] = None

            # Use lemma returned by model, falling back to what we passed in
            confirmed_lemma = (card.get("lemma") or lemma).lower()
            word_type = card.get("word_type") or "other"
            data      = card.get("data") or {}

            # Ensure tenses dict is clean
            if isinstance(data.get("tenses"), dict):
                data["tenses"] = {
                    label: table
                    for label, table in data["tenses"].items()
                    if isinstance(table, dict) and table
                }
                if not data["tenses"]:
                    del data["tenses"]

            row = {
                "language":              lang,
                "word":                  confirmed_lemma,   # root form, not the surface form
                "lemma":                 confirmed_lemma,
                "word_type":             word_type,
                "translation":           card.get("translation") or "",
                "level":                 card.get("level"),
                "ipa":                   card.get("ipa"),
                "explanation":           card.get("explanation"),
                "example_sentence":      card.get("example_sentence"),
                "example_translation":   card.get("example_translation"),
                "tip":                   card.get("tip"),
                "word_family":           card.get("word_family"),
                "common_collocations":   card.get("common_collocations"),
                "governed_prepositions": card.get("governed_prepositions"),
                "source":                "gemini",
                "data":                  data if data else None,
            }
            try:
                supa.table("word_dictionary").upsert(
                    row, on_conflict="language,lemma,word_type"
                ).execute()
                written[lang].append(confirmed_lemma)
                print(f"[dict] ✓ {lang}/{confirmed_lemma}")
            except Exception as e:
                print(f"[ERROR] [dict] Supabase upsert failed {lang}/{lemma}: {e}",
                      file=sys.stderr)

    return dict(written)


# ── Notification helper ────────────────────────────────────────────────────────

def _build_dict_summary(
    missing_by_lang: dict[str, list[str]],
    written_by_lang: dict[str, list[str]],
    dry_run: bool,
) -> str:
    LANG_FLAGS = {
        "fr": "🇫🇷", "de": "🇩🇪", "sv": "🇸🇪", "en": "🇬🇧",
        "it": "🇮🇹", "es": "🇪🇸", "tr": "🇹🇷", "hu": "🇭🇺",
    }

    if dry_run:
        total_missing = sum(len(v) for v in missing_by_lang.values())
        if total_missing == 0:
            return "📖 Dictionary: no new words today"

        lines = [f"📖 Dictionary (dry-run): {total_missing} words to add"]
        for lang in sorted(missing_by_lang):
            flag  = LANG_FLAGS.get(lang, "  ")
            words = missing_by_lang[lang]
            name  = LANG_NAMES.get(lang, lang)
            lines.append(f"  {flag} {name} ({len(words)}): {', '.join(words[:10])}"
                         + (" …" if len(words) > 10 else ""))
        return "\n".join(lines)

    total_written = sum(len(v) for v in written_by_lang.values())
    if total_written == 0:
        return "📖 Dictionary: no new words today"

    lines = [f"📖 Dictionary: {total_written} new word(s) added"]
    for lang in sorted(written_by_lang):
        flag  = LANG_FLAGS.get(lang, "  ")
        words = written_by_lang[lang]
        name  = LANG_NAMES.get(lang, lang)
        lines.append(f"  {flag} {name} ({len(words)}): {', '.join(words[:10])}"
                     + (" …" if len(words) > 10 else ""))
    return "\n".join(lines)


def _append_to_github_env(dict_summary: str) -> None:
    """Append DICT_SUMMARY to GITHUB_ENV so the workflow notification picks it up."""
    github_env = os.getenv("GITHUB_ENV")
    if not github_env:
        return
    with open(github_env, "a", encoding="utf-8") as f:
        f.write(f"DICT_SUMMARY<<DICT_EOF\n{dict_summary}\nDICT_EOF\n")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Bilinguist Dictionary — populate word_dictionary from today's bundle"
    )
    parser.add_argument("--date",    help="Override date (YYYY-MM-DD). Defaults to today UTC.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report missing words only — no Gemini calls, no Supabase writes.")
    parser.add_argument("--bundle",  help="Path to a bundle JSON file (overrides --date lookup).")
    args = parser.parse_args()

    dry_run = args.dry_run
    date    = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    mode_label = "DRY-RUN" if dry_run else "LIVE"
    print(f"[dict] Starting — {date} — {mode_label}")

    # ── Load bundle ─────────────────────────────────────────────────────────
    if args.bundle:
        bundle_path = Path(args.bundle)
    else:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        bundle_path = OUTPUT_DIR / "latest.json"

    if not bundle_path.exists():
        print(f"[dict] ERROR: Bundle not found at {bundle_path}", file=sys.stderr)
        sys.exit(1)

    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    actual_date = bundle.get("date", date)
    print(f"[dict] Bundle date: {actual_date}")

    # ── Extract lemmas ───────────────────────────────────────────────────────
    lemmas_by_lang = extract_lemmas(bundle)

    total_lemmas = sum(len(v) for v in lemmas_by_lang.values())
    print(f"[dict] Total unique lemmas/forms: {total_lemmas} across "
          f"{len(lemmas_by_lang)} languages")
    for lang in sorted(lemmas_by_lang):
        print(f"  {LANG_NAMES.get(lang, lang)}: {len(lemmas_by_lang[lang])} lemmas")

    if not lemmas_by_lang:
        print("[dict] No lemmas found — nothing to do.")
        _append_to_github_env("📖 Dictionary: no new words today")
        return

    # ── Initialise Supabase ──────────────────────────────────────────────────
    env = _load_env()
    supa_url = (env.get("EXPO_PUBLIC_SUPABASE_URL") or
                os.getenv("EXPO_PUBLIC_SUPABASE_URL", ""))
    supa_key = (env.get("SUPABASE_SERVICE_ROLE_KEY") or
                os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))

    supa = None
    if supa_url and supa_key:
        try:
            from supabase import create_client
            supa = create_client(supa_url, supa_key)
            print("[dict] Supabase client initialised")
        except Exception as e:
            print(f"[ERROR] [dict] Supabase init failed: {e}", file=sys.stderr)
    else:
        print("[WARN] [dict] Supabase credentials not found — skipping existence check",
              file=sys.stderr)

    # ── Find missing words ───────────────────────────────────────────────────
    missing_by_lang: dict[str, list[str]] = {}
    if supa:
        print("[dict] Querying Supabase for existing entries...")
        missing_by_lang = find_missing(supa, lemmas_by_lang)
        total_missing = sum(len(v) for v in missing_by_lang.values())
        total_existing = total_lemmas - total_missing
        print(f"[dict] {total_existing} already in dictionary | "
              f"{total_missing} missing")
        for lang in sorted(missing_by_lang):
            print(f"  {LANG_NAMES.get(lang, lang)}: {len(missing_by_lang[lang])} missing")
    else:
        # No Supabase — treat everything as missing (for offline testing)
        missing_by_lang = {lang: sorted(s) for lang, s in lemmas_by_lang.items()}

    # ── Dry-run report ───────────────────────────────────────────────────────
    if dry_run:
        total_missing = sum(len(v) for v in missing_by_lang.values())
        print(f"\n{'='*60}")
        print(f"DRY-RUN REPORT — {actual_date}")
        print(f"{'='*60}")
        print(f"Total lemmas extracted : {total_lemmas}")
        print(f"Already in dictionary  : {total_lemmas - total_missing}")
        print(f"Missing (would add)    : {total_missing}")
        print()

        for lang in sorted(missing_by_lang):
            name  = LANG_NAMES.get(lang, lang)
            words = missing_by_lang[lang]
            print(f"{name} ({len(words)} missing):")
            # Print 20 per line for readability
            for i in range(0, len(words), 20):
                print("  " + ", ".join(words[i:i+20]))
            print()

        summary = _build_dict_summary(missing_by_lang, {}, dry_run=True)
        print(f"Notification preview:\n{summary}")
        _append_to_github_env(summary)
        return

    # ── Live mode ────────────────────────────────────────────────────────────
    if not missing_by_lang:
        print("[dict] Nothing to generate — dictionary is up to date.")
        summary = "📖 Dictionary: no new words today"
        _append_to_github_env(summary)
        return

    # Check API key for live Gemini calls
    dict_api_key = (env.get("GEMINI_DICTIONARY_API_KEY") or
                    os.getenv("GEMINI_DICTIONARY_API_KEY", ""))
    if not dict_api_key:
        # Fall back to main key if separate key not set
        dict_api_key = (env.get("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY", ""))
    if not dict_api_key:
        print("[ERROR] [dict] No GEMINI_DICTIONARY_API_KEY or GEMINI_API_KEY found",
              file=sys.stderr)
        sys.exit(1)

    try:
        from google import genai
        client = genai.Client(api_key=dict_api_key)
        print(f"[dict] Gemini client initialised (model: {MODEL_DICT})")
    except Exception as e:
        print(f"[ERROR] [dict] Gemini init failed: {e}", file=sys.stderr)
        sys.exit(1)

    written_by_lang = generate_and_write(client, supa, missing_by_lang)
    total_written = sum(len(v) for v in written_by_lang.values())

    # Cost report
    usd = (
        (_dict_input_tokens  / 1_000_000) * FLASH_LITE_INPUT_USD_PER_M +
        (_dict_output_tokens / 1_000_000) * FLASH_LITE_OUTPUT_USD_PER_M
    )
    print(f"[dict] Done — {total_written} cards written | "
          f"{_dict_calls} calls | ${usd:.4f} (£{usd * USD_TO_GBP:.4f})")

    summary = _build_dict_summary(missing_by_lang, written_by_lang, dry_run=False)
    print(f"\nNotification:\n{summary}")
    _append_to_github_env(summary)


if __name__ == "__main__":
    main()

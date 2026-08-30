"""
bilinguist_tokenise.py
======================
Stage 10 (Enrich) of the Bilinguist Brief daily pipeline.

Runs after Stage 8 (Grade Levels). For every article variant in today's bundle:
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
import bisect
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import regex as uregex                          # pip install regex — true \p{L} support
# NOTE: google-genai and supabase are imported lazily inside the dictionary
# functions. The tokenMap path is pure spaCy and must import cleanly without them.
try:                                    # pragma: no cover - optional, dictionary half only
    from google import genai
    from google.genai import types
except Exception:                       # noqa: BLE001
    genai = types = None

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


# ── spaCy token analysis ─────────────────────────────────────────────────────
# Replaces the Gemini call this script was originally built around. This is a
# solved deterministic parsing task: spaCy is free, offline, needs no API key,
# runs in milliseconds per article, and cannot hallucinate a position or a lemma.
#
# The bug being fixed: German separable verbs. In "Eine Koalition lehnt einen
# Vorschlag ab", the prefix "ab" sits at the end of the clause, so tapping "lehnt"
# looked up "lehnen" (to lean) rather than "ablehnen" (to reject) -- frequently the
# opposite meaning. Swedish particle verbs have the same problem.
#
# The two languages need DIFFERENT handling, and neither matches the obvious guess:
#
#   German  de_core_news_sm uses the TIGER scheme, not Universal Dependencies, so
#           the relation is "svp" and NOT "compound:prt". spaCy also does not
#           reunite the compound -- head.lemma_ for "lehnt ... ab" is "lehnen",
#           so the infinitive is built here as prefix + stem -> "ablehnen".
#   Swedish sv_core_news_sm uses UD, so the relation IS "compound:prt", and the
#           lemma is written with a space -- "slå upp", not "slåupp".
#
# Verified on 2026-08-28: svp fires on "lehnt...ab", "wies...zurück" (ablaut) and
# "trat...zurück", and correctly does NOT fire on the subordinate clause "weil ich
# dich ansehe", the participle "angesehen", or prepositional "Ab Montag".
SPACY_MODELS = {
    "de": "de_core_news_sm",   # priority 1 -- the reported bug
    "sv": "sv_core_news_sm",   # priority 2 -- same class of bug
    "en": "en_core_web_sm",
    "fr": "fr_core_news_sm",
    "es": "es_core_news_sm",
    "it": "it_core_news_sm",
    "pt": "pt_core_news_sm",
}

# Dependency label marking a detached verb particle, per language scheme.
_PARTICLE_DEP = {"de": "svp", "sv": "compound:prt"}

# Dependency label attaching an article to its noun. Verified empirically per model
# on 2026-08-30, because the schemes differ and guessing "det" would silently miss
# German entirely: de_core_news_sm is TIGER and uses "nk" (tag ART); every other
# model is UD and uses "det".
_ARTICLE_DEP = {"de": "nk"}
_ARTICLE_DEP_DEFAULT = "det"

# Articles only -- NOT demonstratives, possessives or quantifiers. spaCy's DET covers
# all of them, and morph PronType separates them cleanly in every model tested:
# der/die/das/ein and their equivalents are PronType=Art, while dieser/ce/este are
# Dem, mein/mi are Prs, and jeder/cada are Ind/Tot. Starting with articles alone so
# the effect can be judged before widening.
#
# Expected coverage gaps, not misses: fused forms carry no separate article token
# (German im/am/zum, French du/au/des, Italian del/nel, Portuguese do/na, Spanish
# al/del), and the Swedish definite article is a noun suffix -- "natten" has nothing
# to link, while indefinite "ett hus" does.

_NLP_CACHE: dict = {}


def _load_nlp(lang: str):
    """Load a spaCy model once per language. Missing model -> None, never raises.

    A language with no model (tr, hu, ar have none at all) simply ships without a
    tokenMap, and the app falls back to its current behaviour.
    """
    if lang in _NLP_CACHE:
        return _NLP_CACHE[lang]
    name = SPACY_MODELS.get(lang)
    nlp = None
    if name:
        try:
            import spacy
            nlp = spacy.load(name, disable=["ner"])
        except Exception as e:                                    # noqa: BLE001
            print(f"[tokenise] no spaCy model for {lang} ({name}): {e}", file=sys.stderr)
    _NLP_CACHE[lang] = nlp
    return nlp


def _compound_lemma(lang: str, particle: str, stem: str) -> str:
    """Reunite a separated particle verb into its dictionary form."""
    if lang == "de":
        return f"{particle.lower()}{stem.lower()}"      # ab + lehnen -> ablehnen
    return f"{stem.lower()} {particle.lower()}"          # slå + upp   -> slå upp


_GENDER = {"Masc": "m", "Fem": "f", "Neut": "n"}


def analyse_article(text: str, lang: str, stats: Optional[dict] = None) -> Optional[list]:
    """Build the tokenMap for one article. Returns None if the language has no model.

    Positions follow the app's contract exactly: zero-indexed over _WORD_RE matches
    of `headline + "\n" + body`, counting ONLY word tokens -- whitespace and
    punctuation consume no index.
    """
    nlp = _load_nlp(lang)
    if nlp is None:
        return None

    spans = [(m.start(), m.end()) for m in _WORD_RE.finditer(text)]
    if not spans:
        return []

    doc = nlp(text)

    # spaCy tokenises differently from _WORD_RE (it splits punctuation into its own
    # tokens, and _WORD_RE keeps "l'homme" whole). Map by character offset rather
    # than by index -- using spaCy's own indices is the main correctness risk here.
    starts = [a for a, _ in spans]
    tok_at: dict[int, object] = {}
    for t in doc:
        if not t.text.strip() or t.is_punct or t.is_space:
            continue
        i = bisect.bisect_right(starts, t.idx) - 1
        if i < 0 or not (spans[i][0] <= t.idx < spans[i][1]):
            continue
        # Several spaCy tokens can fall inside one _WORD_RE match; keep the longest,
        # which is the one carrying the real lemma.
        prev = tok_at.get(i)
        if prev is None or len(t.text) > len(prev.text):
            tok_at[i] = t

    tokens = []
    for pos, (a, b) in enumerate(spans):
        t = tok_at.get(pos)
        surface = text[a:b]
        entry = {"position": pos, "surface": surface,
                 # spaCy's own casing is kept: German dictionary forms are
                 # capitalised for nouns ("Koalition"), lowercase for verbs.
                 "lemma": (t.lemma_ if t is not None and t.lemma_ else surface),
                 "pos": (t.pos_ if t is not None else "X"),
                 "linked_positions": []}
        if t is not None:
            g = t.morph.get("Gender")
            if g and g[0] in _GENDER:
                entry["gender"] = _GENDER[g[0]]
        tokens.append(entry)

    # Reunite separated particle verbs: same compound lemma on BOTH positions,
    # linked symmetrically so the app highlights the pair.
    # Link each article to its head noun, so tapping either highlights both and the
    # learner sees the gender bound to its noun. Kept as a separate link TYPE from
    # separable verbs so the two can be counted independently; unlike separable
    # verbs this does NOT rewrite either lemma -- the noun keeps its own, and the
    # app renders "article + lemma" as the popup subtitle.
    art_dep = _ARTICLE_DEP.get(lang, _ARTICLE_DEP_DEFAULT)
    pos_of_all = {t.i: i for i, t in tok_at.items()}
    art_pairs = 0
    for t in doc:
        if t.pos_ != "DET" or t.dep_ != art_dep:
            continue
        if "Art" not in t.morph.get("PronType"):
            continue
        # The head must actually be a noun. Swedish in particular sometimes attaches
        # a stray article to the verb ("En lång natt slutade" -> head=slutade).
        if t.head.pos_ not in ("NOUN", "PROPN"):
            continue
        d_pos, n_pos = pos_of_all.get(t.i), pos_of_all.get(t.head.i)
        if d_pos is None or n_pos is None or d_pos == n_pos:
            continue
        for x, y in ((d_pos, n_pos), (n_pos, d_pos)):
            if y not in tokens[x]["linked_positions"]:
                tokens[x]["linked_positions"].append(y)
        art_pairs += 1
    if stats is not None:
        stats["article_noun"] = stats.get("article_noun", 0) + art_pairs

    dep = _PARTICLE_DEP.get(lang)
    if dep:
        # Key on spaCy's own token index, NOT id(): spaCy builds a fresh Token
        # object on every access, so identity is not stable across iterations and
        # the lookup silently misses every time.
        pos_of = {t.i: i for i, t in tok_at.items()}
        for t in doc:
            if t.dep_ != dep:
                continue
            p_pos, v_pos = pos_of.get(t.i), pos_of.get(t.head.i)
            if p_pos is None or v_pos is None or p_pos == v_pos:
                continue
            lemma = _compound_lemma(lang, t.text, t.head.lemma_)
            for x, y in ((v_pos, p_pos), (p_pos, v_pos)):
                tokens[x]["lemma"] = lemma
                if y not in tokens[x]["linked_positions"]:
                    tokens[x]["linked_positions"].append(y)
            tokens[p_pos]["pos"] = "PART"
            if stats is not None:
                stats["separable_verb"] = stats.get("separable_verb", 0) + 1

    return tokens


def validate_token_map(tokens: list, text: str, label: str) -> list:
    """Enforce the app contract. Drops bad links rather than shipping a wrong map."""
    words = [m.group(0) for m in _WORD_RE.finditer(text)]
    n = len(words)

    for t in tokens:
        p = t["position"]
        # 1. surface must equal the app's Nth \p{L} match -- assert, don't trust
        if not (0 <= p < n) or t["surface"] != words[p]:
            print(f"[tokenise] {label}: position {p} does not match the app's "
                  f"tokenisation — dropping tokenMap", file=sys.stderr)
            return []
        # in-bounds, no self-links
        t["linked_positions"] = [x for x in t["linked_positions"] if 0 <= x < n and x != p]

    # 2. symmetry: if 2 links to 7, 7 must link back to 2
    by_pos = {t["position"]: t for t in tokens}
    for t in tokens:
        for x in list(t["linked_positions"]):
            other = by_pos.get(x)
            if other is None:
                t["linked_positions"].remove(x)
            elif t["position"] not in other["linked_positions"]:
                other["linked_positions"].append(t["position"])
    return tokens


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

def enrich_bundle_with_token_maps(bundle: dict) -> int:
    """Add a tokenMap to every article variant in the bundle. Returns articles enriched.

    Runs after every native and CEFR variant is written and graded -- so no later
    step rewrites the prose -- and before the bundle is serialised. It mutates the
    article dicts in place; the caller then writes the bundle as normal.

    Deliberately does NOT touch the dictionary half of this script. The app reads
    word meanings from a Cloudflare Worker backed by D1, generated and cached on
    demand; it does not read Supabase, and enabling that path would deepen the split
    between two dictionary backends.
    """
    tasks: list[tuple[dict, str, str]] = []
    for lang, lang_data in (bundle.get("briefings") or {}).items():
        for level, level_data in lang_data.items():
            for length, briefing in level_data.items():
                for i, article in enumerate(briefing.get("articles", [])):
                    tasks.append((article, lang, f"{lang}/{level}/{length}/{i}"))
    # nativeJournalism/nativeIntermediate are shaped {lang: {length: [articles]}} --
    # NOT {lang: [articles]} like an earlier version of this walk assumed. That bug
    # enumerated the length KEYS, so `article` was the string "short"/"longer",
    # _p5_article_text raised AttributeError, and the per-task except swallowed it as
    # "analysis failed". Every native article shipped without a tokenMap for a full
    # day, silently -- and native is the richest German in the product, exactly where
    # separable verbs matter most.
    for key in ("nativeJournalism", "nativeIntermediate"):
        for lang, length_data in (bundle.get(key) or {}).items():
            if not isinstance(length_data, dict):
                print(f"[tokenise] {key}.{lang}: expected {{length: [...]}}, got "
                      f"{type(length_data).__name__} — skipped", file=sys.stderr)
                continue
            for length, articles in length_data.items():
                for i, article in enumerate(articles or []):
                    tasks.append((article, lang, f"{lang}/Native/{length}/{i}"))

    # Guard: a task item must be an article dict. The shape bug above was invisible
    # because a wrong type only surfaced as a swallowed per-article exception.
    bad = [lbl for art, _, lbl in tasks if not isinstance(art, dict)]
    if bad:
        raise TypeError(f"tokenise: {len(bad)} task(s) are not article dicts, "
                        f"e.g. {bad[:3]} — bundle shape has changed")

    langs = sorted({l for _, l, _ in tasks})
    have  = [l for l in langs if _load_nlp(l) is not None]
    skip  = [l for l in langs if l not in have]
    print(f"[tokenise] {len(tasks)} article variants | models: {', '.join(have) or 'none'}"
          + (f" | no model, shipping without tokenMap: {', '.join(skip)}" if skip else ""))

    enriched = linked = 0
    by_lang: dict[str, list] = {l: [0, 0, 0, 0] for l in langs}  # enriched, total, svp, art
    for article, lang, label in tasks:
        by_lang[lang][1] += 1
        text = _p5_article_text(article)
        st: dict = {}
        try:
            tokens = analyse_article(text, lang, st)
        except Exception as e:                                    # noqa: BLE001
            print(f"[tokenise] {label}: analysis failed ({e}) — shipping without "
                  f"tokenMap", file=sys.stderr)
            continue
        if tokens is None:
            continue
        tokens = validate_token_map(tokens, text, label)
        if not tokens:
            continue
        article["tokenMap"] = tokens
        enriched += 1
        by_lang[lang][0] += 1
        by_lang[lang][2] += st.get("separable_verb", 0)
        by_lang[lang][3] += st.get("article_noun", 0)
        linked += sum(1 for t in tokens if t["linked_positions"])

    # Report per language, and shout if a language with a model enriched nothing --
    # that is what a silent failure looks like from the outside.
    for lang in sorted(by_lang):
        got, want, svp_n, art_n = by_lang[lang]
        note = "" if _load_nlp(lang) is None else (
            "  ← ZERO ENRICHED, model loaded: something is wrong" if got == 0 else "")
        # Linked pairs per language make separable-verb recall measurable run over
        # run, instead of something eyeballed from a sample.
        # Two link types counted separately so a regression in one stays visible
        # even while the other is healthy.
        print(f"[tokenise]   {lang}: {got}/{want} enriched, {svp_n} separable-verb "
              f"pair(s), {art_n} article-noun pair(s){note}"
              + ("" if _load_nlp(lang) is not None else "  (no model)"))
    for lang, (got, want, _s, _a) in by_lang.items():
        if want and got == 0 and _load_nlp(lang) is not None:
            print(f"[WARN] tokenise: {lang} has a spaCy model but produced no tokenMaps "
                  f"across {want} articles", file=sys.stderr)

    print(f"[tokenise] Done — {enriched}/{len(tasks)} articles carry a tokenMap, "
          f"{linked} tokens in multi-word units")
    return enriched


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
    client = genai.Client() if genai else None
    print(f"[P5] Gemini client initialised (model: {MODEL_P5})")

    # Initialise Supabase
    env = _load_env()
    supa_url = env.get("EXPO_PUBLIC_SUPABASE_URL", "")
    supa_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    supa = None
    if supa_url and supa_key:
        from supabase import create_client
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

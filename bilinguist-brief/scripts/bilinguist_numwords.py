"""
Spell out numbers in brackets for beginner articles: "25 (twenty-five)".

Applies to A1 and A2 articles only (per Will's decision, 2026-08-30 — B1 readers
are expected to read numerals fluently; the scaffolding is for true beginners).
Covers plain numbers, years, percentages and currency amounts, since all of those
were in scope by request — but see WHY NOT num2words' 'currency' mode below.

Deterministic, not written into the writer's prompt. num2words gets every one of
the seven supported languages right out of the box (verified 2026-08-30); an LLM
asked to spell a number in French or German risks a wrong compound word, which is
exactly the class of error bilinguist_numcheck.py already exists to catch
elsewhere. A library either produces the correct word or raises — it doesn't
invent a plausible-looking wrong one.

WHY NOT num2words' 'currency' mode: it treats the number as an exact amount, so
`num2words(20, lang="en", to="currency", currency="GBP")` gives "zero pounds
sterling, twenty pence" — correct for "£20.00" the price, completely wrong for
"£20 billion" the figure this factbase actually contains. Every number here is
spelled as a plain cardinal; the currency symbol and magnitude word ("billion",
"miljard") are already text in the article and are left untouched, exactly as
bilinguist_numcheck.py's magnitude tables already treat them.

WHY spaCy TOKENS, NOT A REGEX (rewritten 2026-08-30, Will's suggestion): a first
version used a hand-built regex to find number boundaries in prose, borrowing the
space-as-thousands-separator logic from bilinguist_numcheck.py. That logic is
correct there because it only ever checks a number ALREADY KNOWN to be one
number against the fact-base. Reused here to blindly scan prose, it fused two
unrelated adjacent numbers into one wrong figure: "erhob 2026 20 Milliarden" (a
year and an amount, one space apart) was read as 202,620. spaCy's tokenizer
never has this problem — it splits on the word boundary first, so "2026" and
"20" are already two separate tokens by the time either is examined; there is
no boundary to get wrong. It also gets the sentence-final-period case right for
free ("...in 2026." keeps the period as its own PUNCT token) where the regex
needed a hand-tuned lookahead and still needed a second pass to prove correct.

Runs on ITS OWN spaCy parse, separate from bilinguist_tokenise.py's, and MUST
run BEFORE it. This module inserts new words into the article text, which
shifts every later word's position; the tokeniser's positions are only valid
against the FINAL text, so it has to parse whatever this module produces, not
the other way round. Sharing one parse between the two was considered and
rejected: doing so would mean hand-adjusting the tokeniser's positions by how
much text was inserted before each one -- exactly the fragile offset arithmetic
that caused the bug above. A full bundle's A1/A2 articles parse in well under a
second either way, so a second parse costs nothing worth trading correctness for.
"""

from __future__ import annotations

import sys
from typing import Optional

from bilinguist_numcheck import _parse_leading_number  # reuse: same locale-aware
                                                         # decimal/thousands logic
                                                         # already trusted elsewhere

try:
    from num2words import num2words
except ImportError:                                     # pragma: no cover
    num2words = None

# Languages this ships for. tr/hu/ar have no num2words support and are skipped
# the same way they skip spaCy tokenisation — no bracket, not an error.
NUM2WORDS_LANGS = {"en", "fr", "de", "es", "it", "pt", "sv"}

SPACY_MODELS = {
    "de": "de_core_news_sm", "sv": "sv_core_news_sm", "en": "en_core_web_sm",
    "fr": "fr_core_news_sm", "es": "es_core_news_sm", "it": "it_core_news_sm",
    "pt": "pt_core_news_sm",
}

# 'to="year"' reads more naturally ("twenty twenty-six" vs "two thousand and
# twenty-six") but num2words has no Swedish year mode -- verified 2026-08-30,
# raises NotImplementedError. Falls back to cardinal for sv, which is correct,
# just less colloquial.
_YEAR_SUPPORTED = NUM2WORDS_LANGS - {"sv"}
_YEAR_RANGE = range(1000, 2200)

# Levels this applies to. Matches CEFR_ORDER's own strings.
APPLIES_TO_LEVELS = {"A1", "A2"}

_NLP_CACHE: dict = {}


def _load_nlp(lang: str):
    """Load a spaCy model once per language. Missing model -> None, never raises."""
    if lang in _NLP_CACHE:
        return _NLP_CACHE[lang]
    name = SPACY_MODELS.get(lang)
    nlp = None
    if name and lang in NUM2WORDS_LANGS:
        try:
            import spacy
            nlp = spacy.load(name, disable=["ner", "parser"])
        except Exception as e:                                    # noqa: BLE001
            print(f"[10 spaCy — numwords] no spaCy model for {lang} ({name}): {e}",
                  file=sys.stderr)
    _NLP_CACHE[lang] = nlp
    return nlp


def _looks_like_year(raw: str, is_percent_context: bool) -> bool:
    if is_percent_context or not raw.isdigit() or len(raw) != 4:
        return False
    try:
        return int(raw) in _YEAR_RANGE
    except ValueError:
        return False


def spell_number(raw: str, lang: str, is_year: bool) -> Optional[str]:
    """Return the spelled-out form, or None if this number can't be converted
    (parse failure, unsupported language) -- callers must skip, never guess."""
    if num2words is None or lang not in NUM2WORDS_LANGS:
        return None
    value = _parse_leading_number(raw)
    if value is None:
        return None
    try:
        if is_year and lang in _YEAR_SUPPORTED:
            words = num2words(int(value), lang=lang, to="year")
        elif value == int(value):
            words = num2words(int(value), lang=lang)
        else:
            words = num2words(value, lang=lang)
    except (NotImplementedError, OverflowError, ValueError) as e:
        print(f"[10 spaCy — numwords] {lang}: could not spell {raw!r} ({e}) — skipping",
              file=sys.stderr)
        return None
    return _fix_library_spelling(lang, words)


def _fix_library_spelling(lang: str, words: str) -> str:
    """Correct known num2words output bugs -- library defects, not ours, but they
    ship real spelling errors to real readers if left uncorrected.

    sv: num2words renders 1000 (and any number containing it, e.g. every four-digit
    year) as "etttusen" -- three t's. Swedish orthography never allows three
    consonants in a row; correct is "ettusen" (one 't') or "ett tusen" (two words).
    Confirmed 2026-09-04 against multiple Swedish-language sources, not assumed:
    https://seo-texter.se/ettusen-eller-etttusen/ ,
    https://www.ordkollen.se/ihop-eller-i-sar/ett-tusen-eller-ettusen/
    Found by auditing real 2026-09-03 production output: 17 of 134 Swedish A1/A2
    bracketed numbers carried this, essentially every four-digit year -- i.e. nearly
    every article, not an edge case. "etttusen" is never correct, so this replace is
    unconditional -- no ambiguity, nothing legitimate to preserve.
    """
    if lang == "sv":
        words = words.replace("etttusen", "ettusen")
    return words


def add_number_words(text: str, lang: str) -> tuple[str, int]:
    """Insert '(spelled form)' after every convertible number in `text`.
    Returns (new_text, count). A number that fails to convert is left alone --
    never inserts a wrong or partial word.

    Number BOUNDARIES come entirely from spaCy's tokenizer (pos_ == "NUM" and
    like_num), not from a hand-built regex — see module docstring for why that
    matters. A token is skipped if it has no digit at all: English tags number
    WORDS like "billion" as NUM too (verified 2026-08-30), and those are
    already spelled out, nothing to convert.
    """
    nlp = _load_nlp(lang)
    if not text or nlp is None:
        return text, 0

    doc = nlp(text)
    out, last, count = [], 0, 0
    for i, t in enumerate(doc):
        if t.pos_ != "NUM" or not t.like_num or not any(c.isdigit() for c in t.text):
            continue
        next_tok = doc[i + 1] if i + 1 < len(doc) else None
        is_percent = next_tok is not None and next_tok.text in ("%", "percent", "pct")
        is_year = _looks_like_year(t.text, is_percent)
        words = spell_number(t.text, lang, is_year)
        if not words:
            continue
        out.append(text[last:t.idx + len(t.text)])
        out.append(f" ({words})")
        count += 1
        last = t.idx + len(t.text)
    out.append(text[last:])
    return "".join(out), count


def enrich_bundle_with_number_words(bundle: dict) -> int:
    """Walk every A1/A2 article in the bundle and spell out its numbers in place.
    Native journalism and B1+ are untouched -- this is beginner scaffolding only.
    Returns the number of articles touched."""
    briefings = bundle.get("briefings") or {}
    touched = 0
    total_numbers = 0

    for lang, lang_data in briefings.items():
        if lang not in NUM2WORDS_LANGS:
            continue
        for level, level_data in lang_data.items():
            if level not in APPLIES_TO_LEVELS:
                continue
            for length, briefing in level_data.items():
                for article in briefing.get("articles", []):
                    changed = False
                    for field in ("headline", "body"):
                        if not article.get(field):
                            continue
                        new_text, n = add_number_words(article[field], lang)
                        if n:
                            article[field] = new_text
                            total_numbers += n
                            changed = True
                    if changed:
                        touched += 1

    print(f"[10 spaCy — numwords] {touched} A1/A2 article(s) enriched, "
          f"{total_numbers} number(s) spelled out")
    return touched

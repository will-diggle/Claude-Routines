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

WHY NOT `token.pos_ == "NUM"` AS THE GATE (removed 2026-09-04, Will's real-data
report -- German/French A2, missing brackets on "26. August 2026" and "...2034."
in the Volkswagen article): a small spaCy model's statistical POS tag on a bare
number is unreliable in exactly the cases that matter most here -- dates and
years -- verified directly against every language, not assumed:
  - German: a number directly followed by a period with no space (the German
    ordinal-date convention, "26." = "26th", but ALSO plain sentence-final
    punctuation that happens to land right after a number, "...2034.") gets
    fused into ONE token by the tokenizer either way, then tagged away from
    NUM (ADJ for the true ordinal, X/PROPN/other for the fused full stop --
    inconsistent, sometimes the SAME string tags differently by context). The
    old `pos_ == "NUM"` gate silently dropped every one of these.
  - Spanish: a bare 4-digit year is tagged NOUN, not NUM, depending on the
    preceding word ("para 2035", "desde ... 2024", "entre 2031 y 2034" -- all
    silently dropped) while an identical year elsewhere in the same article
    tags correctly. Confirmed against real 2026-09-04 production es output.
  - French/Italian/Portuguese/Swedish: none of these fuse a trailing period
    or mistag a bare year -- the gate never had anything to do there, so
    dropping it is a no-op for them.
`like_num` plus a real digit in the text turns out to be the correct, and
sufficient, test on its own: it stayed True in every one of the above
mistagged/fused cases (verified), while still correctly staying False for
non-numeric digit-bearing tokens ("COVID-19", "G7", "3:2") regardless of what
POS tag a model happens to assign them -- so removing the POS gate only ADDS
acceptance for genuine numbers, it doesn't loosen what already got excluded.

Two more things came out of chasing the above with real per-token spaCy output,
both handled below:

  1. SENTENT-FINAL PERIOD FUSED ONTO A NUMBER (German only, confirmed): since
     the fused period can be either the ordinal's own marker ("26." keeps it,
     bracket goes after: "26. (sechsundzwanzig)") or an unrelated sentence's
     full stop that just landed adjacent with no space ("2034." -> bracket
     must go BEFORE the period: "2034 (zweitausendvierunddreißig)."), and the
     POS tag can't reliably tell those apart (see above), the two are told
     apart by asking spaCy's own dependency parser for the token's real
     sentence boundary instead: an embedded ordinal is never the last token of
     its sentence, a fused full stop always is. This is why `_load_nlp` now
     keeps the parser enabled (previously disabled alongside ner for speed) --
     same "costs nothing worth trading correctness for" reasoning as above.

  2. SPACE-GROUPED THOUSANDS SPLIT ACROSS TOKENS ("50 000", "1 500 000"):
     European number formatting groups digits in 3s after a plain space, but
     spaCy's tokenizer splits on that space, handing back separate tokens per
     group. French tags the continuation chunk DET (so it silently missed the
     gate either way, old or new -- a coverage gap, not a wrong answer). But
     Swedish tags it NUM/CARD, which means it was ALREADY passing the OLD
     `pos_ == "NUM"` gate and being spelled out as two unrelated numbers --
     "50 000" (fifty thousand) shipping today as "50 (femtio) 000 (noll)"
     ("fifty ... zero"). Confirmed live in the real 2026-09-04 production sv
     bundle: 28 instances across every A1/A2 article that mentions a number
     ≥1000, not an edge case -- a pre-existing bug independent of the POS-gate
     change, caught while testing it. Fixed by merging a run of tokens into
     one number before spelling it whenever each continuation chunk is EXACTLY
     3 digits with EXACTLY one space before it and no other punctuation in
     between -- the one unambiguous signature of this convention, so the merge
     doesn't depend on either language's (proven unreliable) POS tag.

Full-coverage re-derivation against the real 2026-09-04 production bundle (all
7 languages, all A1/A2 articles, not a sample) after this fix: 116 additional
correct brackets recovered across de/fr/es (the fused-period and mistagged-year
cases above), 28 wrong split-number instances in sv corrected to one bracket
each, zero new incorrect merges anywhere.

WHY A NUMBER NEXT TO OR INSIDE AN EXISTING PARENTHETICAL IS SKIPPED (also
2026-09-04, Will's report -- "240 kilometres" reading oddly in the Jackdaw gas
field article): the A1/A2 writer prompt already puts its own parenthetical
right after a number sometimes, independent of this module and unaware of it --
a unit conversion ("this gas field is 150 miles (about 240 kilometres) east of
Aberdeen") or a magnitude gloss ("£32,500 (a lot of money)"). This module used
to insert its own bracket regardless, which either:
  - STACKS two bracket pairs back to back: "50.000 (fünfzigtausend)
    (fünfzigtausend, eine sehr große Zahl)" -- our insertion, then the
    writer's own gloss, immediately adjacent.
  - NESTS one inside the other: "...(about 240 (two hundred and forty)
    kilometres)..." -- our insertion landing INSIDE the writer's already-open
    conversion parenthetical. Balanced parens, but confusing to read either
    way, and neither reads as a mistake a human writer would make.
Both share one structural signature: the writer already opened a "(" for this
number, either right after it (stacked) or somewhere before it and not yet
closed (nested). Rather than trying to intelligently merge prose inside an
arbitrary existing parenthetical across seven languages without an LLM call
(fragile, and against this module's own "skip rather than guess" rule), a
number is simply left unbracketed whenever either is true: (a) it falls inside
an already-open, unmatched "(" (tracked via a running paren-depth count over
the raw text), or (b) the text immediately following it already starts with
"(". The reader still gets the writer's own explanatory content either way --
just without a redundant or nested numeral-spelling stacked onto it. Confirmed
against the real 2026-09-04 production bundle: 70 such collisions across all 7
languages in that one day's output alone (de 11, fr 9, es 5, it 7, pt 10,
sv 15, en 13) -- not an edge case -- all resolved with this rule and zero
newly-introduced collisions anywhere after.
"""

from __future__ import annotations

import re
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
_GROUP3_RE = re.compile(r"^\d{3}$")  # a thousands-grouping continuation chunk


def _load_nlp(lang: str):
    """Load a spaCy model once per language. Missing model -> None, never raises.

    Parser stays ENABLED (only ner is disabled) -- needed for real sentence
    boundaries, which is how a German number's fused trailing period is told
    apart from a fused sentence-final full stop. See module docstring."""
    if lang in _NLP_CACHE:
        return _NLP_CACHE[lang]
    name = SPACY_MODELS.get(lang)
    nlp = None
    if name and lang in NUM2WORDS_LANGS:
        try:
            import spacy
            nlp = spacy.load(name, disable=["ner"])
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


def _paren_depth_prefix(text: str) -> list[int]:
    """depths[i] = how many unmatched '(' precede position i in `text`. Used to
    tell whether a number already sits inside a writer-authored parenthetical
    -- see module docstring "WHY A NUMBER NEXT TO OR INSIDE AN EXISTING
    PARENTHETICAL IS SKIPPED"."""
    depths = [0] * (len(text) + 1)
    depth = 0
    for idx, ch in enumerate(text):
        depths[idx] = depth
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
    depths[len(text)] = depth
    return depths


def add_number_words(text: str, lang: str) -> tuple[str, int]:
    """Insert '(spelled form)' after every convertible number in `text`.
    Returns (new_text, count). A number that fails to convert is left alone --
    never inserts a wrong or partial word.

    Number BOUNDARIES come from spaCy's tokenizer (like_num + a real digit),
    NOT a hand-built regex and, since 2026-09-04, NOT the token's POS tag
    either — see module docstring for why the POS tag turned out to be
    unreliable in exactly the cases (dates, years) this exists to handle, and
    for the two related fixes below (fused-period placement, space-grouped
    thousands). A token is skipped if it has no digit at all: English tags
    number WORDS like "billion" as NUM too (verified 2026-08-30), and those
    are already spelled out, nothing to convert. A number already next to or
    inside a writer-authored parenthetical is also skipped — see module
    docstring "WHY A NUMBER NEXT TO OR INSIDE AN EXISTING PARENTHETICAL IS
    SKIPPED".
    """
    nlp = _load_nlp(lang)
    if not text or nlp is None:
        return text, 0

    doc = nlp(text)
    depths = _paren_depth_prefix(text)
    out, last, count = [], 0, 0
    i, n = 0, len(doc)
    while i < n:
        t = doc[i]
        if not t.like_num or not any(c.isdigit() for c in t.text):
            i += 1
            continue

        # Merge a run of space-grouped thousands chunks ("50 000", "1 500 000")
        # into ONE number before spelling it -- see module docstring point 2.
        digits = [t.text]
        end_tok = t
        j = i + 1
        while (
            j < n
            and doc[j].idx == end_tok.idx + len(end_tok.text) + 1
            and _GROUP3_RE.match(doc[j].text)
        ):
            digits.append(doc[j].text)
            end_tok = doc[j]
            j += 1
        raw = "".join(digits)
        true_end = end_tok.idx + len(end_tok.text)

        # Never insert next to or inside a parenthetical the writer already
        # put here -- see module docstring "WHY A NUMBER NEXT TO OR INSIDE AN
        # EXISTING PARENTHETICAL IS SKIPPED".
        already_inside_parens = depths[t.idx] > 0
        writer_gloss_follows = text[true_end:true_end + 2].lstrip(" ").startswith("(")
        if already_inside_parens or writer_gloss_follows:
            i = j
            continue

        # A German number can have a period fused onto it by the tokenizer --
        # either its own ordinal-date marker (keep it, bracket goes after) or
        # an unrelated sentence's full stop landing adjacent with no space
        # (bracket must go BEFORE it instead) -- see module docstring point 1.
        # Only ever checked on an unmerged token: a grouped-thousands run
        # never ends a German ordinal-date expression.
        span_end = true_end
        trailing_period = ""
        if j == i + 1 and end_tok.text.endswith(".") and end_tok.sent[-1] == end_tok:
            raw = raw[:-1]
            trailing_period = "."
            span_end -= 1

        next_tok = doc[j] if j < n else None
        is_percent = next_tok is not None and next_tok.text in ("%", "percent", "pct")
        is_year = len(digits) == 1 and _looks_like_year(raw, is_percent)
        words = spell_number(raw, lang, is_year)
        if not words:
            i += 1
            continue
        out.append(text[last:span_end])
        out.append(f" ({words})")
        out.append(trailing_period)
        count += 1
        last = span_end + len(trailing_period)
        i = j
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
                        original = article[field]
                        new_text, n = add_number_words(original, lang)
                        if n:
                            # Preserve the pre-insertion text under "<field>Audio" so
                            # the audio-narration stage (which reads this article
                            # AFTER this function has already run) can read it aloud
                            # without doubling every number: "25 (twenty-five)"
                            # spoken as written says "twenty-five, twenty-five".
                            # Only set when something actually changed -- B1/B2 and
                            # number-free A1/A2 text never gets an "Audio" field,
                            # and the audio stage falls back to the plain field then.
                            article[f"{field}Audio"] = original
                            article[field] = new_text
                            total_numbers += n
                            changed = True
                    if changed:
                        touched += 1

    print(f"[10 spaCy — numwords] {touched} A1/A2 article(s) enriched, "
          f"{total_numbers} number(s) spelled out")
    return touched

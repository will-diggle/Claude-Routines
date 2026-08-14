"""
bilinguist_numcheck.py
=======================
Deterministic, Python-only fact guardrail — no LLM call, no API key needed.

Two separate things, on purpose:

1. AUTO-FIX magnitude-word mismatches. When an article states a number with a
   million/billion/trillion-class word that doesn't match anything in the fact-base
   at face value, but DOES match a fact-base number once you account for the
   magnitude word being wrong (e.g. "$1.77 trillion" in the fact-base becoming
   "1 770 milliards" in French -- arithmetically equal, since French "milliard" =
   English "billion" = 1e9, so 1770 milliards = 1.77e12 = 1.77 trillion -- but this
   violates the UNITS rule requiring the same magnitude class as the source, which
   in French means "billion" [1e12, long scale], not "milliard"). This is safe to
   auto-correct because the correct value is unambiguously derivable from the
   fact-base -- there is exactly one right answer.

2. FLAG everything else. A number with no relationship at all to anything in the
   fact-base (wrong digit sequence, invented statistic) has no deterministic correct
   replacement -- Python cannot know what the writer meant, so guessing a "fix"
   would be fabricating a correction with no more grounding than the original
   invention. Those are reported as findings, same severity as Stage 5b's LLM-based
   findings, and left for a human or a real re-verification pass to resolve.

Magnitude words are NOT the same multiplier across languages -- English is
short-scale (billion=1e9, trillion=1e12); French, German, Swedish and traditional
Spanish are long-scale (French/German "billion"/"Billion"=1e12, "milliard"/
"Milliarde"=1e9 -- French "billion" equals English "trillion", not English
"billion"). Getting this wrong would make the auto-fixer introduce new errors, so
each language's table is explicit, not derived from English's.
"""

import re
from typing import Optional


# ── Magnitude word tables, per language, explicit multipliers ─────────────────
# Long-scale vs short-scale is the trap: never assume another language's "billion"
# means the same as English's.

MAGNITUDE_WORDS: dict[str, dict[str, float]] = {
    "en": {  # short scale
        "million": 1e6, "millions": 1e6,
        "billion": 1e9, "billions": 1e9,
        "trillion": 1e12, "trillions": 1e12,
    },
    "fr": {  # long scale -- "billion" = 1e12, NOT English "billion"
        "million": 1e6, "millions": 1e6,
        "milliard": 1e9, "milliards": 1e9,
        "billion": 1e12, "billions": 1e12,
    },
    "de": {  # long scale
        "million": 1e6, "millionen": 1e6,
        "milliarde": 1e9, "milliarden": 1e9,
        "billion": 1e12, "billionen": 1e12,
    },
    "sv": {  # long scale
        "miljon": 1e6, "miljoner": 1e6,
        "miljard": 1e9, "miljarder": 1e9,
        "biljon": 1e12, "biljoner": 1e12,
    },
    "it": {  # milione/miliardo standard; "trilione"/"bilione" both seen for 1e12
        "milione": 1e6, "milioni": 1e6,
        "miliardo": 1e9, "miliardi": 1e9,
        "trilione": 1e12, "trilioni": 1e12,
        "bilione": 1e12, "bilioni": 1e12,
    },
    "es": {  # traditional long-scale billón = 1e12
        "millón": 1e6, "millones": 1e6,
        "billón": 1e12, "billones": 1e12,
    },
}

# Canonical word to write back per (language, magnitude) when auto-fixing --
# picks the standard/most common form for that scale in that language.
CANONICAL_WORD: dict[str, dict[float, str]] = {
    "en": {1e6: "million", 1e9: "billion", 1e12: "trillion"},
    "fr": {1e6: "million", 1e9: "milliard", 1e12: "billion"},
    "de": {1e6: "Million", 1e9: "Milliarde", 1e12: "Billion"},
    "sv": {1e6: "miljon", 1e9: "miljard", 1e12: "biljon"},
    "it": {1e6: "milione", 1e9: "miliardo", 1e12: "trilione"},
    "es": {1e6: "millón", 1e9: "mil millones", 1e12: "billón"},
}

_REL_TOLERANCE = 0.02  # 2% -- absorbs rounding ("1.77" vs "1.769" trillion)


def _parse_leading_number(raw: str) -> Optional[float]:
    """Parse a number literal like '1.77', '1,77', '1 770', '22,239'. For a
    magnitude-word number the value in front is almost always small (1-3 digits
    before any decimal point), so a single separator followed by 1-2 digits is
    treated as decimal, not thousands -- avoids misreading '1,77' as 177."""
    s = raw.strip().replace(" ", " ").replace(" ", "")
    if not s:
        return None
    # Normalise: if there's exactly one separator (, or .) followed by 1-2 digits
    # at the end, it's a decimal point regardless of which character was used.
    m = re.match(r"^(\d[\d.,]*?)([.,])(\d{1,2})$", s)
    if m:
        whole = re.sub(r"[.,]", "", m.group(1))
        return float(f"{whole}.{m.group(3)}")
    # Otherwise strip all separators as thousands markers.
    cleaned = re.sub(r"[.,]", "", s)
    try:
        return float(cleaned)
    except ValueError:
        return None


def _magnitude_regex(lang: str) -> re.Pattern:
    words = sorted(MAGNITUDE_WORDS.get(lang, {}), key=len, reverse=True)
    alt = "|".join(re.escape(w) for w in words)
    return re.compile(
        rf"(?P<num>\d[\d.,  ]*\d|\d)\s*(?P<word>{alt})\b",
        re.IGNORECASE,
    )


def extract_magnitude_numbers(text: str, lang: str) -> list[dict]:
    """Find every 'NUMBER magnitude-word' occurrence in text. Returns dicts with
    span, raw text, parsed value, and the matched magnitude word (lowercased)."""
    pattern = _magnitude_regex(lang)
    table = MAGNITUDE_WORDS.get(lang, {})
    out = []
    for m in pattern.finditer(text or ""):
        num_val = _parse_leading_number(m.group("num"))
        if num_val is None:
            continue
        word = m.group("word").lower()
        mult = table.get(word)
        if mult is None:
            continue
        out.append({
            "span": m.span(),
            "raw": m.group(0),
            "num_raw": m.group("num"),
            "word": word,
            "value": num_val * mult,
            "magnitude": mult,
        })
    return out


# Plain (no magnitude word) digit sequences, for exact cross-check only --
# no auto-fix attempted for these, see module docstring.
_PLAIN_NUMBER_RE = re.compile(r"\d[\d.,  ]*\d|\d")


def _digits_only(raw: str) -> str:
    return re.sub(r"[^\d]", "", raw)


def extract_plain_numbers(text: str) -> set[str]:
    """Digit-only forms of every number-like token, for a coarse exact-match
    cross-check (formatting differences like '22,239' vs '22239' don't count as
    a mismatch)."""
    return {_digits_only(m.group(0)) for m in _PLAIN_NUMBER_RE.finditer(text or "")
            if len(_digits_only(m.group(0))) >= 2}  # skip single digits -- too noisy


def _factbase_text_fields(story: dict) -> str:
    parts = []
    for key in ("what_happened", "attribution", "verified", "contested", "numbers"):
        val = story.get(key)
        if isinstance(val, list):
            parts.extend(str(v) for v in val)
        elif val:
            parts.append(str(val))
    return " ".join(parts)


def _factbase_magnitudes(story: dict) -> list[dict]:
    """Fact-base is always in English -- scan it with the English table regardless
    of the output language, since that's the language it was actually written in.
    Keeps each entry's own magnitude multiplier (its "class"), not just its value --
    the class is what tells us whether the article picked the right word."""
    text = _factbase_text_fields(story)
    return extract_magnitude_numbers(text, "en")


def verify_and_fix_numbers(body: str, story: dict, lang: str) -> tuple[str, list[dict]]:
    """Check every number in `body` against `story` (the fact-base entry this
    article was written from). Auto-fixes magnitude-CLASS mismatches in place --
    same real-world value, wrong scale word (e.g. French "milliard"/1e9 written for
    a fact-base "trillion"/1e12 figure -- arithmetically equal, since 1770 milliard
    = 1.77e12, but the wrong word for that scale in French). Matching on value alone
    would call that "fine"; matching on class is what actually catches it. Returns
    (possibly-corrected body, findings): type "AUTO_FIXED" (corrected, informational)
    or "UNVERIFIED_NUMBER" (flagged, not corrected -- no safe replacement exists)."""
    findings: list[dict] = []
    fb_magnitudes = _factbase_magnitudes(story)
    fb_plain = extract_plain_numbers(_factbase_text_fields(story))
    canon = CANONICAL_WORD.get(lang, {})

    mag_matches = extract_magnitude_numbers(body, lang)
    covered_digits = {_digits_only(m["num_raw"]) for m in mag_matches}
    # Process right-to-left so earlier span offsets stay valid after in-place edits.
    for m in sorted(mag_matches, key=lambda x: x["span"][0], reverse=True):
        # Best fact-base match by VALUE (any class) -- determines whether this
        # number is real at all, and which class it *should* be expressed in.
        best = min(fb_magnitudes, key=lambda fv: abs(m["value"] - fv["value"]),
                   default=None)
        if best is None or abs(m["value"] - best["value"]) / max(best["value"], 1) > _REL_TOLERANCE:
            findings.append({
                "type": "UNVERIFIED_NUMBER", "original": m["raw"],
                "reason": "no fact-base number (at any magnitude) matches this value",
            })
            continue
        if abs(m["magnitude"] - best["magnitude"]) < 1:
            continue  # same value AND same class -- genuinely fine
        # Same value, wrong class -- rewrite using this language's word for the
        # fact-base's actual class, recomputing the numeral for that scale.
        target_word = canon.get(best["magnitude"])
        if not target_word:
            findings.append({
                "type": "UNVERIFIED_NUMBER", "original": m["raw"],
                "reason": "magnitude class mismatch, but no canonical word known "
                          "for this language/scale to auto-fix with",
            })
            continue
        new_numeral = best["value"] / best["magnitude"]
        numeral_str = f"{new_numeral:g}".replace(".", ",") if lang != "en" else f"{new_numeral:g}"
        start, end = m["span"]
        replacement = f"{numeral_str} {target_word}"
        body = body[:start] + replacement + body[end:]
        findings.append({
            "type": "AUTO_FIXED", "original": m["raw"], "corrected": replacement,
            "reason": f"magnitude class corrected to match the fact-base's own "
                      f"scale for this figure (~{best['value']:,.0f})",
        })

    # Plain numbers (no magnitude word): exact digit-match only, flag-only.
    # Numbers already handled by the magnitude-word pass above (covered_digits,
    # captured from the ORIGINAL body before any edits) are excluded here so a
    # "1770 milliards" isn't ALSO flagged as a bare unmatched "1770".
    body_plain = extract_plain_numbers(body) - covered_digits
    unmatched_plain = body_plain - fb_plain
    for digits in unmatched_plain:
        if len(digits) < 3:
            continue  # short digit runs (single years' last digits etc.) too noisy
        findings.append({
            "type": "UNVERIFIED_NUMBER", "original": digits,
            "reason": "digit sequence not found anywhere in the fact-base",
        })

    return body, findings


# ── Proper-noun cross-check ─────────────────────────────────────────────────────
# Flag-only, no auto-fix: an invented name has no deterministic correct replacement
# the way a magnitude word does, so this only ever reports, never rewrites.

# Runs of 2+ consecutive capitalised words (allowing a single short lowercase
# connector like "de"/"von"/"van" for names such as "Charles de Gaulle"). A single
# capitalised word is deliberately NOT enough on its own -- German capitalises every
# noun, not just proper nouns, so a single-capital heuristic would be mostly noise
# in German. Two-or-more-word runs are a real proper-noun signal in every one of
# these languages.
_ENTITY_RE = re.compile(
    r"\b[A-ZÀ-ÖØ-Þ][\wÀ-öø-ÿ'-]*(?:\s+(?:de|von|van|del|della|dos|das|al)\s+"
    r"[A-ZÀ-ÖØ-Þ][\wÀ-öø-ÿ'-]*|\s+[A-ZÀ-ÖØ-Þ][\wÀ-öø-ÿ'-]*)+\b"
)


def _factbase_entity_text(story: dict) -> str:
    parts = []
    for key in ("proper_nouns", "what_happened", "attribution", "verified",
                "contested", "key_terms"):
        val = story.get(key)
        if isinstance(val, list):
            parts.extend(str(v) for v in val)
        elif val:
            parts.append(str(val))
    return " ".join(parts)


def find_unverified_entities(body: str, story: dict) -> list[dict]:
    """Flag multi-word capitalised spans in `body` that don't appear anywhere in
    the fact-base (case-insensitive substring match against every text field, not
    just "proper_nouns" -- a name can legitimately show up only in "attribution" or
    "what_happened"). Returns UNVERIFIED_ENTITY findings; never modifies `body`."""
    fb_text_lower = _factbase_entity_text(story).lower()
    if not fb_text_lower:
        return []
    findings = []
    seen = set()
    for m in _ENTITY_RE.finditer(body or ""):
        span_text = m.group(0)
        key = span_text.lower()
        if key in seen:
            continue  # only report each distinct name once per article
        if key in fb_text_lower:
            continue
        seen.add(key)
        findings.append({
            "type": "UNVERIFIED_ENTITY", "original": span_text,
            "reason": "name/entity not found anywhere in the fact-base",
        })
    return findings

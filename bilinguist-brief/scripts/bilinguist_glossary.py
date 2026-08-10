"""
Glossary enforcement — verifies finished articles against the factbase they were
written from.

The factbase already carries `numbers` and `proper_nouns` per story, and the gather
prompt says they exist so facts "appear identically in every language and every
level". Nothing verified the articles against them, so an article could introduce a
figure or a name that appears nowhere in its source notes and nothing would notice.
That is exactly how "concludes a significant appointment process for the Biden
administration" shipped for a story about a Trump appointee.

Two checks, both pure Python and free:

  1. UNSOURCED FIGURES — every number in the article must be traceable to the story
     record. Language-independent: works in Arabic and German as well as French.
  2. UNSOURCED NAMES — every capitalised name in the body must appear in the story
     record. Only runs where casing carries information: skipped for German (every
     noun is capitalised) and Arabic (no case at all).

Both are advisory. They flag prose to look at, they do not block publication —
a false positive must never withhold the brief.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

# The name check only works where the article and the fact-base share a language. The
# fact-base is English, so in French "London" becomes "Londres", "Crimea" becomes "Crimée"
# and "Nizhnekamsk" becomes "Nijnekamsk" — correct translations, all flagged as invented.
# Measured on the 2026-08-10 bundle: 97 names flagged, essentially all false positives.
# Restricted to English, where the comparison is like-for-like.
#
# (German would be hopeless regardless — every noun is capitalised — and Arabic has no case.)
NAME_CHECK_LANGUAGES = {"en"}

# Group/decimal separators per language. Used to canonicalise "1.000" to 1000 in
# German but 1.0 in English, so the same figure compares equal across languages.
_SEPARATORS: dict[str, tuple[str, str]] = {
    "en": (",", "."),
    "ar": (",", "."),
    "fr": (" ", ","),
    "sv": (" ", ","),
    "hu": (" ", ","),
    "de": (".", ","),
    "it": (".", ","),
    "es": (".", ","),
    "tr": (".", ","),
}
_DEFAULT_SEPARATORS = (",", ".")

# Every space that can act as a digit group separator, including the ones typographers
# and LLMs actually emit (NBSP, narrow NBSP, thin space).
_SPACES = "     "

# A number is digits, optionally in 3-digit groups separated by ONE space or separator,
# optionally with a decimal part. It must not run across a sentence boundary: the old
# pattern allowed any run of digits, spaces and punctuation, so "struck on 10 August 2026.
# At least 13 people" matched as one 30-digit number and the allowed set filled with
# nonsense while a plain "2026" never appeared in it at all.
_NUM_RE = re.compile(
    rf"\d{{1,3}}(?:[{_SPACES}.,'’]\d{{3}})+(?:[.,]\d+)?"
    rf"|\d+(?:[.,]\d+)?"
)

# A name candidate: capitalised word, optionally continued by more capitalised words or
# lowercase nobiliary/Arabic particles (von, van, de, del, della, al-, bin).
_PARTICLES = r"(?:von|van|de|del|de-la|della|di|du|des|da|dos|el|al|bin|ibn|av|och)"
_NAME_RE = re.compile(
    r"\b[A-ZÀ-ÜĀ-ſ][\wÀ-ɏ'’-]*"
    rf"(?:[{_SPACES}](?:{_PARTICLES}[{_SPACES}])?"
    r"[A-ZÀ-ÜĀ-ſ][\wÀ-ɏ'’-]*)*"
)

# Candidates too generic to be worth flagging even when absent from the story record.
# Deliberately short: the whole point is that anything not in the factbase is
# unsourced, so only genuine noise belongs here.
_NAME_STOPLIST = {
    # Weekday/month names get reworded constantly and carry no factual claim.
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
    "septembre", "octobre", "novembre", "décembre",
    "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica",
    "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo",
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
    "settembre", "ottobre", "novembre", "dicembre",
    "enero", "febrero", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre",
}

# Fields of a factbase story that can legitimately source a fact.
_STORY_TEXT_FIELDS = (
    "headline", "summary", "slug", "genre", "what_happened", "attribution",
    "verified", "contested", "numbers", "proper_nouns", "key_terms", "context",
    "background", "why_it_matters",
)


@dataclass
class Finding:
    lang: str
    level: str
    length: str
    slug: str
    kind: str      # "figure" | "name"
    value: str


@dataclass
class GlossaryReport:
    findings: list[Finding] = field(default_factory=list)
    articles_checked: int = 0
    unmatched_slugs: list[str] = field(default_factory=list)

    @property
    def figures(self) -> list[Finding]:
        return [f for f in self.findings if f.kind == "figure"]

    @property
    def names(self) -> list[Finding]:
        return [f for f in self.findings if f.kind == "name"]


# ── Text flattening ───────────────────────────────────────────────────────────

def _flatten(value) -> str:
    """Concatenate every string anywhere inside a nested factbase value."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        return " ".join(_flatten(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return " ".join(_flatten(v) for v in value)
    return ""


def story_text(story: dict) -> str:
    """All sourceable prose for one story, as one searchable string.

    Uses the whole story record rather than just the `numbers` and `proper_nouns`
    arrays. Those arrays are a summary, and a figure stated only in `what_happened`
    is still sourced — checking against the arrays alone would flag real facts.
    """
    parts = [_flatten(story.get(f)) for f in _STORY_TEXT_FIELDS]
    # Any field the gather prompt adds later is picked up automatically.
    known = set(_STORY_TEXT_FIELDS)
    parts += [_flatten(v) for k, v in story.items() if k not in known]
    return " ".join(p for p in parts if p)


# ── Numbers ───────────────────────────────────────────────────────────────────

def _canonical_number(raw: str, group: str, decimal: str) -> str | None:
    """Normalise one raw digit run to a comparable canonical string."""
    text = raw.strip()
    # Trim separators that turned out to be punctuation ("...killed 47." → "47")
    text = text.strip("".join(set(_SPACES + ".,'’")))
    if not text:
        return None
    for space in _SPACES:
        text = text.replace(space, "")
    text = text.replace("’", "'").replace("'", "")
    if group and group not in _SPACES:
        text = text.replace(group, "")
    if decimal and decimal != ".":
        text = text.replace(decimal, ".")
    if not text or not any(ch.isdigit() for ch in text):
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None
    # format(…, "f") throughout: Decimal.normalize() renders round numbers in scientific
    # notation, so "10" became "1E+1" and every mention of 10 was flagged as unsourced.
    if value == value.to_integral_value():
        return format(value.to_integral_value(), "f")
    return format(value.normalize(), "f")


# 5:30 / 17h30 / 17.30 / 5.30pm — the same instant written six ways across six languages.
# Removed from both the article and the story record before any comparison, because a
# correct localisation is unmatchable: the fact-base holds "5:30" and French writes "17h30".
# The cost is that an invented time is not caught; times are rarely the load-bearing fact.
# Only ":" and "h" separate a time. "." is deliberately excluded and (?!\d) guards the
# end, because the loose version ate real numbers: German "1.000 Kilometer" matched as
# "1.00" and left a stray 0, and the fact-base's "£3.35 billion" was stripped as a time so
# the article's "3,35 milliards" had nothing left to match against.
_TIME_RE = re.compile(r"\b\d{1,2}\s?[h:]\s?\d{2}(?!\d)\s?(?:am|pm|a\.m\.|p\.m\.)?", re.I)


def _strip_times(text: str) -> str:
    return _TIME_RE.sub(" ", text or "")


def _numbers_in(text: str, lang: str) -> set[str]:
    """Canonical numbers found in text, read with `lang`'s separator convention."""
    group, decimal = _SEPARATORS.get(lang, _DEFAULT_SEPARATORS)
    found = set()
    for match in _NUM_RE.finditer(_strip_times(_normalise_digits(text))):
        canon = _canonical_number(match.group(0), group, decimal)
        if canon is not None:
            found.add(canon)
    return found


def _allowed_numbers(text: str) -> set[str]:
    """Every number in the story record, read under EVERY separator convention.

    Deliberately generous. A figure the writer legitimately reformatted for its
    language must not read as invented, so each raw run contributes all its plausible
    interpretations to the allowed set.
    """
    allowed = set()
    normalised = _strip_times(_normalise_digits(text))
    conventions = set(_SEPARATORS.values()) | {_DEFAULT_SEPARATORS}
    for match in _NUM_RE.finditer(normalised):
        raw = match.group(0)
        for group, decimal in conventions:
            canon = _canonical_number(raw, group, decimal)
            if canon is not None:
                allowed.add(canon)
        # A grouped figure also licenses its digits-only form and vice versa.
        digits = "".join(ch for ch in raw if ch.isdigit())
        if digits:
            allowed.add(str(int(digits)))
    return allowed


_ARABIC_INDIC = {ord(c): str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")}
_ARABIC_INDIC.update({ord(c): str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")})


def _normalise_digits(text: str) -> str:
    """Fold Arabic-Indic digits to ASCII so Arabic articles compare against the factbase."""
    return text.translate(_ARABIC_INDIC)


# ── Names ─────────────────────────────────────────────────────────────────────

def _strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )


def _name_candidates(body: str) -> set[str]:
    """Capitalised names in the body, excluding sentence-initial-only occurrences.

    A candidate must appear at least once mid-sentence. Sentence-initial capitals are
    ambiguous with ordinary words in every language, and a false accusation of
    inventing a name is worse than missing one.
    """
    candidates: dict[str, bool] = {}
    for match in _NAME_RE.finditer(body):
        text = match.group(0).strip()
        if len(text) < 3:
            continue
        preceding = body[:match.start()].rstrip()
        sentence_initial = (
            not preceding
            or preceding[-1] in ".!?:;…\n؟۔"
            or preceding[-1] in "\"'“„«‘("
        )
        candidates[text] = candidates.get(text, False) or not sentence_initial
    return {name for name, mid_sentence in candidates.items() if mid_sentence}


def _is_sourced(name: str, haystack: str) -> bool:
    """Is this name present in the story record, ignoring accents and case?

    Also accepts a match on any single word of a multi-word candidate: if the story
    names "Blanche", the article writing "Todd Blanche" has not invented anything.
    """
    flat = _strip_accents(haystack).casefold()
    if _strip_accents(name).casefold() in flat:
        return True
    # Honorifics and initials are filtered by the length test, which can leave a single
    # word — "Mr Netanyahu" leaves ["Netanyahu"]. The old code required more than one
    # survivor before checking any of them, so exactly that case fell through and the
    # surname was never compared.
    words = [w for w in re.split(rf"[{_SPACES}]+", name) if len(w) > 2]
    return any(_strip_accents(w).casefold() in flat for w in words)


# ── Entry point ───────────────────────────────────────────────────────────────

def check_bundle(bundle: dict) -> GlossaryReport:
    """Check every article in a daily bundle against its factbase story."""
    report = GlossaryReport()
    factbase = bundle.get("factbase", []) or []

    by_slug: dict[str, dict] = {}
    for story in factbase:
        slug = (story.get("slug") or "").strip()
        if slug:
            by_slug[slug] = story

    # Precompute per-story allowed sets — 7 stories re-checked against ~30 article
    # variants each, so parsing the record once matters.
    cache: dict[str, tuple[set[str], str]] = {}
    for slug, story in by_slug.items():
        text = story_text(story)
        cache[slug] = (_allowed_numbers(text), text)

    def check_articles(lang: str, level: str, length: str, articles: list) -> None:
        for article in articles or []:
            slug = (article.get("slug") or "").strip()
            entry = cache.get(slug)
            if entry is None:
                if slug:
                    report.unmatched_slugs.append(f"{lang}/{level}/{length}:{slug}")
                continue
            allowed_numbers, source_text = entry
            report.articles_checked += 1

            body = article.get("body", "") or ""
            headline = article.get("headline", "") or ""

            for value in sorted(_numbers_in(f"{headline} {body}", lang) - allowed_numbers):
                report.findings.append(
                    Finding(lang, level, length, slug, "figure", value)
                )

            if lang not in NAME_CHECK_LANGUAGES:
                continue
            for name in sorted(_name_candidates(body)):
                if name.casefold() in _NAME_STOPLIST:
                    continue
                if not _is_sourced(name, source_text):
                    report.findings.append(
                        Finding(lang, level, length, slug, "name", name)
                    )

    for lang, levels in (bundle.get("briefings") or {}).items():
        for level, lengths in (levels or {}).items():
            for length, payload in (lengths or {}).items():
                check_articles(lang, level, length, (payload or {}).get("articles", []))

    for lang, payload in (bundle.get("nativeJournalism") or {}).items():
        if isinstance(payload, dict):
            for length, articles in payload.items():
                check_articles(lang, "Native", length, articles)
        elif isinstance(payload, list):
            check_articles(lang, "Native", "longer", payload)

    return report


def summarise(report: GlossaryReport, max_examples: int = 6) -> tuple[str, list[str]]:
    """Return (summary_line, warnings) for the daily notification."""
    if not report.articles_checked:
        return "", []

    figures, names = report.figures, report.names
    if not figures and not names:
        return f"📖 Glossary: {report.articles_checked} articles, all figures and names sourced ✓", []

    line = (
        f"📖 Glossary: {len(figures)} unsourced figure(s), "
        f"{len(names)} unsourced name(s) across {report.articles_checked} articles"
    )

    warnings: list[str] = []
    for kind, found in (("figure", figures), ("name", names)):
        if not found:
            continue
        # Group by value so one invented fact repeated across 30 variants reads as one
        # problem, which is what it is.
        grouped: dict[str, list[Finding]] = {}
        for finding in found:
            grouped.setdefault(f"{finding.value} ({finding.slug})", []).append(finding)
        ranked = sorted(grouped.items(), key=lambda kv: -len(kv[1]))
        for value, hits in ranked[:max_examples]:
            langs = sorted({h.lang for h in hits})
            warnings.append(
                f"⚠️ Unsourced {kind} — \"{value}\" in {len(hits)} article(s) "
                f"[{', '.join(langs)}] — appears nowhere in the story's factbase entry"
            )
        if len(ranked) > max_examples:
            warnings.append(f"   … and {len(ranked) - max_examples} more unsourced {kind}(s)")

    return line, warnings

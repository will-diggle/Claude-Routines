"""
Post-generation completeness check for the Bilinguist Brief daily pipeline.

Reads output/latest.json and verifies every expected lang/level/length
combination is present, has the right number of articles, and that articles
are not suspiciously long for their length band.

Writes a status summary to GITHUB_ENV for the ntfy notification.
Exits 1 if critical content is missing so GitHub Actions marks it failed.
"""

import json
import os
import sys
from pathlib import Path

# Word bands and the per-language factor live in bilinguist_prompts.py so the prompt, the
# reporting target and the A/B comparison cannot disagree. That module is pure data — no
# API client, nothing to initialise.
from bilinguist_prompts import LANGUAGE_WORD_FACTOR, word_band  # noqa: F401

# Every active language now writes every CEFR level below its own native grade
# (bilinguist_write.py --all-levels, production default since 2026-08-11), not just a
# fixed per-language subset. This module deliberately does NOT import bilinguist_write
# (which pulls in google.genai — Stage 9 makes no API calls and should stay lightweight),
# so this list is kept in sync by hand: every active language gets the full ladder: which
# levels actually got written is still decided per-bundle by native_grades (skip_from_idx
# below), same as the write side. Before this fix, fr/de/it only checked A2, sv/en checked
# nothing beyond native, and es checked A2 only — every B1+ article Stage 7 now writes for
# them was invisible here: not flagged, not word-counted, not counted toward coverage.
LANGUAGE_LEVELS: dict[str, list[str]] = {
    "fr": ["A1", "A2", "B1", "B2", "C1", "C2", "Native"],
    "de": ["A1", "A2", "B1", "B2", "C1", "C2", "Native"],
    "sv": ["A1", "A2", "B1", "B2", "C1", "C2", "Native"],
    "en": ["A1", "A2", "B1", "B2", "C1", "C2", "Native"],
    "it": ["A1", "A2", "B1", "B2", "C1", "C2", "Native"],
    "es": ["A1", "A2", "B1", "B2", "C1", "C2"],  # no shipped Native edition
    "tr": [],  # temporarily disabled
    "hu": [],  # temporarily disabled
    "ar": [],  # temporarily disabled
}

LENGTHS = ["short", "longer"]

LANG_FLAGS = {
    "fr": "🇫🇷", "de": "🇩🇪", "sv": "🇸🇪", "en": "🇬🇧",
    "it": "🇮🇹", "es": "🇪🇸", "tr": "🇹🇷", "hu": "🇭🇺", "ar": "🇸🇦",
}
LANG_NAMES = {
    "fr": "French", "de": "German", "sv": "Swedish",
    "en": "English", "it": "Italian", "es": "Spanish",
    "tr": "Turkish", "hu": "Hungarian", "ar": "Arabic",
}

MIN_ARTICLES = 5  # fewer than this is suspiciously thin

# Ceiling for the Global News cross-reference score: 12 outlets x 3.5 (1 for
# carrying the story + 2.5 position bonus for leading with it). Must track
# HEADLINES_PER_OUTLET in bilinguist_scrape.py and the ladder in
# gemini_prompt_brief.md.
MAX_XREF_SCORE = 42

# Minimum share of expected briefings that must be present for the run to publish.
# Below this the brief is too broken to ship; at or above it we publish what we have
# and report the gaps. Set to 1.0 to restore the old all-or-nothing behaviour.
PUBLISH_THRESHOLD = 0.5

# Per-level word count targets — must match WORDS_PER_ARTICLE in bilinguist_write.py.
# Stored as (min, max) tuples parsed from the "X–Y" strings.
# CANONICAL bands, before LANGUAGE_WORD_FACTOR. Read them through _target(), never
# directly, or the report will contradict what the prompt actually asked for.
WORD_TARGETS: dict[str, dict[str, tuple[int, int]]] = {
    # Same LENGTH at every level — only the reading level changes. A1 alone is shorter.
    # Bumped from (85,105)/(180,200) on 2026-08-12 -- must agree with WORDS_PER_ARTICLE in
    # bilinguist_write.py, see its comment for why.
    # "longer" widened 2026-08-14 to match WORDS_PER_ARTICLE in bilinguist_write.py -- see
    # its comment for why (was proportionally the tightest band despite no smaller absolute
    # deviation than "short").
    "A1":     {"short": (100, 125), "longer": (195, 250)},
    "A2":     {"short": (95, 115),   "longer": (195, 245)},
    "B1":     {"short": (95, 115),   "longer": (195, 245)},
    "B2":     {"short": (95, 115),   "longer": (195, 245)},
    "C1":     {"short": (95, 115),   "longer": (195, 245)},
    "C2":     {"short": (95, 115),   "longer": (195, 245)},
    # Native now reads its band from WORDS_PER_ARTICLE in bilinguist_write.py — the prompt
    # no longer hardcodes it — so these two must agree.
    "Native": {"short": (95, 115),   "longer": (195, 245)},
}

# Turkish and Arabic words carry more information per word (agglutination / attached
# particles), so the same content naturally produces fewer words than in European languages.
WORD_TARGETS_LANG: dict[str, dict[str, dict[str, tuple[int, int]]]] = {
    "tr": {
        "A1": {"short": (38, 52), "longer": (80, 125)},
        "A2": {"short": (42, 58), "longer": (90, 135)},
    },
    "ar": {
        "A1": {"short": (40, 55), "longer": (85, 130)},
        "A2": {"short": (45, 60), "longer": (95, 140)},
    },
}


CEFR_SCALE = ["A1", "A2", "B1", "B2", "C1", "C2"]


def _overall_level_accuracy(grading: dict) -> tuple[int, int]:
    """(hit, total) across every graded article with a written_level tag — one rolled-up
    figure for the header, separate from _level_grade_table's per-combo breakdown."""
    hit = total = 0
    for assessments in (grading or {}).values():
        for a in assessments or []:
            if not a.get("written_level"):
                continue
            total += 1
            if a.get("level") == a.get("written_level"):
                hit += 1
    return hit, total


def _level_grade_table(grading: dict) -> tuple[str, list[str]]:
    """Stage 8's verdicts, per (language, level, length) — did each prompt hit its target?

    Stage 8 grades blind and tags every verdict with written_level/written_length, so
    "graded" vs "written" is a real comparison rather than a confirmation of the
    instruction. Verdicts without written_level come from an older bundle and are skipped.
    """
    rows: dict = {}
    for lang, assessments in (grading or {}).items():
        for a in assessments or []:
            want = a.get("written_level")
            if not want:
                continue
            key = (lang, want, a.get("written_length") or "?")
            r = rows.setdefault(key, {"n": 0, "hit": 0, "got": {}})
            r["n"] += 1
            got = a.get("level") or "?"
            r["got"][got] = r["got"].get(got, 0) + 1
            if got == want:
                r["hit"] += 1
    if not rows:
        return "", []

    lines = ["🎯 Level accuracy (Stage 8 graded blind, vs what was written):"]
    warnings: list[str] = []
    for (lang, want, length), r in sorted(rows.items()):
        spread = " ".join(f"{k}×{v}" for k, v in
                          sorted(r["got"].items(),
                                 key=lambda kv: CEFR_SCALE.index(kv[0])
                                 if kv[0] in CEFR_SCALE else 99))
        mark = "🟢" if r["hit"] * 2 >= r["n"] else "🔴"
        lines.append(f"  {mark} {LANG_NAMES.get(lang, lang)} {want}/{length}: "
                     f"{r['hit']}/{r['n']} graded {want}  [{spread}]")
        # Nothing graded at the target at all means the prompt is missing its level
        # entirely, which is different from ordinary scatter around it.
        if r["hit"] == 0 and r["n"]:
            drift = max(r["got"], key=r["got"].get)
            warnings.append(f"⚠️ {LANG_NAMES.get(lang, lang)} {want}/{length} — "
                            f"0/{r['n']} graded {want}, mostly {drift}")
    return "\n".join(lines), warnings


def _target(level: str, length: str, lang: str = "") -> tuple[int, int] | None:
    """The band this language was actually asked for.

    WORD_TARGETS_LANG wins where set (Turkish and Arabic deviate far more than a factor);
    otherwise the canonical band is scaled by LANGUAGE_WORD_FACTOR, exactly as the prompt
    builder does.
    """
    override = WORD_TARGETS_LANG.get(lang, {}).get(level, {}).get(length)
    if override:
        return override
    canon = WORD_TARGETS.get(level, {}).get(length)
    if not canon:
        return None
    return word_band(f"{canon[0]}-{canon[1]}", lang)


def _word_color(avg: float, lo: int, hi: int) -> str:
    """🟢 within range · 🟠 up to 15% outside · 🔴 more than 15% outside."""
    if avg <= 0:
        return "❌"
    if lo <= avg <= hi:
        return "🟢"
    if avg < lo * 0.85 or avg > hi * 1.15:
        return "🔴"
    return "🟠"


def _length_status(articles: list, level: str, length: str, lang: str = "") -> tuple[str, bool]:
    """Return (display_str, is_bad). is_bad = outside target range."""
    avg = _avg_body_words(articles)
    target = _target(level, length, lang)
    avg_str = f"{int(avg)}w"
    if not target:
        return avg_str, False
    lo, hi = target
    color = _word_color(avg, lo, hi)
    is_bad = color in ("🟠", "🔴")
    return avg_str, is_bad


def _fmt_duration(ms: int) -> str:
    s = ms // 1000
    if s < 60:
        return f"{s}s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m}m {s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m"


def _native_by_length(lang_native) -> dict[str, list]:
    """Normalise nativeJournalism[lang] to {length: [articles]}.

    Current bundles store it keyed by length; older ones stored a flat list, which is
    treated as 'longer' so it still reports rather than vanishing.
    """
    if isinstance(lang_native, dict):
        return {k: v for k, v in lang_native.items() if isinstance(v, list) and v}
    if isinstance(lang_native, list) and lang_native:
        return {"longer": lang_native}
    return {}


def _collect_articles(node) -> list:
    """Walk an arbitrarily-nested bundle structure (native/intermediate/level dicts all
    nest differently — lang->length->[articles] vs lang->level->length->{"articles":[...]})
    and return every article dict found, identified by having a "body" field."""
    found: list = []
    if isinstance(node, dict):
        if isinstance(node.get("body"), str):
            found.append(node)
        else:
            for v in node.values():
                found.extend(_collect_articles(v))
    elif isinstance(node, list):
        for item in node:
            found.extend(_collect_articles(item))
    return found


def _generation_totals(native_journalism: dict, native_intermediate: dict,
                       briefings: dict) -> tuple[int, int]:
    """(total articles, total words) across every article actually generated this run —
    native + intermediate native + every CEFR level, every language, every length."""
    articles = (_collect_articles(native_journalism)
                + _collect_articles(native_intermediate)
                + _collect_articles(briefings))
    total_words = sum(len(a.get("body", "").split()) for a in articles)
    return len(articles), total_words


def _avg_body_words(articles: list) -> float:
    if not articles:
        return 0.0
    return sum(len(a.get("body", "").split()) for a in articles) / len(articles)


def _cost_summary(output_dir: Path, date: str) -> str:
    costs_path = output_dir / f"costs_{date}.json"
    if not costs_path.exists():
        return ""
    try:
        with open(costs_path) as f:
            costs = json.load(f)
    except Exception:
        return ""

    # Keys are the historical cost-report keys and MUST NOT be renamed — they are written
    # into costs.csv in the data repo, so changing them breaks the cost history. Only the
    # display labels carry the new stage numbering.
    stage_labels = {
        "1_gather": "2+3 Select + Gather",
        "3":  "5 Write Native",
        "4a": "6 Grade Native",
        "2S": "7 Write Levels (B1+/short)",
        "2B": "7 Write Levels (A1-A2)",
        "2M": "7 Write Levels (B1+/longer)",
        "4b": "8 Grade Levels",
        "4":  "Grade (legacy)",
    }

    lines = [f"💰 Cost: £{costs['total_gbp']:.3f}  (${costs['total_usd']:.3f})"]
    for sname, label in stage_labels.items():
        sdata = costs["stages"].get(sname)
        if not sdata or sdata.get("calls", 0) == 0:
            continue
        calls   = sdata["calls"]
        tok_in  = sdata.get("input_tokens", 0)
        tok_out = sdata.get("output_tokens", 0)
        tok_thi = sdata.get("thinking_tokens", 0)
        gbp     = sdata.get("cost_gbp", 0)
        tok_str = f"{tok_in//1000}k in + {tok_out//1000}k out"
        if tok_thi:
            tok_str += f" + {tok_thi//1000}k think"
        lines.append(f"  {label} ({calls} calls): {tok_str} → £{gbp:.3f}")
    return "\n".join(lines)


def _factcheck_summary(script_dir: Path, date: str, total_stories: int = 0) -> tuple[str, str | None]:
    """Returns (summary_line, warning_str_or_None)."""
    path = script_dir / f"corrections_{date}.json"
    if not path.exists():
        return "", None
    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        return "", None

    if data.get("error"):
        msg = f"⚠️ Fact-check skipped — {data['error']}"
        return f"🔍 Fact-check: skipped ({data['error']})", msg

    checked = data.get("stories_checked", 0)
    count   = data.get("corrections_count", 0)
    warning = None
    if total_stories > 0 and checked < total_stories:
        warning = f"⚠️ Fact-check only checked {checked}/{total_stories} stories — model returned partial response"

    if count == 0:
        summary = f"🔍 Fact-check: {checked}/{total_stories} stories — no corrections ✓" if total_stories else f"🔍 Fact-check: {checked} stories — no corrections ✓"
    else:
        lines = [f"🔍 Fact-check: {count} correction(s) across {checked}/{total_stories} stories" if total_stories else f"🔍 Fact-check: {count} correction(s) across {checked} stories"]
        for c in data.get("corrections", []):
            lines.append(f"  [{c.get('slug','?')}] {c.get('original','?')} → {c.get('corrected','?')}")
            if c.get("reason"):
                lines.append(f"    ↳ {c['reason']}")
        summary = "\n".join(lines)

    return summary, warning


def _language_table(
    briefings: dict,
    native_journalism: dict,
    native_grades: dict,
    issues: set[str],
) -> str:
    """Markdown table: languages × CEFR levels split into short/longer columns."""
    # Was missing C2 — the table had no column for it at all, independent of the
    # LANGUAGE_LEVELS gap above. check()'s own CEFR_ORDER (below) always included it.
    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

    # Two columns per CEFR level (S = short, L = longer), plus Native
    col_headers = []
    for lvl in CEFR_ORDER:
        col_headers += [f"{lvl} S", f"{lvl} L"]
    col_headers.append("Native")

    header = "| Lang | " + " | ".join(col_headers) + " |"
    sep    = "|------|" + "|".join(["-----"] * len(col_headers)) + "|"
    rows   = [header, sep]

    for lang, levels in LANGUAGE_LEVELS.items():
        flag      = LANG_FLAGS.get(lang, "  ")
        lang_name = LANG_NAMES.get(lang, lang)
        native_grade  = native_grades.get(lang, "")
        skip_from_idx = (
            CEFR_ORDER.index(native_grade)
            if native_grade in CEFR_ORDER else len(CEFR_ORDER)
        )

        cells = []

        for lvl in CEFR_ORDER:
            if lvl not in levels:
                cells += ["—", "—"]
                continue
            if CEFR_ORDER.index(lvl) >= skip_from_idx:
                cells += ["↑", "↑"]
                continue

            for length in LENGTHS:
                articles = (
                    briefings.get(lang, {})
                             .get(lvl, {})
                             .get(length, {})
                             .get("articles", [])
                )
                if not articles:
                    cells.append("❌")
                    continue
                avg = _avg_body_words(articles)
                target = _target(lvl, length, lang)
                color = _word_color(avg, *target) if target else "🟢"
                cells.append(f"{color} {int(avg)}")

        # Native column
        if "Native" not in levels:
            cells.append("—")
        else:
            lang_native = native_journalism.get(lang, {})
            if _native_by_length(lang_native):
                # Per length, not one flat average: short targets 85–100 and longer
                # targets 250–270, so their mean was a number with no target to sit in.
                parts = []
                for length in LENGTHS:
                    arts = _native_by_length(lang_native).get(length, [])
                    if not arts:
                        parts.append("❌")
                        continue
                    avg = _avg_body_words(arts)
                    target = _target("Native", length, lang)
                    color = _word_color(avg, *target) if target else "🟢"
                    parts.append(f"{color} {int(avg)}")
                grade_label = f" [{native_grade}]" if native_grade else ""
                cells.append(" / ".join(parts) + grade_label)
            else:
                cells.append("❌")

        rows.append(f"| {flag} {lang_name} | " + " | ".join(cells) + " |")

    return "\n".join(rows)


def check(bundle_path: Path) -> int:
    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    briefings             = bundle.get("briefings", {})
    native_journalism     = bundle.get("nativeJournalism", {})
    # Intermediates are not shipped as a Native edition, but every level article for that
    # language is a rewrite of one — so a bad intermediate silently degrades the whole
    # language and would otherwise be reported nowhere.
    native_intermediate   = bundle.get("nativeIntermediate", {})
    native_factcheck      = bundle.get("nativeFactCheck", {}) or {}
    native_grades         = bundle.get("nativeGrades", {})
    grading               = bundle.get("grading", {})
    date                  = bundle.get("date", "unknown")
    volume                = bundle.get("volume", "?")
    started_at            = bundle.get("startedAt")
    finished_at           = bundle.get("finishedAt")
    factbase              = bundle.get("factbase", [])
    daily_notification    = bundle.get("daily_notification", "")
    search_log            = bundle.get("global_news_search_log", [])

    duration_str = ""
    if started_at and finished_at:
        duration_str = f"  ⏱ {_fmt_duration(finished_at - started_at)}"

    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
    story_count = len(factbase)

    missing:      list[str] = []
    wrong_length: list[str] = []
    thin:         list[str] = []
    bloated:      list[str] = []
    present = 0
    total   = 0

    for lang, levels in LANGUAGE_LEVELS.items():
        lang_name = LANG_NAMES.get(lang, lang)
        native_grade  = native_grades.get(lang)
        skip_from_idx = (
            CEFR_ORDER.index(native_grade)
            if native_grade in CEFR_ORDER else len(CEFR_ORDER)
        )

        for level in levels:
            if level == "Native":
                total += 1
                by_length = _native_by_length(native_journalism.get(lang, {}))
                if by_length:
                    present += 1
                    # Native word counts were displayed but never checked, so the
                    # 250-word target it could not reach never showed up as a warning.
                    for length, arts in by_length.items():
                        target = _target("Native", length, lang)
                        if not target:
                            continue
                        avg = _avg_body_words(arts)
                        if _word_color(avg, *target) in ("🟠", "🔴"):
                            wrong_length.append(
                                f"{lang_name} Native/{length} (avg {int(avg)}w, "
                                f"target {target[0]}–{target[1]}w)"
                            )
                        if len(arts) < MIN_ARTICLES:
                            thin.append(f"{lang_name} Native/{length}")
                else:
                    missing.append(f"{lang_name} Native")
            else:
                if level in CEFR_ORDER and CEFR_ORDER.index(level) >= skip_from_idx:
                    continue
                for length in LENGTHS:
                    total += 1
                    key = f"{lang_name} {level}/{length}"
                    articles = (
                        briefings.get(lang, {})
                                 .get(level, {})
                                 .get(length, {})
                                 .get("articles", [])
                    )
                    if not articles:
                        missing.append(key)
                        continue
                    present += 1
                    _, is_bad = _length_status(articles, level, length, lang)
                    if is_bad:
                        avg = int(_avg_body_words(articles))
                        target = _target(level, length, lang) or (0, 999)
                        wrong_length.append(f"{key} (avg {avg}w, target {target[0]}–{target[1]}w)")
                    if len(articles) < MIN_ARTICLES:
                        thin.append(key)
                    # More articles than stories means a writing call returned extra
                    # ones. On 2026-08-10 fr/es-A2-longer shipped 9 articles from 7
                    # stories and the write log still printed a tick.
                    if story_count and len(articles) > story_count:
                        bloated.append(
                            f"{key} ({len(articles)} articles from {story_count} stories)")

    all_issues = set(wrong_length + thin + bloated)
    table = _language_table(briefings, native_journalism, native_grades, all_issues)

    script_dir   = bundle_path.parent.parent
    cost_str     = _cost_summary(bundle_path.parent, date)

    total_native = sum(
        sum(len(b) for b in v.values()) if isinstance(v, dict) else len(v)
        for v in native_journalism.values()
    )
    total_articles, total_words = _generation_totals(
        native_journalism, native_intermediate, briefings)
    level_hit, level_total = _overall_level_accuracy(grading)
    level_accuracy_str = (f"  |  🎯 {level_hit}/{level_total} at target level "
                          f"({round(100 * level_hit / level_total)}%)"
                          if level_total else "")
    header_line  = (f"📅 {date}  |  Vol. {volume}  |  {story_count} stories{duration_str}\n"
                    f"📊 {total_articles} articles generated  |  {total_words:,} words total"
                    f"{level_accuracy_str}")

    factcheck_str, factcheck_warning = _factcheck_summary(script_dir, date, story_count)
    level_grade_str, level_grade_warnings = _level_grade_table(grading)

    # Detect grading failures: Stage 6 defaults every language to B2 on failure,
    # Stage 8 produces no assessments. Neither is visible in article counts alone.
    grading_warnings: list[str] = []
    total_gradings = sum(len(v) for v in grading.values())
    if total_gradings == 0 and briefings:
        grading_warnings.append("⚠️ Stage 8 (Grade Levels) produced 0 assessments — grading model may have failed")
    all_native_grades = list(native_grades.values())
    if all_native_grades and len(set(all_native_grades)) == 1 and all_native_grades[0] == "B2":
        grading_warnings.append("⚠️ Stage 6 (Grade Native) defaulted all languages to B2 — grading model may have failed")

    factcheck_warnings = [factcheck_warning] if factcheck_warning else []
    # Stage 5b findings are warnings in their own right: an unsourced figure in a native
    # article is now inherited by every level article rewritten from it.
    # Every Stage 5b finding is a warning in its own right: an unsourced fact in a native
    # article is inherited by every level article rewritten from it.
    native_check_warnings = [
        f"⚠️ {f.get('type')} in {f.get('lang')} native ({f.get('slug')}): "
        f"\"{(f.get('quote') or '')[:70]}\""
        for f in (native_factcheck.get("findings") or [])[:5]
    ]
    warnings  = (wrong_length + thin + bloated + grading_warnings
                 + level_grade_warnings + native_check_warnings + factcheck_warnings)

    # Exiting non-zero fails the workflow, which stops the bundle ever reaching the
    # data repo — so this decides whether the brief publishes at all. A single failed
    # API call should not withhold an otherwise complete brief from every reader:
    # publish what generated, and let `missing` be a loud warning instead.
    # Only a substantially broken run blocks publication.
    coverage = (present / total) if total else 0.0
    critical = (present == 0) or (coverage < PUBLISH_THRESHOLD)

    # ── Build title and body ───────────────────────────────────────────────────
    ntfy_title = "Morning Bilingual Briefing ☀️"

    if not missing and not warnings:
        title = f"{ntfy_title} — {present}/{total} ✅"
        emoji = "white_check_mark"
        body_parts = []
        if daily_notification:
            body_parts += [daily_notification, ""]
        body_parts += [header_line, "", table]
    elif missing:
        # Distinguish "published with gaps" from "too broken to publish" — previously
        # both looked identical, and warnings were hidden behind the missing list.
        status = "❌ NOT PUBLISHED" if critical else "⚠️ published with gaps"
        title = f"{ntfy_title} — {present}/{total} {status}"
        emoji = "rotating_light" if critical else "warning"
        body_parts = []
        if daily_notification:
            body_parts += [daily_notification, ""]
        body_parts += [
            header_line,
            "",
            table,
            "",
            f"Missing ({len(missing)}):",
        ] + [f"  ✗ {m}" for m in missing]
        if warnings:
            body_parts += ["", f"Warnings ({len(warnings)}):"]
            for w in wrong_length:
                body_parts.append(f"  ⚠️ {w} — word count outside target range")
            for t in thin:
                body_parts.append(f"  ⚠️ {t} — fewer than {MIN_ARTICLES} articles")
            for b in bloated:
                body_parts.append(f"  ⚠️ {b} — MORE articles than stories")
            for g in grading_warnings + level_grade_warnings:
                body_parts.append(f"  {g}")
            for fw in factcheck_warnings:
                body_parts.append(f"  {fw}")
    else:
        title = f"{ntfy_title} — {present}/{total} ⚠️"
        emoji = "warning"
        body_parts = []
        if daily_notification:
            body_parts += [daily_notification, ""]
        body_parts += [
            header_line,
            "",
            table,
            "",
            f"Warnings ({len(warnings)}):",
        ]
        for w in wrong_length:
            body_parts.append(f"  ⚠️ {w} — word count outside target range")
        for t in thin:
            body_parts.append(f"  ⚠️ {t} — fewer than {MIN_ARTICLES} articles")
        for b in bloated:
            body_parts.append(f"  ⚠️ {b} — MORE articles than stories")
        for g in grading_warnings + level_grade_warnings:
            body_parts.append(f"  {g}")
        for fw in factcheck_warnings:
            body_parts.append(f"  {fw}")

    if native_factcheck.get("summary"):
        body_parts += ["", native_factcheck["summary"]]
        for f in (native_factcheck.get("findings") or [])[:8]:
            body_parts.append(
                f"  ⚠️ {f.get('type')} {f.get('lang')}/{f.get('length')} "
                f"{f.get('slug')}: \"{(f.get('quote') or '')[:80]}\"")
            if f.get("why"):
                body_parts.append(f"      ↳ {f['why'][:150]}")

    if native_intermediate:
        lines = ["🔧 Native intermediates (not shipped — every level is a rewrite of these):"]
        for lang, by_len in sorted(native_intermediate.items()):
            for length, arts in sorted(_native_by_length(by_len).items()):
                avg = _avg_body_words(arts)
                target = _target("Native", length, lang)
                colour = _word_color(avg, *target) if target else "🟢"
                lines.append(f"  {colour} {LANG_NAMES.get(lang, lang)} {length}: "
                             f"{len(arts)} articles, avg {int(avg)}w"
                             + (f", target {target[0]}–{target[1]}w" if target else ""))
        body_parts += ["", "\n".join(lines)]

    if level_grade_str:
        body_parts += ["", level_grade_str]

    # Global News search log (per-outlet Step 1 headlines)
    if search_log:
        log_lines = ["📋 Outlet search log:"]
        for entry in search_log:
            outlet = entry.get("outlet", "?")
            stories = entry.get("stories", [])
            truncated = [s[:60] + "…" if len(s) > 60 else s for s in stories]
            log_lines.append(f"  {outlet}:")
            for i, headline in enumerate(truncated, 1):
                log_lines.append(f"    {i}. {headline}")
        body_parts += [""] + log_lines

    # Global News cross-reference scores
    global_news = [s for s in factbase if s.get("genre", "").upper() == "GLOBAL NEWS"]
    if global_news:
        score_lines = [f"📡 Global News scores (out of {MAX_XREF_SCORE}):"]
        for story in sorted(global_news, key=lambda s: s.get("cross_reference_score", {}).get("rank", 99)):
            crs = story.get("cross_reference_score", {})
            total_score = crs.get("total", "?")
            outlets = ", ".join(crs.get("outlets_covering", []))
            rank = crs.get("rank", "?")
            headline = story.get("what_happened", ["?"])[0]
            score_lines.append(f"  #{rank} [{total_score}/{MAX_XREF_SCORE}] {headline}")
            if outlets:
                score_lines.append(f"      {outlets}")
        body_parts += [""] + score_lines

    if factcheck_str:
        body_parts += ["", factcheck_str]
    if cost_str:
        body_parts += ["", cost_str]

    body = "\n".join(body_parts)

    print(title)
    print(body)

    github_env = os.getenv("GITHUB_ENV")
    if github_env:
        with open(github_env, "a", encoding="utf-8") as env_file:
            env_file.write(f"BRIEF_TITLE={title}\n")
            env_file.write(f"BRIEF_EMOJI={emoji}\n")
            env_file.write(f"BRIEF_BODY<<BRIEF_EOF\n{body}\nBRIEF_EOF\n")

    return 1 if critical else 0


if __name__ == "__main__":
    script_dir = Path(__file__).parent
    bundle = script_dir / "output" / "latest.json"
    if not bundle.exists():
        print("ERROR: output/latest.json not found — run bilinguist_write.py first.",
              file=sys.stderr)
        sys.exit(0)
    sys.exit(check(bundle))

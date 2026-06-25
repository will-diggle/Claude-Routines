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

LANGUAGE_LEVELS: dict[str, list[str]] = {
    "fr": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "de": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "sv": ["B2", "Native"],
    "en": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "it": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "es": ["A2"],
    "tr": ["A1"],
    "hu": ["Native"],
}

LENGTHS = ["short", "longer"]

LANG_FLAGS = {
    "fr": "🇫🇷", "de": "🇩🇪", "sv": "🇸🇪", "en": "🇬🇧",
    "it": "🇮🇹", "es": "🇪🇸", "tr": "🇹🇷", "hu": "🇭🇺",
}
LANG_NAMES = {
    "fr": "French", "de": "German", "sv": "Swedish",
    "en": "English", "it": "Italian", "es": "Spanish",
    "tr": "Turkish", "hu": "Hungarian",
}

MIN_ARTICLES   = 5     # fewer than this is suspiciously thin
SHORT_MAX_WORDS = 250  # avg body words above this in a "short" slot = wrong article


def _fmt_duration(ms: int) -> str:
    s = ms // 1000
    if s < 60:
        return f"{s}s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m}m {s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m"


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

    stage_labels = {
        "1_gather": "Gather",
        "2S": "Write B1+/short",
        "2B": "Write A1-A2",
        "2M": "Write B1+/longer",
        "3":  "Native journalism",
        "4a": "Grade native",
        "4b": "Grade CEFR",
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
        return f"🔍 Fact-check: skipped ({data['error']})", None

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
    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
    lines = []

    for lang, levels in LANGUAGE_LEVELS.items():
        flag      = LANG_FLAGS.get(lang, "  ")
        lang_name = LANG_NAMES.get(lang, lang)
        native_grade  = native_grades.get(lang, "")
        skip_from_idx = (
            CEFR_ORDER.index(native_grade)
            if native_grade in CEFR_ORDER else len(CEFR_ORDER)
        )

        parts = []
        for level in levels:
            if level == "Native":
                arts  = native_journalism.get(lang, [])
                count = len(arts)
                mark  = f"✓{count}" if count else "✗"
                grade_label = f" [{native_grade}]" if native_grade else ""
                parts.append(f"Native{mark}{grade_label}")
            elif level in CEFR_ORDER and CEFR_ORDER.index(level) >= skip_from_idx:
                continue  # intentionally skipped — P3 covers it
            else:
                row = []
                for length in LENGTHS:
                    key      = f"{lang_name} {level}/{length}"
                    articles = (
                        briefings.get(lang, {})
                                 .get(level, {})
                                 .get(length, {})
                                 .get("articles", [])
                    )
                    count = len(articles)
                    if count == 0:
                        row.append("✗")
                    elif key in issues:
                        row.append(f"⚠{count}")
                    else:
                        row.append(f"✓{count}")
                parts.append(f"{level}[{'/'.join(row)}]")

        lines.append(f"  {flag} {lang_name}: {' '.join(parts)}")
    return "\n".join(lines)


def check(bundle_path: Path) -> int:
    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    briefings         = bundle.get("briefings", {})
    native_journalism = bundle.get("nativeJournalism", {})
    native_grades     = bundle.get("nativeGrades", {})
    grading           = bundle.get("grading", {})
    date              = bundle.get("date", "unknown")
    volume            = bundle.get("volume", "?")
    started_at        = bundle.get("startedAt")
    finished_at       = bundle.get("finishedAt")
    factbase          = bundle.get("factbase", [])

    duration_str = ""
    if started_at and finished_at:
        duration_str = f"  ⏱ {_fmt_duration(finished_at - started_at)}"

    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

    missing:      list[str] = []
    wrong_length: list[str] = []
    thin:         list[str] = []
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
                arts = native_journalism.get(lang, [])
                if arts:
                    present += 1
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
                    if length == "short" and _avg_body_words(articles) > SHORT_MAX_WORDS:
                        wrong_length.append(key)
                    if len(articles) < MIN_ARTICLES:
                        thin.append(key)

    all_issues = set(wrong_length + thin)
    table = _language_table(briefings, native_journalism, native_grades, all_issues)

    script_dir   = bundle_path.parent.parent
    cost_str     = _cost_summary(bundle_path.parent, date)

    story_count  = len(factbase)
    total_native = sum(len(v) for v in native_journalism.values())
    header_line  = f"📅 {date}  |  Vol. {volume}  |  {story_count} stories{duration_str}"

    factcheck_str, factcheck_warning = _factcheck_summary(script_dir, date, story_count)

    # Detect grading stage failures: 4a defaults every language to B2 on failure,
    # 4b produces no assessments. Neither is visible in article counts alone.
    grading_warnings: list[str] = []
    total_gradings = sum(len(v) for v in grading.values())
    if total_gradings == 0 and briefings:
        grading_warnings.append("⚠️ Stage 4b (CEFR grading) produced 0 assessments — grading model may have failed")
    all_native_grades = list(native_grades.values())
    if all_native_grades and len(set(all_native_grades)) == 1 and all_native_grades[0] == "B2":
        grading_warnings.append("⚠️ Stage 4a (native grading) defaulted all languages to B2 — grading model may have failed")

    factcheck_warnings = [factcheck_warning] if factcheck_warning else []
    warnings  = wrong_length + thin + grading_warnings + factcheck_warnings
    critical  = len(missing) > 0

    # ── Build title and body ───────────────────────────────────────────────────
    if not missing and not warnings:
        title = f"Bilinguist Brief — {present}/{total} ✅"
        emoji = "white_check_mark"
        body_parts = [
            header_line,
            "",
            table,
        ]
    elif missing:
        title = f"Bilinguist Brief — {present}/{total} ❌"
        emoji = "rotating_light"
        body_parts = [
            header_line,
            "",
            table,
            "",
            f"Missing ({len(missing)}):",
        ] + [f"  ✗ {m}" for m in missing]
    else:
        title = f"Bilinguist Brief — {present}/{total} ⚠️"
        emoji = "warning"
        body_parts = [
            header_line,
            "",
            table,
            "",
            f"Warnings ({len(warnings)}):",
        ]
        for w in wrong_length:
            body_parts.append(f"  ⚠️ {w} — long content in short slot (article may not have been written)")
        for t in thin:
            body_parts.append(f"  ⚠️ {t} — fewer than {MIN_ARTICLES} articles")
        for g in grading_warnings:
            body_parts.append(f"  {g}")
        for fw in factcheck_warnings:
            body_parts.append(f"  {fw}")

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

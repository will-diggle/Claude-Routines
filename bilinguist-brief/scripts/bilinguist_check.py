"""
Post-generation completeness check for the Bilinguist Brief daily pipeline.

Reads output/latest.json and verifies every expected lang/level/length
combination is present, has the right number of articles, and that articles
are not suspiciously long for their length band.

Writes a status summary to GITHUB_ENV so the calling workflow can include it
in the ntfy push notification.

Exits 0 on success (all present), 1 on critical missing content.
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

LANG_NAMES = {
    "fr": "French", "de": "German", "sv": "Swedish",
    "en": "English", "it": "Italian", "es": "Spanish",
    "tr": "Turkish", "hu": "Hungarian",
}

_STAGE_LABELS: dict[str, str] = {
    "1_gather": "Gather (Pro Flex)",
    "2S":       "Stage 2S writing",
    "2B":       "Stage 2B beginner",
    "2M":       "Stage 2M writing",
    "3":        "Stage 3 native",
    "4a":       "Stage 4a grade native",
    "4b":       "Stage 4b grade CEFR",
    "4":        "Stage 4 grading",
}

# Expected article counts per briefing. Fewer than this is suspicious.
MIN_ARTICLES = 5

# Word-count thresholds: a "short" article body with >250 words is likely a
# longer article that was returned in the wrong slot.
SHORT_WORD_LIMIT = 250


def _body_word_count(article: dict) -> int:
    body = article.get("body", "")
    return len(body.split())


def _cost_summary(output_dir: Path, date: str) -> str:
    costs_path = output_dir / f"costs_{date}.json"
    if not costs_path.exists():
        return ""
    try:
        with open(costs_path) as f:
            costs = json.load(f)
    except Exception:
        return ""

    lines = [f"\n💰 Cost: £{costs['total_gbp']:.3f} (${costs['total_usd']:.3f})"]
    for sname in ["1_gather", "2S", "2B", "2M", "3", "4a", "4b", "4"]:
        sdata = costs["stages"].get(sname)
        if not sdata or sdata.get("calls", 0) == 0:
            continue
        label = _STAGE_LABELS.get(sname, sname)
        tok_in  = sdata.get("input_tokens", 0)
        tok_out = sdata.get("output_tokens", 0)
        tok_thi = sdata.get("thinking_tokens", 0)
        tok_str = f"{tok_in:,}in+{tok_out:,}out"
        if tok_thi:
            tok_str += f"+{tok_thi:,}think"
        lines.append(f"  {label} ({sdata['calls']}×): {tok_str} → £{sdata['cost_gbp']:.3f}")
    return "\n".join(lines)


def _factcheck_summary(script_dir: Path, date: str) -> str:
    corrections_path = script_dir / f"corrections_{date}.json"
    if not corrections_path.exists():
        return ""
    try:
        with open(corrections_path) as f:
            data = json.load(f)
    except Exception:
        return ""

    error = data.get("error")
    if error:
        return f"\n🔍 Fact-check: skipped ({error})"

    checked = data.get("stories_checked", 0)
    count   = data.get("corrections_count", 0)
    corrections = data.get("corrections", [])

    if count == 0:
        return f"\n🔍 Fact-check: {checked} stories verified — no corrections ✓"

    lines = [f"\n🔍 Fact-check: {count} correction(s) ({checked} stories)"]
    for c in corrections:
        slug      = c.get("slug", "?")
        original  = c.get("original", "?")
        corrected = c.get("corrected", "?")
        reason    = c.get("reason", "")
        lines.append(f"  • [{slug}] «{original}» → «{corrected}»")
        if reason:
            lines.append(f"    ↳ {reason}")
    return "\n".join(lines)


def _language_breakdown(
    briefings: dict,
    native_journalism: dict,
    native_grades: dict,
    wrong_length: list[str],
    thin: list[str],
) -> str:
    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
    lines = []
    wrong_set = set(wrong_length)
    thin_set  = set(thin)

    for lang, levels in LANGUAGE_LEVELS.items():
        lang_name = LANG_NAMES.get(lang, lang)
        native_grade = native_grades.get(lang)
        skip_from_idx = (
            CEFR_ORDER.index(native_grade)
            if native_grade in CEFR_ORDER else len(CEFR_ORDER)
        )
        level_parts = []
        for level in levels:
            if level == "Native":
                arts = native_journalism.get(lang, [])
                count = len(arts)
                if count == 0:
                    mark = "✗"
                else:
                    mark = f"✓({count})"
                level_parts.append(f"Native{mark}")
            elif level in CEFR_ORDER and CEFR_ORDER.index(level) >= skip_from_idx:
                continue
            else:
                for length in LENGTHS:
                    key = f"{LANG_NAMES.get(lang, lang)} {level}/{length}"
                    articles = (
                        briefings.get(lang, {})
                                 .get(level, {})
                                 .get(length, {})
                                 .get("articles", [])
                    )
                    count = len(articles)
                    if count == 0:
                        mark = "✗"
                    elif key in wrong_set:
                        mark = f"⚠️len({count})"
                    elif key in thin_set:
                        mark = f"⚠️thin({count})"
                    else:
                        mark = f"✓({count})"
                    level_parts.append(f"{level}/{length[:1]}{mark}")
        lines.append(f"  {lang_name}: {' '.join(level_parts)}")
    return "\n".join(lines)


def check(bundle_path: Path) -> int:
    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    briefings         = bundle.get("briefings", {})
    native_journalism = bundle.get("nativeJournalism", {})
    native_grades     = bundle.get("nativeGrades", {})
    date              = bundle.get("date", "unknown")

    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

    missing:      list[str] = []
    wrong_length: list[str] = []  # short slot has suspiciously long articles
    thin:         list[str] = []  # fewer articles than expected
    present = 0
    total   = 0

    for lang, levels in LANGUAGE_LEVELS.items():
        lang_name = LANG_NAMES.get(lang, lang)
        native_grade = native_grades.get(lang)
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

                    # Detect wrong-length content: short slot with long articles
                    if length == "short":
                        avg_words = sum(_body_word_count(a) for a in articles) / len(articles)
                        if avg_words > SHORT_WORD_LIMIT:
                            wrong_length.append(key)

                    # Detect suspiciously thin output
                    if len(articles) < MIN_ARTICLES:
                        thin.append(key)

    breakdown = _language_breakdown(
        briefings, native_journalism, native_grades, wrong_length, thin
    )

    script_dir = bundle_path.parent.parent
    cost_str     = _cost_summary(bundle_path.parent, date)
    factcheck_str = _factcheck_summary(script_dir, date)

    warnings = wrong_length + thin
    critical  = len(missing) > 0

    if not missing and not warnings:
        title = f"Bilinguist Brief — {present}/{total} ✅"
        emoji = "white_check_mark"
        body  = (
            f"{date}: All {total} combinations generated ✓\n\n"
            f"Languages:\n{breakdown}"
            + factcheck_str
            + cost_str
        )
    elif missing and not warnings:
        title = f"Bilinguist Brief — {present}/{total} ❌ MISSING"
        emoji = "rotating_light"
        body  = (
            f"{date}: {len(missing)} combination(s) MISSING.\n\n"
            f"Languages:\n{breakdown}\n\n"
            f"Missing ({len(missing)}):\n" + "\n".join(f"  ✗ {m}" for m in missing)
            + factcheck_str
            + cost_str
        )
    else:
        title = f"Bilinguist Brief — {present}/{total} ⚠️ WARNINGS"
        emoji = "warning"
        issues = missing + warnings
        body  = (
            f"{date}: {len(missing)} missing, {len(warnings)} suspicious.\n\n"
            f"Languages:\n{breakdown}\n\n"
            f"Issues ({len(issues)}):\n"
            + "\n".join(
                f"  ✗ {m}" for m in missing
            )
            + "\n".join(
                f"  ⚠️ {w} — short slot has long-form articles (article may not have been written)"
                for w in wrong_length
            )
            + "\n".join(
                f"  ⚠️ {t} — only {len(briefings.get(t.split()[0].lower()[:2], {}))} articles (expected ≥{MIN_ARTICLES})"
                for t in thin
            )
            + factcheck_str
            + cost_str
        )

    print(title)
    print(body)

    github_env = os.getenv("GITHUB_ENV")
    if github_env:
        with open(github_env, "a", encoding="utf-8") as env_file:
            env_file.write(f"BRIEF_TITLE={title}\n")
            env_file.write(f"BRIEF_EMOJI={emoji}\n")
            env_file.write(f"BRIEF_BODY<<BRIEF_EOF\n{body}\nBRIEF_EOF\n")

    # Exit 1 if content is critically missing so GitHub Actions marks the step failed
    return 1 if critical else 0


if __name__ == "__main__":
    script_dir = Path(__file__).parent
    bundle = script_dir / "output" / "latest.json"
    if not bundle.exists():
        print("ERROR: output/latest.json not found — has bilinguist_write.py run yet?",
              file=sys.stderr)
        sys.exit(0)
    sys.exit(check(bundle))

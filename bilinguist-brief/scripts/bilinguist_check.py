"""
Post-generation completeness check for the Bilinguist Brief daily pipeline.

Reads output/latest.json and verifies every expected lang/level/length
combination is present. Writes a status summary to GITHUB_ENV so the
calling workflow can include it in the ntfy push notification.

Always exits 0 — missing articles are flagged but don't fail the pipeline.
"""

import json
import os
import sys
from pathlib import Path

LANGUAGE_LEVELS: dict[str, list[str]] = {
    "fr": ["A1", "A2", "B1", "B2", "C1", "Native"],
    "de": ["A1", "A2", "Native"],
    "sv": ["B2", "Native"],
    "en": ["B2", "C1", "Native"],
    "it": ["A1", "Native"],
    "es": ["A2"],
    "tr": ["A1"],
}

LENGTHS = ["short", "longer"]

LANG_NAMES = {"fr": "French", "de": "German", "sv": "Swedish",
               "en": "English", "it": "Italian", "es": "Spanish", "tr": "Turkish"}

_STAGE_LABELS: dict[str, str] = {
    "1_gather": "Gather (Pro Flex)",
    "2S":       "Stage 2S writing",
    "2B":       "Stage 2B beginner",
    "2M":       "Stage 2M writing",
    "3":        "Stage 3 native",
    "4a":       "Stage 4a grade native",
    "4b":       "Stage 4b grade CEFR",
    "4":        "Stage 4 grading",      # legacy key — kept for old bundles
}


def _cost_summary(output_dir: Path, date: str) -> str:
    """Returns a compact cost breakdown string, or '' if the costs file is absent."""
    costs_path = output_dir / f"costs_{date}.json"
    if not costs_path.exists():
        return ""
    try:
        with open(costs_path) as f:
            costs = json.load(f)
    except Exception:
        return ""

    lines = [f"\n💰 API Cost: £{costs['total_gbp']:.3f} (${costs['total_usd']:.3f})"]
    for sname in ["1_gather", "2S", "2M", "3", "4a", "4b", "4"]:
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
        lines.append(
            f"  {label} ({sdata['calls']}×): {tok_str} → £{sdata['cost_gbp']:.3f}"
        )
    return "\n".join(lines)


def _factcheck_summary(script_dir: Path, date: str) -> str:
    """Returns a fact-check summary string for the ntfy report, or '' if not run."""
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
        return f"\n🔍 Fact-check: {checked} stories verified — no corrections needed ✓"

    lines = [f"\n🔍 Fact-check: {count} correction(s) applied ({checked} stories checked)"]
    for c in corrections:
        slug      = c.get("slug", "?")
        original  = c.get("original", "?")
        corrected = c.get("corrected", "?")
        reason    = c.get("reason", "")
        lines.append(f"  • [{slug}] «{original}» → «{corrected}»")
        if reason:
            lines.append(f"    ↳ {reason}")
    return "\n".join(lines)


def _language_breakdown(briefings: dict, native_journalism: dict, native_grades: dict = {}) -> str:
    """
    Returns a per-language, per-level breakdown showing which levels are present.
    Levels intentionally skipped by the pipeline (at/above native grade) are omitted.
    """
    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
    lines = []
    for lang, levels in LANGUAGE_LEVELS.items():
        lang_name = LANG_NAMES.get(lang, lang)
        native_grade = native_grades.get(lang)
        skip_from_idx = CEFR_ORDER.index(native_grade) if native_grade in CEFR_ORDER else len(CEFR_ORDER)
        level_parts = []
        for level in levels:
            if level == "Native":
                has_any = bool(native_journalism.get(lang))
                mark = "✓" if has_any else "✗"
                level_parts.append(f"{level}{mark}")
            elif level in CEFR_ORDER and CEFR_ORDER.index(level) >= skip_from_idx:
                continue  # intentionally skipped — omit from breakdown
            else:
                has_any = any(
                    briefings.get(lang, {}).get(level, {}).get(length, {}).get("articles")
                    for length in LENGTHS
                )
                mark = "✓" if has_any else "✗"
                level_parts.append(f"{level}{mark}")
        lines.append(f"  {lang_name}: {' '.join(level_parts)}")
    return "\n".join(lines)


def check(bundle_path: Path) -> None:
    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    briefings         = bundle.get("briefings", {})
    native_journalism = bundle.get("nativeJournalism", {})
    native_grades     = bundle.get("nativeGrades", {})
    date              = bundle.get("date", "unknown")

    CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

    # ── Check article combinations ─────────────────────────────────────────────
    # Native is a single entry per language (not split by length) stored in
    # nativeJournalism. CEFR levels are split by short/longer in briefings.
    # Levels at or above the native grade are intentionally skipped by the
    # pipeline (P3 native journalism covers them) — don't flag them as missing.
    missing: list[str] = []
    present = 0
    total   = 0

    for lang, levels in LANGUAGE_LEVELS.items():
        native_grade = native_grades.get(lang)
        skip_from_idx = CEFR_ORDER.index(native_grade) if native_grade in CEFR_ORDER else len(CEFR_ORDER)

        for level in levels:
            if level == "Native":
                total += 1
                if native_journalism.get(lang):
                    present += 1
                else:
                    missing.append(f"{LANG_NAMES.get(lang, lang)} Native")
            else:
                if level in CEFR_ORDER and CEFR_ORDER.index(level) >= skip_from_idx:
                    continue  # intentionally skipped by pipeline
                for length in LENGTHS:
                    total += 1
                    articles = briefings.get(lang, {}).get(level, {}).get(length, {}).get("articles", [])
                    if articles:
                        present += 1
                    else:
                        missing.append(f"{LANG_NAMES.get(lang, lang)} {level}/{length}")

    # ── Per-language level breakdown ───────────────────────────────────────────
    breakdown = _language_breakdown(briefings, native_journalism, native_grades)

    # ── Cost summary ───────────────────────────────────────────────────────────
    script_dir = bundle_path.parent.parent  # scripts/ not scripts/output/
    cost_str = _cost_summary(bundle_path.parent, date)

    # ── Fact-check summary ────────────────────────────────────────────────────
    factcheck_str = _factcheck_summary(script_dir, date)

    # ── Build report ───────────────────────────────────────────────────────────
    if missing:
        title  = f"Bilinguist Brief — {present}/{total} ⚠️"
        emoji  = "warning"
        body   = (
            f"{date}: {len(missing)} combination(s) missing.\n\n"
            f"Languages:\n{breakdown}\n\n"
            f"Missing:\n" + "\n".join(f"  ✗ {m}" for m in missing)
            + factcheck_str
            + cost_str
        )
    else:
        title  = f"Bilinguist Brief — {present}/{total} ✅"
        emoji  = "white_check_mark"
        body   = (
            f"{date}: All {total} article combinations generated.\n\n"
            f"Languages:\n{breakdown}"
            + factcheck_str
            + cost_str
        )

    print(title)
    print(body)

    # ── Write to GitHub ENV for notification step ──────────────────────────────
    github_env = os.getenv("GITHUB_ENV")
    if github_env:
        with open(github_env, "a", encoding="utf-8") as env_file:
            env_file.write(f"BRIEF_TITLE={title}\n")
            env_file.write(f"BRIEF_EMOJI={emoji}\n")
            # Multi-line value using GitHub heredoc syntax
            env_file.write(f"BRIEF_BODY<<BRIEF_EOF\n{body}\nBRIEF_EOF\n")


if __name__ == "__main__":
    script_dir = Path(__file__).parent
    bundle = script_dir / "output" / "latest.json"
    if not bundle.exists():
        print("ERROR: output/latest.json not found — has bilinguist_write.py run yet?", file=sys.stderr)
        sys.exit(0)
    check(bundle)

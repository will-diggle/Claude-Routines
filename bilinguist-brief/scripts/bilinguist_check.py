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
    "fr": ["A1", "A2", "B1", "B2", "C1", "C2"],
    "de": ["A1", "A2", "Native"],
    "sv": ["B2", "Native"],
    "en": ["B2", "C1", "C2", "Native"],
    "it": ["A1", "Native"],
    "es": ["A2"],
    "tr": ["A1"],
}

LENGTHS = ["short", "medium", "longer"]
NATIVE_LANGS = [lang for lang, levels in LANGUAGE_LEVELS.items() if "Native" in levels]

LANG_NAMES = {"fr": "French", "de": "German", "sv": "Swedish",
               "en": "English", "it": "Italian", "es": "Spanish", "tr": "Turkish"}


def check(bundle_path: Path) -> None:
    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    briefings       = bundle.get("briefings", {})
    native_journal  = bundle.get("nativeJournalism", {})
    date            = bundle.get("date", "unknown")

    # ── Check article combinations ─────────────────────────────────────────────
    missing: list[str] = []
    present = 0
    total   = 0

    for lang, levels in LANGUAGE_LEVELS.items():
        for level in levels:
            for length in LENGTHS:
                total += 1
                articles = briefings.get(lang, {}).get(level, {}).get(length, {}).get("articles", [])
                if articles:
                    present += 1
                else:
                    missing.append(f"{LANG_NAMES.get(lang, lang)} {level}/{length}")

    # ── Check native journalism ────────────────────────────────────────────────
    native_missing: list[str] = []
    for lang in NATIVE_LANGS:
        if not native_journal.get(lang):
            native_missing.append(f"{LANG_NAMES.get(lang, lang)} native journalism")

    all_missing = missing + native_missing

    # ── Build report ───────────────────────────────────────────────────────────
    if all_missing:
        title  = f"Bilinguist Brief — {present}/{total} ⚠️"
        emoji  = "warning"
        body   = (
            f"{date}: {len(all_missing)} combination(s) missing:\n"
            + "\n".join(f"  ✗ {m}" for m in all_missing)
        )
    else:
        title  = f"Bilinguist Brief — {present}/{total} ✅"
        emoji  = "white_check_mark"
        body   = f"{date}: All {total} article combinations generated successfully."

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

"""
extract_daily_words.py
=======================
Pulls today's live brief bundle and extracts every unique surface-form word
per language, across every genre and length variant, in the same output
shape DAILY_BRIEF_MISSION.md / POPULATE_MISSION.md expect
(output/missing_words.json — a flat map of language -> list of surface forms).

This does NOT lemmatize or dedupe by lemma, and does NOT check what's
already in word_dictionary — that's deliberately left to the Claude Code
worker following the mission doc, exactly like the existing
POPULATE_MISSION.md workflow already does (see its step 3).

Tokenization matches the app's own tap-target logic (TappableText.tsx's
`/(\\p{L}+(?:'\\p{L}+)?)|([^\\p{L}]+)/gu`) as closely as Python's stdlib
allows without the third-party `regex` package: letter runs, with an
allowance for one internal apostrophe (contractions like "aujourd'hui").

Usage:
    python3 extract_daily_words.py
    python3 extract_daily_words.py --langs fr,de,es,it,sv   # default
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"
BUNDLE_URL = "https://bilinguist-brief.williamdiggz.workers.dev/latest"

# Matches POPULATE_MISSION.md's priority list — English is the source
# language (nothing to look up), Portuguese isn't a supported in-app
# language yet even though the bundle carries it.
DEFAULT_LANGS = ["fr", "de", "es", "it", "sv"]

# Skip pure-numeral tokens and single-character noise; real filtering of
# proper nouns / short abbreviations is left to the Claude worker per
# POPULATE_MISSION.md's own "Important rules" section.
WORD_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)


def fetch_bundle() -> dict:
    # Cloudflare's basic bot protection 403s urllib's default User-Agent —
    # a normal browser-ish UA gets through fine.
    req = urllib.request.Request(BUNDLE_URL, headers={"User-Agent": "Mozilla/5.0 (bilinguist-brief-scripts)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def extract_words_for_lang(native_journalism: dict, lang: str) -> set[str]:
    words: set[str] = set()
    lengths = native_journalism.get(lang, {})
    for articles in lengths.values():
        for article in articles:
            text = f"{article.get('headline', '')} {article.get('body', '')}"
            for m in WORD_RE.finditer(text):
                token = m.group(0).lower()
                if len(token) < 2:
                    continue
                words.add(token)
    return words


def main():
    langs = DEFAULT_LANGS
    for arg in sys.argv[1:]:
        if arg.startswith("--langs="):
            langs = [l.strip() for l in arg.split("=", 1)[1].split(",") if l.strip()]

    print(f"Fetching {BUNDLE_URL} ...")
    bundle = fetch_bundle()
    date = bundle.get("date", "unknown-date")
    nj = bundle.get("nativeJournalism", {})

    result: dict[str, list[str]] = {}
    for lang in langs:
        words = sorted(extract_words_for_lang(nj, lang))
        result[lang] = words
        print(f"  {lang}: {len(words)} unique surface forms")

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "missing_words.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out_path} (brief date: {date})")
    print("Next: follow DAILY_BRIEF_MISSION.md to process this list.")


if __name__ == "__main__":
    main()

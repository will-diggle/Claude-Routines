"""
dict_writer.py
==============
Accepts a JSON array of dictionary entries on stdin (or as a file argument)
and upserts them into the Supabase word_dictionary table.

Usage:
    python dict_writer.py entries.json
    echo '[{...}]' | python dict_writer.py

Each entry must have at minimum: language, lemma, word_type, translation.
word is set to lemma automatically if not provided.
"""

import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE   = SCRIPT_DIR.parent / ".env"


def _load_env_file(path: Path) -> None:
    """Minimal .env loader — no python-dotenv dependency required. Only
    sets a var if it isn't already in the environment, same precedence
    python-dotenv uses by default."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file(ENV_FILE)

SUPABASE_URL = os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — "
        f"set them in {ENV_FILE} or the environment before running this script."
    )

REQUIRED = {"language", "lemma", "word_type", "translation"}


def main():
    # Read input
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            entries = json.load(f)
    else:
        entries = json.load(sys.stdin)

    if not isinstance(entries, list):
        entries = [entries]

    from supabase import create_client
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    ok = 0
    skip = 0
    fail = 0

    for entry in entries:
        missing = REQUIRED - set(entry.keys())
        if missing:
            print(f"[SKIP] Missing fields {missing}: {entry.get('lemma','?')}", file=sys.stderr)
            skip += 1
            continue

        lemma = str(entry["lemma"]).strip().lower()
        row = {
            "language":              str(entry["language"]).strip().lower(),
            "word":                  lemma,          # root form = lemma
            "lemma":                 lemma,
            "word_type":             str(entry.get("word_type", "other")).lower(),
            "translation":           entry.get("translation") or "",
            "level":                 entry.get("level"),
            "ipa":                   entry.get("ipa"),
            "explanation":           entry.get("explanation"),
            "example_sentence":      entry.get("example_sentence"),
            "example_translation":   entry.get("example_translation"),
            "tip":                   entry.get("tip"),
            "word_family":           entry.get("word_family"),
            "common_collocations":   entry.get("common_collocations"),
            "governed_prepositions": entry.get("governed_prepositions"),
            "source":                "claude",
            "data":                  entry.get("data") or None,
        }

        # Strip null-as-string values
        for k in ("tip", "word_family", "common_collocations", "governed_prepositions",
                  "ipa", "explanation", "example_sentence", "example_translation", "level"):
            if row[k] in ("null", "", "None", None):
                row[k] = None

        try:
            supa.table("word_dictionary").upsert(
                row, on_conflict="language,lemma,word_type"
            ).execute()
            print(f"[OK] {row['language']}/{lemma} ({row['word_type']})")
            ok += 1
        except Exception as e:
            print(f"[FAIL] {row['language']}/{lemma}: {e}", file=sys.stderr)
            fail += 1

    print(f"\nDone: {ok} written, {skip} skipped, {fail} failed")


if __name__ == "__main__":
    main()

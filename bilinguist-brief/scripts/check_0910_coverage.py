"""
check_0910_coverage.py
=======================
Post-population coverage check for 2026-09-10: takes the raw candidate word
lists computed earlier today (scripts/output/w0910_{lang}.json — every word
in today's brief, all levels + native, that didn't exact-match an existing
lemma at the time) and checks how many now have a word_forms row after the
2,777-entry population write + full re-sync.

Note: these candidate lists were saved lowercased, so this can't re-apply
the proper-noun/English-fragment exclusion heuristic used earlier this
session (that needed sentence-position capitalization, which wasn't
persisted) — this reports raw coverage, some of the remainder will
genuinely be proper nouns / loanwords pending the separate lightweight pass.
"""

import json
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"


def _load_env_file(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file(ENV_FILE)
SUPABASE_URL = os.environ["EXPO_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

from supabase import create_client
supa = create_client(SUPABASE_URL, SUPABASE_KEY)

CHUNK = 150
LANGS = ["fr", "de", "es", "it", "pt", "sv"]

grand_total = 0
grand_missing = 0
missing_samples = {}

for lang in LANGS:
    fpath = SCRIPT_DIR / "output" / f"w0910_{lang}.json"
    with open(fpath, encoding="utf-8") as f:
        data = json.load(f)
    words = sorted({w for batch in data["batches"] for w in batch})

    found = set()
    for i in range(0, len(words), CHUNK):
        chunk = words[i:i + CHUNK]
        in_list = ",".join(chunk)
        res = supa.table("word_forms").select("word").eq("language", lang).in_("word", chunk).execute()
        found.update(r["word"] for r in res.data)

    missing = [w for w in words if w not in found]
    pct = 100 * (len(words) - len(missing)) / len(words) if words else 100
    print(f"{lang}: {len(words)} candidates, {len(missing)} still missing ({pct:.1f}% covered)")
    grand_total += len(words)
    grand_missing += len(missing)
    missing_samples[lang] = missing[:15]

overall_pct = 100 * (grand_total - grand_missing) / grand_total if grand_total else 100
print(f"\nOVERALL: {grand_total} candidates, {grand_missing} still missing ({overall_pct:.1f}% covered)")
print("\nSample of still-missing words per language:")
for lang, sample in missing_samples.items():
    print(f"  {lang}: {sample}")

"""
backfill_requested_forms.py
=============================
Every population round today generated entries keyed by LEMMA — but the
word actually requested (the real surface form from the brief text) often
differs from the lemma: elisions ("s'abstiendrait" -> lemma "s'abstenir"),
clitic-attached verb forms ("arreglarlo" -> lemma "arreglar"), separable
verbs, etc. dict_writer.py always sets word_dictionary.word = lemma, so
these exact requested surface forms were never captured as their own
word_forms row, even though the underlying data (translation, full verb
paradigm, etc.) was generated correctly.

This reads every output/consolidated*.json ever written (already has the
resolved language attached to each entry — no need to re-derive it), finds
every {word, lemma} pair where they differ, and upserts a word_forms row
for the REQUESTED word carrying the resolved lemma's full data — no new AI
generation, just making already-generated data reachable under the actual
surface form a real tap would use. Deliberately not scoped to one day's
tag (was hardcoded to "0911" until 2026-09-12, which silently skipped
every later day's files) — re-processing old pairs is a harmless no-op
upsert, and this way nothing is ever missed regardless of which day it
came from.
"""
import glob
import json
import os
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"


def _load_env_file(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(ENV_FILE)
from supabase import create_client
supa = create_client(os.environ["EXPO_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

files = sorted(glob.glob(str(SCRIPT_DIR / "output" / "consolidated*.json")))
print(f"Reading {len(files)} consolidated files: {[Path(f).name for f in files]}")

diffs = []
for fpath in files:
    with open(fpath, encoding="utf-8") as f:
        entries = json.load(f)
    for e in entries:
        word = str(e.get("word") or "").strip()
        lemma = str(e.get("lemma") or "").strip()
        lang = e.get("language")
        word_type = str(e.get("word_type") or "other").lower()
        if word and lemma and lang and word.lower() != lemma.lower():
            diffs.append((word.lower(), lemma.lower(), lang, word_type))

print(f"{len(diffs)} requested-word/lemma pairs differ (surface form != lemma)")

# De-dup, last-wins is fine — they all trace back to the same lemma's data anyway
by_key = {}
for word, lemma, lang, word_type in diffs:
    by_key[(word, lang)] = (lemma, word_type)
print(f"{len(by_key)} unique (word, language) surface forms to backfill")

ok, skipped = 0, 0
lemma_cache = {}
for (word, lang), (lemma, word_type) in by_key.items():
    cache_key = (lang, lemma)
    if cache_key not in lemma_cache:
        for attempt in range(3):
            try:
                r = supa.table("word_forms").select("*").eq("language", lang).eq("lemma", lemma).execute()
                lemma_cache[cache_key] = r.data
                break
            except Exception as ex:
                if attempt == 2:
                    print(f"[FAIL] lookup {lang}/{lemma} after 3 attempts: {ex}")
                    lemma_cache[cache_key] = []
                else:
                    time.sleep(2 * (attempt + 1))
    rows = lemma_cache[cache_key]
    if not rows:
        skipped += 1
        continue
    # Prefer a row matching the same word_type if there are multiple senses
    base = next((r for r in rows if r.get("word_type") == word_type), rows[0])
    base_row = dict(base)
    base_row["word"] = word
    base_row["word_type"] = base.get("word_type") or word_type
    base_row.pop("id", None)
    base_row.pop("updated_at", None)
    try:
        supa.table("word_forms").upsert(
            base_row, on_conflict="word,language,word_type", ignore_duplicates=False
        ).execute()
        ok += 1
    except Exception as ex:
        print(f"[FAIL] {lang}/{word}: {ex}")
        skipped += 1

print(f"\nDone: {ok} backfilled, {skipped} skipped (no matching lemma row in word_forms yet)")

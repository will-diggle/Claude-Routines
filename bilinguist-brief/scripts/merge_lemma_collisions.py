"""
merge_lemma_collisions.py
==========================
Finds and merges word_dictionary lemma entries that are actually just
inflected forms of a DIFFERENT lemma already in the dictionary (e.g. French
"allée" stored as its own lemma when spaCy's tokenMap says it's a form of
"aller"). Confirmed via the pipeline's own tokenMap lemma tags from cached
brief bundles — not guessed.

For each confirmed (bad_lemma, true_lemma) pair per language:
  1. Delete the bad lemma's word_dictionary row (it was never a real lemma).
  2. Delete any word_forms rows keyed to the bad lemma (stale, orphaned).
  3. Ensure the bad lemma's surface form still resolves correctly by
     copying the TRUE lemma's word_forms row under that surface form —
     so a tap on "allée" in running text still gets "aller"'s real data.

Usage:
    python3 merge_lemma_collisions.py --dry-run     # report only
    python3 merge_lemma_collisions.py               # apply
"""
import argparse
import glob
import json
import os
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"
LANGUAGES = ["fr", "de", "es", "it", "sv", "pt"]


def _load_env_file(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(ENV_FILE)
from supabase import create_client  # noqa: E402

supa = create_client(os.environ["EXPO_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def collect_token_maps(bundle, lang):
    tms = []
    native = bundle.get("nativeJournalism", {}).get(lang, {})
    for arts in native.values():
        for a in arts:
            tms.extend(a.get("tokenMap") or [])
    levels = bundle.get("briefings", {}).get(lang, {})
    for lengths in levels.values():
        for section in lengths.values():
            for a in section.get("articles", []):
                tms.extend(a.get("tokenMap") or [])
    return tms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    surface_to_lemma_by_lang = {lang: {} for lang in LANGUAGES}
    for fpath in sorted(glob.glob(str(SCRIPT_DIR / "output" / "brief_*.json"))):
        bundle = json.load(open(fpath, encoding="utf-8"))
        for lang in LANGUAGES:
            for t in collect_token_maps(bundle, lang):
                surf = (t.get("surface") or "").lower()
                lemma = (t.get("lemma") or "").lower()
                if surf and lemma:
                    surface_to_lemma_by_lang[lang].setdefault(surf, lemma)

    # Content words (verb participles, noun plurals, adjective agreement) are
    # mechanically safe to merge — the "bad" entry is unambiguously just an
    # inflected form. Closed-class words (articles/pronouns/determiners,
    # word_type "other"/"determiner"/"pronoun") are NOT auto-merged: spaCy's
    # lemmatizer is markedly less reliable on function words (e.g. it
    # lemmatized Swedish "den" -> "en", but those are the definite and
    # indefinite article — genuinely different words, not a collision), and
    # some closed-class lemmas are real homographs with multiple senses
    # (German "der" has determiner/pronoun/other rows) where guessing which
    # sense to attach a merge to risks a wrong, confusing entry. These are
    # reported for manual review instead.
    SAFE_WORD_TYPES = {"verb", "noun", "adjective"}

    total_merged = 0
    total_skipped_unsafe = 0
    for lang in LANGUAGES:
        r = supa.table("word_dictionary").select("lemma,word_type").eq("language", lang).execute()
        db_lemma_types = {}
        for row in r.data:
            if row.get("lemma"):
                db_lemma_types.setdefault(row["lemma"].lower(), set()).add((row.get("word_type") or "other").lower())
        db_lemmas = set(db_lemma_types.keys())
        s2l = surface_to_lemma_by_lang[lang]

        collisions = []
        unsafe = []
        for db_lemma in db_lemmas:
            true_lemma = s2l.get(db_lemma)
            if true_lemma and true_lemma != db_lemma and true_lemma in db_lemmas:
                bad_types = db_lemma_types[db_lemma]
                good_types = db_lemma_types[true_lemma]
                if bad_types & SAFE_WORD_TYPES and good_types & SAFE_WORD_TYPES:
                    collisions.append((db_lemma, true_lemma))
                else:
                    unsafe.append((db_lemma, true_lemma, bad_types, good_types))

        print(f"\n{lang}: {len(collisions)} safe collisions to merge, {len(unsafe)} closed-class ones skipped for manual review")
        for bad, good, bt, gt in unsafe:
            print(f"  [SKIP-unsafe] \"{bad}\" ({bt}) -> \"{good}\" ({gt}) — closed-class, needs a human to confirm")
        total_skipped_unsafe += len(unsafe)
        for bad, good in collisions:
            print(f"  \"{bad}\" -> \"{good}\"")
            if args.dry_run:
                continue

            good_rows = None
            for attempt in range(3):
                try:
                    good_rows = supa.table("word_forms").select("*").eq("language", lang).eq("lemma", good).execute().data
                    break
                except Exception as ex:
                    if attempt == 2:
                        print(f"    [FAIL] lookup '{good}' after 3 attempts: {ex}")
                        good_rows = []
                    else:
                        time.sleep(2 * (attempt + 1))
            if not good_rows:
                print(f"    [SKIP] no word_forms row for good lemma '{good}' yet — run sync first")
                continue
            base_row = dict(good_rows[0])
            base_row["word"] = bad
            base_row.pop("id", None)
            base_row.pop("updated_at", None)
            try:
                supa.table("word_forms").upsert(
                    base_row, on_conflict="word,language,word_type", ignore_duplicates=False
                ).execute()
            except Exception as ex:
                print(f"    [FAIL] upsert {bad}->{good}: {ex}")
                continue

            try:
                supa.table("word_forms").delete().eq("language", lang).eq("lemma", bad).neq("word", bad).execute()
            except Exception as ex:
                print(f"    [WARN] cleanup stale word_forms for '{bad}': {ex}")

            try:
                supa.table("word_dictionary").delete().eq("language", lang).eq("lemma", bad).execute()
                total_merged += 1
            except Exception as ex:
                print(f"    [FAIL] delete word_dictionary '{bad}': {ex}")

    if args.dry_run:
        print(f"\nDry run — nothing written. {total_skipped_unsafe} closed-class collisions need manual review.")
    else:
        print(f"\nMerged {total_merged} duplicate lemma entries. {total_skipped_unsafe} closed-class collisions left for manual review (see output above).")


if __name__ == "__main__":
    main()

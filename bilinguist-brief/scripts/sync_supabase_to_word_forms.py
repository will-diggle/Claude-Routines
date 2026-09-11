"""
sync_supabase_to_word_forms.py
================================
Expands Supabase `word_dictionary` (one row per lemma) into `word_forms`
(one row per inflected surface form — the lemma itself, every conjugated
verb form, plural nouns, feminine/comparative adjective forms, German case
declensions). This is what lets the app match a brief's actual on-page text
directly against Supabase, with no intermediate cache layer.

Reuses the exact row-building logic already written and validated for the
D1 sync (scripts/sync_supabase_to_d1.py) — same extraction, same single-
token-only filter for compound forms — just targets a Supabase table
instead of generating D1 SQL.

Usage:
    python3 sync_supabase_to_word_forms.py --dry-run     # counts only
    python3 sync_supabase_to_word_forms.py                # writes for real
    python3 sync_supabase_to_word_forms.py --lang de       # single language
"""

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from sync_supabase_to_d1 import fetch_all_rows, rows_for_lemma, LANGUAGES  # noqa: E402

BATCH_SIZE = 500


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--lang", choices=LANGUAGES)
    args = ap.parse_args()

    import dict_writer
    from supabase import create_client
    supa = create_client(dict_writer.SUPABASE_URL, dict_writer.SUPABASE_KEY)

    langs = [args.lang] if args.lang else LANGUAGES
    grand_total = 0

    for lang in langs:
        supa_rows = fetch_all_rows(supa, lang)
        word_forms_rows = []
        for row in supa_rows:
            for entry in rows_for_lemma(row):
                word_forms_rows.append({
                    "word": entry["word"],
                    "language": entry["language"],
                    "lemma": entry["lemma"],
                    "word_type": entry["word_type"],
                    "translation": entry["translation"],
                    "explanation": entry["explanation"],
                    "example": entry["example"],
                    "pronunciation": entry["pronunciation"],
                    "forms": entry["forms"],
                    "tip": entry["tip"],
                    "meta": entry["meta"],
                    "level": entry["level"],
                })

        # word_forms is unique on (word, language, word_type) — one row PER
        # SENSE, e.g. German "sein" keeps a separate row for the verb ("to
        # be") and the possessive adjective ("his/its") rather than one
        # colliding into the other. Still de-dup within a batch: the same
        # lemma's own expansion can legitimately produce the same surface
        # form twice (e.g. a tense-table conjugation matching the stored
        # past_participle), and two DIFFERENT lemmas of the same word_type
        # can still coincide (verb-verb homographs). Without this, a single
        # upsert batch containing the same conflict key twice gets rejected
        # outright by Postgres ("ON CONFLICT DO UPDATE command cannot affect
        # row a second time"), silently failing the WHOLE batch.
        deduped = {}
        for r in word_forms_rows:
            deduped[(r["word"], r["language"], r["word_type"])] = r
        word_forms_rows = list(deduped.values())

        print(f"{lang}: {len(supa_rows)} lemmas -> {len(word_forms_rows)} word_forms rows")
        grand_total += len(word_forms_rows)

        if args.dry_run:
            continue

        ok, fail = 0, 0
        for i in range(0, len(word_forms_rows), BATCH_SIZE):
            chunk = word_forms_rows[i:i + BATCH_SIZE]
            try:
                # word_forms is purely derived from word_dictionary — nothing
                # else ever writes to it, so always overwrite with the latest
                # source data (ignore_duplicates=True would let stale junk
                # rows silently survive forever, which is exactly what
                # happened here: "veut" kept serving a 2026-07-07 placeholder
                # row even after word_dictionary's version was deleted and
                # replaced with real data).
                supa.table("word_forms").upsert(
                    chunk, on_conflict="word,language,word_type", ignore_duplicates=False
                ).execute()
                ok += len(chunk)
            except Exception as e:
                fail += len(chunk)
                print(f"  [FAIL] {lang} batch {i}-{i+len(chunk)}: {e}", file=sys.stderr)
        print(f"  -> {ok} written, {fail} failed")

    print(f"\nTOTAL: {grand_total} word_forms rows across {len(langs)} language(s)")
    if args.dry_run:
        print("Dry run — nothing written to Supabase.")


if __name__ == "__main__":
    main()

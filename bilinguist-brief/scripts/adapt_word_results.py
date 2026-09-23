"""
adapt_word_results.py
======================
Translates populate_word_workflow.js's raw result (one entry per word, in
the app's own generateWordData() field names) into the batch shape
consolidate_and_write.py already knows how to write to word_dictionary.

This is the ONLY place the "app shape" (wordType, example, pronunciation,
forms, meta) gets converted to word_dictionary's column names (word_type,
example_sentence, ipa, data.app_forms, data.app_meta) — sync_supabase_to_d1.py
then prefers those app_forms/app_meta keys directly over reconstructing them
(see its 2026-09-18 comments), so this adapter's shape must stay in sync
with what that file expects.

Usage:
    python3 adapt_word_results.py raw_result.json --out result_{tag}.json
"""

import argparse
import json
from pathlib import Path


def adapt(raw):
    """raw: list of {lang, word, entry} as returned by populate_word_workflow.js.
    Returns: list of {lang, idx, entries: [<old-shape entry>]} for
    consolidate_and_write.py --result-json."""
    batches = []
    for i, item in enumerate(raw):
        if not item:
            continue
        lang = item["lang"]
        word = item["word"]
        e = item["entry"]
        old_shape = {
            "word": word,
            "lemma": e.get("lemma"),
            "word_type": e.get("wordType"),
            "translation": e.get("translation"),
            "level": e.get("level"),
            "ipa": e.get("pronunciation"),
            "explanation": e.get("explanation"),
            "example_sentence": e.get("example"),
            "example_translation": None,
            "tip": e.get("tip"),
            "word_family": None,
            "common_collocations": None,
            "governed_prepositions": None,
            "data": {
                "tenses": e.get("tenses"),
                "declensions": e.get("declensions"),
                "exampleMarked": e.get("exampleMarked"),
                "app_forms": e.get("forms"),
                "app_meta": e.get("meta"),
            },
        }
        batches.append({"lang": lang, "idx": i, "entries": [old_shape]})
    return batches


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw_result")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    raw = json.loads(Path(args.raw_result).read_text(encoding="utf-8"))
    batches = adapt(raw)
    Path(args.out).write_text(json.dumps(batches, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Adapted {len(batches)} word results -> {args.out}")


if __name__ == "__main__":
    main()

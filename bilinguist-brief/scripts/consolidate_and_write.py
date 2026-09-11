"""
consolidate_and_write.py
=========================
Generalized version of the one-off consolidate_0910.py: reads a completed
Workflow's journal.jsonl, recovers which language each batch answered (by
word-overlap against the known input batches — the journal doesn't record
job metadata), dedupes by (language, lemma, word_type) keeping the
richest `data`, writes the consolidated entries to disk, and upserts them
to Supabase word_dictionary via dict_writer.py.

Usage:
    python3 consolidate_and_write.py \\
        --journal /path/to/journal.jsonl \\
        --batch-glob "output/final0911_*.json" \\
        --out output/consolidated_0911.json \\
        [--write]   # actually upsert to Supabase (dry-run without this flag)
"""
import argparse
import glob
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--journal", required=True)
    ap.add_argument("--batch-glob", required=True, help='e.g. "output/final0911_*.json" or "output/final_pn_0911_*.json"')
    ap.add_argument("--out", required=True)
    ap.add_argument("--write", action="store_true", help="Upsert to Supabase via dict_writer.py")
    args = ap.parse_args()

    # Language word sets, derived from the SAME batch files fed to the Workflow —
    # matching by language only (not exact batch idx): duplicate/skipped idx
    # values from the job list don't matter for the final write, only language does.
    lang_words = {}
    for fpath in sorted(glob.glob(args.batch_glob)):
        # filename shape: final{tag}_{lang}.json or final_pn_{tag}_{lang}.json
        lang = Path(fpath).stem.rsplit("_", 1)[-1]
        with open(fpath, encoding="utf-8") as f:
            batches = json.load(f)
        lang_words[lang] = {w.lower() for batch in batches for w in batch}

    print(f"Loaded word sets for {len(lang_words)} languages: " +
          ", ".join(f"{k}={len(v)}" for k, v in lang_words.items()))

    results = []
    with open(args.journal, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            if d.get("type") == "result" and d.get("result", {}).get("entries"):
                results.append(d["result"]["entries"])

    print(f"Loaded {len(results)} agent results from journal")

    matched = []
    unmatched = []
    for entries in results:
        entry_words = {e["word"].lower() for e in entries if e.get("word")}
        scores = {lang: len(entry_words & words) for lang, words in lang_words.items()}
        best_lang = max(scores, key=scores.get) if scores else None
        best_score = scores.get(best_lang, 0) if best_lang else 0
        if best_lang and best_score >= max(3, len(entry_words) * 0.3):
            matched.append((best_lang, entries))
        else:
            unmatched.append(entries)

    print(f"Matched {len(matched)}/{len(results)} results to a language")
    if unmatched:
        print(f"{len(unmatched)} UNMATCHED results (dropped):")
        for entries in unmatched:
            print(f"  sample_words={[e.get('word') for e in entries[:5]]}")

    best_by_key = {}
    for lang, entries in matched:
        for e in entries:
            e2 = dict(e)
            e2["language"] = lang
            dkey = (lang, str(e2.get("lemma", "")).strip().lower(), str(e2.get("word_type", "other")).lower())
            richness = len(json.dumps(e2.get("data") or {}))
            prev = best_by_key.get(dkey)
            if prev is None or richness > prev[0]:
                best_by_key[dkey] = (richness, e2)

    deduped = [v[1] for v in best_by_key.values()]
    raw_count = sum(len(entries) for _, entries in matched)
    print(f"{raw_count} raw entries -> {len(deduped)} deduped entries")

    from collections import defaultdict
    by_lang = defaultdict(int)
    for e in deduped:
        by_lang[e["language"]] += 1
    for lang, n in sorted(by_lang.items()):
        print(f"  {lang}: {n}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {args.out}")

    if args.write:
        print("\nUpserting to Supabase via dict_writer.py...")
        subprocess.run([sys.executable, str(SCRIPT_DIR / "dict_writer.py"), args.out], check=True)
    else:
        print("\nDry run (pass --write to actually upsert to Supabase).")


if __name__ == "__main__":
    main()

"""
consolidate_and_write.py
=========================
Reads a completed Workflow's output, dedupes by (language, lemma, word_type)
keeping the richest `data`, writes the consolidated entries to disk, and
upserts them to Supabase word_dictionary via dict_writer.py.

Two ways to supply the Workflow's output:

  --result-json  (PREFERRED) — a JSON file holding the Workflow tool call's
    own return value: an array of {"lang": ..., "idx": ..., "entries": [...]}
    objects, exactly what populate_0911_workflow.js / populate_pn_0911_workflow.js
    already return per batch. Language comes directly from this structure —
    always correct, including for 1-3 word batches that word-overlap matching
    routinely drops (see 2026-09-11 session notes: every "unmatched" batch
    that day was small enough to fail the overlap threshold below). To get
    this file: after a Workflow call returns, the tool result's `result`
    field IS this array — save it with e.g.
    `Write({file_path: "output/result_<tag>.json", content: JSON.stringify(toolResult.result)})`
    or read it back from the run's journal.jsonl "result" lines and reshape.

  --journal + --batch-glob  (FALLBACK) — reads journal.jsonl and recovers
    each batch's language by word-overlap against the known input batch
    files, since the journal alone doesn't record job metadata. Only use
    this when --result-json isn't available (e.g. hand-authoring a
    continuation script from an old journal after a resume). Batches of
    1-3 words routinely fail the overlap threshold and get dropped — if
    that happens, prefer re-deriving --result-json instead of accepting
    the drop.

Usage:
    python3 consolidate_and_write.py \\
        --result-json output/result_0911.json \\
        --out output/consolidated_0911.json \\
        [--write]   # actually upsert to Supabase (dry-run without this flag)

    # or, fallback mode:
    python3 consolidate_and_write.py \\
        --journal /path/to/journal.jsonl \\
        --batch-glob "output/final0911_*.json" \\
        --out output/consolidated_0911.json \\
        [--write]
"""
import argparse
import glob
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent


def load_token_lemma_maps(tag):
    """surface(lowercase) -> spaCy lemma(lowercase), per language, from that
    day's cached bundle. Used to catch a generated entry whose OWN `lemma`
    field is actually just an inflected form of something else (e.g. Haiku
    returning lemma="allée" instead of "aller") BEFORE it's ever written —
    see 2026-09-12/13 session notes: the generation-prompt instruction
    alone cut this but didn't eliminate it (9 new collisions appeared on
    2026-09-13 despite the tightened prompt), so this is a second,
    structural line of defense rather than relying on prompt compliance."""
    path = SCRIPT_DIR / "output" / f"brief_{tag}.json"
    if not path.exists():
        return {}
    bundle = json.load(open(path, encoding="utf-8"))
    maps = {}

    def scan(lang, articles):
        for a in articles:
            for t in a.get("tokenMap") or []:
                surf = (t.get("surface") or "").lower()
                lemma = (t.get("lemma") or "").lower()
                if surf and lemma:
                    maps.setdefault(lang, {}).setdefault(surf, lemma)

    for lang, native in bundle.get("nativeJournalism", {}).items():
        for articles in native.values():
            scan(lang, articles)
    for lang, levels in bundle.get("briefings", {}).items():
        for lengths in levels.values():
            for section in lengths.values():
                scan(lang, section.get("articles", []))
    return maps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--result-json", help="Workflow's own [{lang, idx, entries}] return value — preferred, see module docstring")
    ap.add_argument("--journal", help="Fallback: journal.jsonl path, used with --batch-glob")
    ap.add_argument("--batch-glob", help='Fallback: e.g. "output/final0911_*.json" or "output/final_pn_0911_*.json"')
    ap.add_argument("--tag", help="Date tag (e.g. 0913) — enables pre-write lemma-collision correction against that day's cached bundle tokenMap. Strongly recommended.")
    ap.add_argument("--out", required=True)
    ap.add_argument("--write", action="store_true", help="Upsert to Supabase via dict_writer.py")
    args = ap.parse_args()

    matched = []
    unmatched = []

    if args.result_json:
        with open(args.result_json, encoding="utf-8") as f:
            batches = json.load(f)
        print(f"Loaded {len(batches)} batches from {args.result_json}")
        for b in batches:
            lang, entries = b.get("lang"), b.get("entries") or []
            if lang and entries:
                matched.append((lang, entries))
        print(f"Matched {len(matched)}/{len(batches)} batches to a language (direct — no overlap guessing)")
    else:
        if not args.journal or not args.batch_glob:
            sys.exit("Fallback mode needs both --journal and --batch-glob (or use --result-json instead)")

        # Language word sets, derived from the SAME batch files fed to the Workflow —
        # matching by language only (not exact batch idx): duplicate/skipped idx
        # values from the job list don't matter for the final write, only language does.
        lang_words = {}
        for fpath in sorted(glob.glob(args.batch_glob)):
            # filename shape: final{tag}_{lang}.json or final_pn_{tag}_{lang}.json
            lang = Path(fpath).stem.rsplit("_", 1)[-1]
            with open(fpath, encoding="utf-8") as f:
                lang_batches = json.load(f)
            lang_words[lang] = {w.lower() for batch in lang_batches for w in batch}

        print(f"Loaded word sets for {len(lang_words)} languages: " +
              ", ".join(f"{k}={len(v)}" for k, v in lang_words.items()))

        results = []
        with open(args.journal, encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                if d.get("type") == "result" and d.get("result", {}).get("entries"):
                    results.append(d["result"]["entries"])

        print(f"Loaded {len(results)} agent results from journal")

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
            print(f"{len(unmatched)} UNMATCHED results (dropped) — re-run with --result-json instead to avoid this:")
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

    # Pre-write lemma-collision correction: only for word_types where an
    # inflected-form-as-lemma mistake is mechanically unambiguous to fix
    # (verb/noun/adjective) — never closed-class (articles/pronouns/
    # determiners), where spaCy's own lemmatizer is markedly less reliable
    # and an auto-correction risks introducing a wrong result instead of
    # fixing one (mirrors merge_lemma_collisions.py's same safety split).
    #
    # CRITICAL SAFETY RULE, added 2026-09-13 after a real incident: only
    # correct TO a lemma that ALREADY independently exists in the
    # dictionary (from before this run). The first version of this trusted
    # spaCy's tokenMap lemma tag blindly and wrote real garbage as a result
    # — e.g. Swedish "neutralitet" "corrected" to "neutralit" (not a word),
    # "ögonblick" to "ögonblå" (not a word), Italian "irlandese" to
    # "irlandendere" (not a word). spaCy's lemmatizer is unreliable enough,
    # especially on compounds and less-common words, that its output must
    # never be trusted as ground truth on its own — only as CORROBORATION
    # of something already independently verified (i.e. a real lemma
    # someone/something else already created a dictionary entry for).
    # Never trust an unvalidated NLP tag as a silent correction to real data.
    SAFE_WORD_TYPES = {"verb", "noun", "adjective"}
    if args.tag:
        token_lemma_maps = load_token_lemma_maps(args.tag)
        # Read-only, so runs regardless of --write — a dry run should preview
        # the same corrections a real write would actually apply.
        existing_lemmas_by_lang = {}
        import dict_writer
        from supabase import create_client
        supa = create_client(dict_writer.SUPABASE_URL, dict_writer.SUPABASE_KEY)
        for lang in {e["language"] for e in deduped}:
            start, page, lemmas = 0, 1000, set()
            while True:
                r = supa.table("word_dictionary").select("lemma").eq("language", lang).order("id").range(start, start + page - 1).execute()
                if not r.data:
                    break
                lemmas.update(row["lemma"].lower() for row in r.data if row.get("lemma"))
                if len(r.data) < page:
                    break
                start += page
            existing_lemmas_by_lang[lang] = lemmas
        corrected = 0
        for e in deduped:
            word_type = str(e.get("word_type", "")).lower()
            if word_type not in SAFE_WORD_TYPES:
                continue
            lang_map = token_lemma_maps.get(e["language"], {})
            declared_lemma = str(e.get("lemma", "")).strip().lower()
            true_lemma = lang_map.get(declared_lemma)
            if not true_lemma or true_lemma == declared_lemma:
                continue
            if true_lemma not in existing_lemmas_by_lang.get(e["language"], set()):
                print(f"  [lemma-fix SKIPPED, unverified] {e['language']}: \"{declared_lemma}\" -> \"{true_lemma}\" is not an existing lemma — spaCy tag alone isn't trusted, keeping \"{declared_lemma}\" (word={e.get('word')})")
                continue
            print(f"  [lemma-fix] {e['language']}: \"{declared_lemma}\" -> \"{true_lemma}\" (word={e.get('word')})")
            e["lemma"] = true_lemma
            corrected += 1
        if corrected:
            print(f"Corrected {corrected} mis-resolved lemma(s) before writing (see above)")
            # Correcting lemmas can make two originally-distinct entries land
            # on the same (language, lemma, word_type) key — re-dedupe,
            # richest data wins, same rule as the first pass.
            re_deduped = {}
            for e in deduped:
                dkey = (e["language"], str(e.get("lemma", "")).strip().lower(), str(e.get("word_type", "other")).lower())
                richness = len(json.dumps(e.get("data") or {}))
                prev = re_deduped.get(dkey)
                if prev is None or richness > prev[0]:
                    re_deduped[dkey] = (richness, e)
            if len(re_deduped) < len(deduped):
                print(f"  (lemma correction merged {len(deduped) - len(re_deduped)} newly-colliding entries)")
            deduped = [v[1] for v in re_deduped.values()]
    else:
        print("WARNING: no --tag given, skipping pre-write lemma-collision correction — pass --tag to enable it")

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

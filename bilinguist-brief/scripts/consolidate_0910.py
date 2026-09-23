"""
consolidate_0910.py
====================
One-off consolidation for the 2026-09-10 population Workflow (158 Haiku
subagent batches, task w6scjd7nw). The workflow's journal.jsonl records each
agent's returned `entries` array but NOT which (lang, idx) job it was
answering — Workflow doesn't persist that mapping. Recovered here by
matching each result's entry words against the known input batch word lists
(scripts/output/final0910_{lang}.json), since batches are effectively
non-overlapping vocabulary and overlap-scoring is unambiguous in practice.

Output: scripts/output/consolidated_0910.json — deduped entries (by
language+lemma+word_type, richest `data` field wins), ready for
dict_writer.py.
"""

import json
import glob
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
JOURNAL = "/Users/willdiggle/.claude/projects/-Users-willdiggle-claude-routines/d1ddac9f-2cde-4df1-9a60-2db0c1e60913/subagents/workflows/wf_068fcfc4-260/journal.jsonl"

# ── Load input words per language (union across all batches) ───────────────
# Matching only needs to recover LANGUAGE, not the exact batch idx — Supabase
# rows only care about language. A first pass matching to individual (lang,
# idx) batches found ~30/158 results whose true batch had been claimed by a
# duplicate-idx competitor, leaving other idx values never processed at all
# (an artifact of the original workflow's job list, now irrelevant) — union
# by language sidesteps that entirely since duplicates don't affect which
# language a result belongs to.
lang_words = {}
for fpath in sorted(glob.glob(str(SCRIPT_DIR / "output" / "final0910_*.json"))):
    lang = fpath.split("final0910_")[1].split(".json")[0]
    with open(fpath, encoding="utf-8") as f:
        batches = json.load(f)
    lang_words[lang] = {w.lower() for batch in batches for w in batch}

print(f"Loaded word sets for {len(lang_words)} languages: " +
      ", ".join(f"{k}={len(v)}" for k, v in lang_words.items()))

# ── Load journal results ────────────────────────────────────────────────────
results = []
with open(JOURNAL, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        if d.get("type") == "result" and d.get("result", {}).get("entries"):
            results.append(d["result"]["entries"])

print(f"Loaded {len(results)} agent results from journal")

# ── Match each result to its language by word overlap ──────────────────────
matched = []
unmatched = []
for entries in results:
    entry_words = {e["word"].lower() for e in entries if e.get("word")}
    scores = {lang: len(entry_words & words) for lang, words in lang_words.items()}
    best_lang = max(scores, key=scores.get)
    best_score = scores[best_lang]
    if best_score >= max(3, len(entry_words) * 0.3):
        matched.append((best_lang, entries, best_score, scores))
    else:
        unmatched.append((entries, scores))

print(f"Matched {len(matched)}/{len(results)} results to a language")
if unmatched:
    print(f"\n{len(unmatched)} UNMATCHED results:")
    for entries, scores in unmatched:
        words_sample = [e.get("word") for e in entries[:5]]
        print(f"  sample_words={words_sample} scores={scores}")

# Sanity check: flag any match that's ambiguous (a real second-place language
# scoring suspiciously close) — should be ~0 given disjoint vocabularies.
for best_lang, entries, best_score, scores in matched:
    runner_up = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0
    if runner_up > 0 and runner_up >= best_score * 0.5:
        print(f"  [AMBIGUOUS] chose {best_lang} ({best_score}) but scores={scores}")

# ── Flatten with resolved language, dedupe (richest data wins) ─────────────
best_by_key = {}
for lang, entries, score, scores in matched:
    for e in entries:
        e2 = dict(e)
        e2["language"] = lang
        dkey = (lang, str(e2.get("lemma", "")).strip().lower(), str(e2.get("word_type", "other")).lower())
        richness = len(json.dumps(e2.get("data") or {}))
        prev = best_by_key.get(dkey)
        if prev is None or richness > prev[0]:
            best_by_key[dkey] = (richness, e2)

deduped = [v[1] for v in best_by_key.values()]
print(f"\n{sum(len(entries) for _, entries, _, _ in matched)} raw entries -> {len(deduped)} deduped entries")

by_lang = defaultdict(int)
for e in deduped:
    by_lang[e["language"]] += 1
for lang, n in sorted(by_lang.items()):
    print(f"  {lang}: {n}")

out_path = SCRIPT_DIR / "output" / "consolidated_0910.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(deduped, f, ensure_ascii=False, indent=2)
print(f"\nWrote {out_path}")

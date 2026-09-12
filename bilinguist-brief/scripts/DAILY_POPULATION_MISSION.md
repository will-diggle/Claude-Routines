# Daily word-population mission

Runs unattended every morning via launchd. You are a fresh Claude Code session
with no memory of prior runs — everything you need is below or in the scripts
this references.

**Working directory**: `/Users/willdiggle/claude-routines/bilinguist-brief/scripts`

**Hard constraint, no exceptions**: every `agent()` call inside any Workflow
script you write or launch MUST set `model: 'claude-haiku-4-5-20251001'`
explicitly. Omitting it silently inherits this session's own (expensive)
model — that mistake already happened once and is not to be repeated. Before
launching any Workflow, grep the script you're about to run for `model:` and
confirm every `agent(` call has it.

## Steps

1. **Extract today's candidates**:
   ```
   python3 daily_extract.py
   ```
   (no `--tag` — defaults to today's date). This fetches the live brief
   bundle, extracts every unique word across native journalism AND all CEFR
   levels for 6 languages (fr/de/es/it/sv/pt — NOT English), filters out
   anything already in `word_forms`, and writes:
   - `output/final{tag}_{lang}.json` — genuine-vocabulary batches
   - `output/jobs_{tag}.json` — job descriptors for the vocab Workflow
   - `output/summary_{tag}.json` — the day's stats

   Before batching, it also auto-resolves candidates whose real (tokenMap)
   lemma is already a known lemma — e.g. a French candidate "affectés" when
   "affecter" already exists and already has past_participle_masculine_plural
   generated. These get their word_forms row copied from the existing lemma
   directly, at zero AI cost, and never reach the Workflow at all (see the
   "N auto-resolved (free)" line in the console output). This matters: on
   2026-09-12 this alone cut candidates needing generation by ~2.5% same-day,
   and — more importantly — it's also *why* re-asking a model to determine a
   lemma for an already-known word was producing duplicate/collided lemma
   entries (see prompt note in step 3 below). Don't skip this step or try to
   "optimize" it away — it's the fix, not overhead.

   If `jobs_{tag}.json` is empty (0 batches), there's nothing to populate —
   skip straight to step 5 and just report that.

2. **Split off proper nouns using tokenMap POS tags** (NOT capitalization —
   German capitalizes every noun, so capitalization is useless as a signal
   there; PROPN is the actual pipeline-provided signal and works for all 6
   languages). For each language, read `output/brief_{tag}.json`, walk every
   article's `tokenMap`, collect surface forms tagged `PROPN`, and intersect
   with that language's `final{tag}_{lang}.json` word list. Move any match
   into its own `output/final_pn_{tag}_{lang}.json` batch file (same 25-word
   batching), and rebuild `output/final{tag}_{lang}.json` / `jobs_{tag}.json`
   to exclude those words. Write `output/pn_jobs_{tag}.json` for the
   proper-noun batches. (See `output/populate_pn_0911_workflow.js`'s
   docstring-style comments for the exact prompt shape to reuse — don't
   reinvent it, copy the pattern and just swap in the new tag.)

3. **Launch two Workflows** (Haiku, per the hard constraint above):
   - Main vocabulary: reuse the pattern in
     `output/populate_0911_workflow.js` (copy it to
     `output/populate_{tag}_workflow.js`, updating the file paths it reads
     from `final0911_{lang}.json` to `final{tag}_{lang}.json`), with
     `args` = the contents of `output/jobs_{tag}.json`. That template's
     `lemma` field instruction was tightened on 2026-09-12 to explicitly
     reject participle/inflected forms as their own lemma (e.g. French
     "adoptée"/"allés"/"atteint" must resolve to "adopter"/"aller"/
     "atteindre") — ~1.6% of the whole dictionary was duplicate/collided
     lemma entries from Haiku treating an inflected surface form as if it
     were its own citation form. Keep this instruction when copying the
     template; don't simplify it back down.
   - Proper nouns: same pattern from `output/populate_pn_0911_workflow.js`,
     `args` = `output/pn_jobs_{tag}.json`.
   Wait for both to complete (the Workflow tool call blocks/notifies on
   completion within a session — just await them normally).

4. **Consolidate and write**, for each completed Workflow. Each Workflow call's
   own return value (the `result` field of the tool result, not the journal)
   is already an array of `{"lang": ..., "idx": ..., "entries": [...]}`
   objects — write that straight to a file and pass it as `--result-json`:
   ```
   python3 consolidate_and_write.py \
     --result-json output/result_{tag}_vocab.json \
     --out output/consolidated_{tag}.json \
     --write
   ```
   (repeat for the proper-noun Workflow's own result -> `output/result_{tag}_pn.json`
   -> `output/consolidated_pn_{tag}.json`). This is IMPORTANT: consolidate_and_write.py
   also supports a `--journal`/`--batch-glob` fallback mode that recovers
   language by word-overlap against the input batch files, but that fails
   for any batch of 1-3 words (routinely happens on a near-100%-coverage
   day) and silently drops them — always prefer `--result-json`, which
   carries the language directly and never has this failure mode.
   Then run `backfill_requested_forms.py` — every population round generates
   entries keyed by LEMMA, but the exact requested surface form (elisions,
   clitic-attached verb forms, German case/gender-declined forms, etc.) is
   often different from the lemma and never gets its own `word_forms` row
   otherwise, even though the lemma's data is fully generated. This script
   reads EVERY `output/consolidated*.json` file that has ever been written
   (not scoped to today's tag — it was hardcoded to "0911" until
   2026-09-12, which silently skipped every later day; don't reintroduce a
   tag scope here) and backfills the gap at zero extra AI cost (this was the
   single highest-impact fix found on 2026-09-11 — it alone dropped 5
   languages' remaining gap from 228 words to 19):
   ```
   python3 backfill_requested_forms.py
   ```
   Then sync everything into `word_forms` (what the app actually reads) —
   run this AFTER backfill, since backfill needs each lemma's row to already
   exist in `word_forms` to copy its data from:
   ```
   python3 sync_supabase_to_word_forms.py
   ```
   If `backfill_requested_forms.py` reports any "skipped (no matching lemma
   row yet)", it means backfill ran before sync had a chance to write that
   lemma's row — re-run `backfill_requested_forms.py` once more after the
   sync completes to pick up the rest.

5. **Report**: how many words were newly populated today (sum of both
   Workflows' written counts), the day's total/unique/truly-new stats from
   `output/summary_{tag}.json`, and confirm `word_forms` sync succeeded with
   0 failures. If anything failed partway (a script error, a Workflow with
   errored agents, a sync failure), say exactly what failed and where things
   were left — don't silently retry indefinitely or guess at a fix.

## What NOT to do

- Don't touch `bilinguist-brief/src/**` or `bilinguist-worker/src/**` (app
  code) — this mission is data population only.
- Don't run any SQL migrations or `ALTER TABLE` statements.
- Don't delete or overwrite existing dictionary entries except via the
  merge-safe patterns already established (`consolidate_and_write.py`'s
  richest-`data`-wins dedup) — never a blind overwrite.
- Don't loop more than 2 population rounds in one run even if truly-new
  isn't zero afterward — diminishing returns set in fast (see
  2026-09-11 session: 2832 -> 1159 -> 872 truly-new across 3 rounds). One
  fresh-candidates round plus one immediate re-check-and-fill round is
  enough for a daily cadence; leave any stubborn remainder for the next
  day's run rather than burning a long unattended session chasing it.

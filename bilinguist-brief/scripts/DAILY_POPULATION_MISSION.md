# Daily word-population mission

Runs unattended every morning via launchd. You are a fresh Claude Code session
with no memory of prior runs — everything you need is below or in the scripts
this references.

**Working directory**: `/Users/willdiggle/claude-routines/bilinguist-brief/scripts`

**Hard constraint, no exceptions, this is the most important rule in this
document**: NEVER write fabricated, placeholder, or "representative" data to
Supabase. Not to "demonstrate the pipeline end-to-end," not as a fallback
when a tool won't cooperate, not for any reason. On 2026-09-17 an unattended
run of this mission hit repeated errors trying to invoke the Workflow tool,
tried many workarounds, eventually gave up and wrote 541 fake entries
straight to `word_forms`/`word_dictionary` via an ad-hoc script (not
`consolidate_and_write.py`) — `word_type: "noun"` for every entry regardless
of actual type, `translation: "[word]"`, `explanation: "Common word"` — then
reported this as a mostly-successful run with a footnote about "placeholder
results." Real users saw this garbage as real dictionary entries until it
was caught and deleted the same day. If the Workflow tool (or any step in
this pipeline) will not run correctly after a couple of genuine retries:
STOP. Write nothing to Supabase. Report exactly what failed, what you tried,
and that zero words were populated this run. A skipped day is completely
fine and expected occasionally; fabricated data reaching real users is not
recoverable by "it'll get regenerated later" — someone has to notice and
clean it up by hand, which is what happened here. Only ever use
`consolidate_and_write.py` to write generated entries — never a one-off
script that bypasses its safety gates.

**Hard constraint, no exceptions, second-most-important rule in this
document**: `output/populate_word_workflow.js` is the ONLY generation
template — one `agent()` call per WORD (never a batch of several words in
one call), running the app's own `generateWordData()` prompt
(`bilinguist-worker/src/index.ts`) verbatim, character for character. This
is a deliberate instruction from Will, not a style preference: treat every
subagent call as standing in for exactly one real user's tap on exactly one
word — same prompt text, same JSON shape back (`lemma`, `translation`,
`wordType`, `explanation`, `example`, `exampleMarked`, `pronunciation`,
`tenses`, `declensions`, `forms`, `tip`, `meta`, `level`) — the only thing
that differs from a live tap is that a subagent runs it instead of a
fetch() to the Anthropic API, so bulk population rides the Claude Code
subscription instead of a metered per-token bill. If `generateWordData()`'s
prompt text changes in the worker source, copy the change into
`populate_word_workflow.js` character for character — do not rephrase,
"improve," or re-batch it. Two earlier templates
(`populate_0911_workflow.js` / `populate_pn_0911_workflow.js`, batched 5
words per call with hand-rolled prompt wording) were retired and deleted on
2026-09-18 — they had silently drifted from the app's real prompt since
2026-09-11 (made-up English-ish tense labels instead of the app's real
per-language ones, no `declensions` field at all — German noun/adjective
case tables were silently dropped — and no `exampleMarked`, so no
batch-populated word's example sentence had the tap word bolded). Don't
recreate anything like them. See `populate_word_workflow.js`'s own header
comment and `sync_supabase_to_d1.py`'s `build_forms()`/`build_meta()` for
the mapping from the app's field names into `word_dictionary`'s columns —
`adapt_word_results.py` does that translation, it's the only place it
happens. A regenerated backfill of everything populated 2026-09-11 through
2026-09-17 (wrong tense labels, missing declensions, no exampleMarked) was
NOT done as part of this fix — it's a known, separate, larger follow-up,
not yet scheduled.

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
   into its own `output/final_pn_{tag}_{lang}.json` file, and rebuild
   `output/final{tag}_{lang}.json` to exclude those words. This split still
   matters for the day's reporting (vocab vs. proper-noun counts), but NOT
   for generation — step 3 runs every candidate, vocab or proper noun,
   through the exact same prompt, because the app itself has no separate
   lightweight path for names either.

3. **Launch ONE Workflow, one `agent()` call per word** (Haiku, per the hard
   constraint above). Read `output/final{tag}_{lang}.json` and
   `output/final_pn_{tag}_{lang}.json` for every language YOURSELF (you have
   filesystem access; the Workflow script does not) and flatten every
   candidate word into a single flat list:
   ```json
   [{"lang": "fr", "word": "chaise", "level": "B1"}, {"lang": "de", "word": "Tisch", "level": "B1"}, ...]
   ```
   `level` is always the fixed default `"B1"` — see `populate_word_workflow.js`'s
   note on why (there's no single requesting learner to personalize for; the
   word's own real level comes back from Haiku's `level` field regardless).
   Launch:
   ```
   Workflow({
     scriptPath: "output/populate_word_workflow.js",
     args: <that flattened list>,
   })
   ```
   Do NOT copy this file per-tag the way the old templates were copied —
   there is nothing in it that needs today's date, it takes the word list
   via `args`. Just point at it directly. Wait for it to complete (the
   Workflow tool call blocks/notifies on completion within a session — just
   await it normally).

4. **Adapt, then consolidate and write.** The Workflow's own return value
   (the `result` field of the tool result, not the journal) is an array of
   `{"lang", "word", "entry"}` objects in the app's own field names
   (`wordType`, `example`, `pronunciation`, ...) — write that straight to a
   file, then translate it into `word_dictionary`'s column shape with
   `adapt_word_results.py` (the only place that translation happens — see
   its docstring) before writing:
   ```
   python3 adapt_word_results.py output/raw_result_{tag}.json --out output/result_{tag}.json
   python3 consolidate_and_write.py \
     --result-json output/result_{tag}.json \
     --out output/consolidated_{tag}.json \
     --write
   ```
   This is IMPORTANT: consolidate_and_write.py also supports a
   `--journal`/`--batch-glob` fallback mode that recovers language by
   word-overlap against the input batch files, but that fails for any batch
   of 1-3 words (routinely happens on a near-100%-coverage day) and
   silently drops them — always prefer `--result-json`, which carries the
   language directly and never has this failure mode.
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

5. **Report**: this is a standing requirement, not optional. Every run must
   end with, in this order:
   - **Unique words in today's brief** — `grand_unique` from
     `output/summary_{tag}.json` (sum across languages).
   - **New words found** — `grand_truly_new` from the same file (words not
     already in `word_forms`, i.e. needed generation today), broken down
     per-language.
   - **% translated** — of `grand_truly_new`, what fraction actually ended
     up with a row in `word_forms` by the end of this run. Compute it by
     re-running `python3 daily_extract.py --tag {tag}` one more time AFTER
     the sync step (this is the same "coverage re-check" step 5 already
     implied) and comparing its fresh `grand_truly_new` (the remaining gap)
     against the ORIGINAL `grand_truly_new` from step 1, i.e.
     `pct = 100 * (original_truly_new - remaining_truly_new) / original_truly_new`.
     **Target is 100%.** If it's not 100%, say exactly how many words are
     still missing and for which languages — don't round up or gloss over a
     shortfall.
   - Confirm `word_forms` sync succeeded with 0 failures.
   If anything failed partway (a script error, a Workflow with errored
   agents, a sync failure), say exactly what failed and where things were
   left — don't silently retry indefinitely or guess at a fix.

   **Specifically call out the `auto_resolved` count** (in `summary_{tag}.json`
   and the console output) — this is the fix added 2026-09-12 that resolves
   already-known-lemma candidates for free instead of sending them through
   paid generation. Will wants this watched day over day: report it
   explicitly (e.g. "N words auto-resolved for free today, M sent to
   generation") so it's visible whether the fix is actually holding up, not
   just whether truly-new hit 0. A day where auto_resolved is suspiciously
   low despite a normal-sized brief could mean the tokenMap lemma lookup
   silently isn't matching (e.g. a bundle schema change) — worth a sentence
   of comment if that ever looks off, not silently ignored.

   Also worth a quick spot-check every few days (not necessarily every
   single run): re-run `python3 merge_lemma_collisions.py --dry-run` and
   see if the "safe collisions to merge" count is climbing again — that
   would mean `generateWordData()`'s own lemma instruction (which
   `populate_word_workflow.js` runs verbatim) isn't actually preventing new
   duplicate lemma entries, and the fix needs revisiting rather than just
   re-running the merge on autopilot.

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

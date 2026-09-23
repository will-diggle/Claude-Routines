# Daily Brief Word Population Mission

This is the daily counterpart to `POPULATE_MISSION.md` — same target database,
same schema, same quality bar, but the word list comes from **today's live
brief** instead of a static backlog. Read `POPULATE_MISSION.md` first; this
doc only covers what's different.

## Step 0 — Generate today's word list

```
python3 extract_daily_words.py
```

This fetches the live bundle from the worker, pulls every unique surface
form (across every genre and both length variants — Global News, Business,
UK, US, Europe, short + longer) per language, and writes
`output/missing_words.json` in the exact shape `POPULATE_MISSION.md` expects.
A normal day produces roughly 1,000–1,200 surface forms per language before
lemma-dedup — after collapsing to unique lemmas (step 2 below) the real
count of new dictionary entries is much smaller, since most of that is
inflected repeats of a few hundred root words.

## Step 1 — Skip what's already covered

Unlike `POPULATE_MISSION.md`'s original backlog (which was pre-filtered),
this list is NOT filtered against what's already in the database — a normal
day's brief is full of common words ("government", "said", "today", their
equivalents in each language) that are almost certainly already entries.
**Before generating anything**, check `word_dictionary` for each candidate
lemma once you've identified it in step 2, and skip any that already have a
row for that `(language, lemma, word_type)`. This is the single biggest
lever on how much work a given day actually requires — most days, most of
the list will already be covered, and only genuinely new vocabulary
(proper nouns aside) needs a fresh entry.

## Step 2 onward — same as POPULATE_MISSION.md

Follow `POPULATE_MISSION.md` exactly from its "How to work" step 2 onward:
lemmatize, batch, generate entries matching its schema, write via
`dict_writer.py`. Same priority language order, same entry schema, same
tense/pronoun tables per language, same "Important rules" section.

## Also feeding D1 (the app's live lookup cache)

The Supabase `word_dictionary` write (via `dict_writer.py`) is the
"structured archive to play with later" — it does not by itself make these
words faster to look up in the app. That's a **separate** write, to the
Cloudflare D1 `words` table the app actually reads from at runtime, via:

```
POST https://bilinguist-brief.williamdiggz.workers.dev/word
Headers: X-Admin-Key: <WORKER_ADMIN_KEY>
Body: {
  "word": "<lemma>", "language": "<lang>",
  "translation": "...", "lemma": "<lemma>", "wordType": "...",
  "explanation": "...", "example": "...", "pronunciation": "...",
  "verbTable": {...tenses[0].table, if a verb...},
  "verbTablePast": {...tenses[1].table, if a verb...},
  "forms": {...}, "tip": "...", "meta": {...}
}
```

This uses a differently-shaped body than `word_dictionary` (see
`generateWordData` in `bilinguist-worker/src/index.ts` for the exact live
prompt/schema this mirrors) — same underlying facts, different field names,
because it matches whatever the live worker already produces on a cache
miss. `WORKER_ADMIN_KEY` is a Cloudflare secret, not stored in this repo —
get it from whoever set it (`wrangler secret put WORKER_ADMIN_KEY` if it
needs re-setting) before this half of the mission can run. Until then, the
`word_dictionary` archive write alone is still worth doing on its own.

## Security note

`dict_writer.py` currently has the Supabase key hardcoded in plaintext
(line 22). It's git-ignored/untracked today, but should move to reading
from `bilinguist-brief/.env` before anyone commits it by accident.

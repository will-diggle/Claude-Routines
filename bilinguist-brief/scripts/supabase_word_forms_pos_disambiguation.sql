-- word_forms can currently only hold ONE row per (word, language) — a real
-- homograph like German "sein" (verb "to be" vs. possessive "his/its")
-- collapses to whichever sense was synced last, so a tap on the verb sense
-- can show the possessive's translation instead. spaCy already tags the
-- correct part-of-speech per occurrence in the pipeline's tokenMap, so the
-- fix is to let word_forms hold one row PER SENSE and disambiguate by
-- word_type at read time, instead of forcing every sense into one row.
--
-- Run this once in the Supabase dashboard's SQL editor.

-- Drop whatever the existing (word, language) unique constraint is actually
-- named (it was created inline, so Postgres auto-generated the name — this
-- looks it up rather than guessing, so the migration doesn't silently no-op
-- if the name isn't what's assumed).
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'word_forms'::regclass
    AND contype = 'u';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE word_forms DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE word_forms
  ADD CONSTRAINT word_forms_word_language_word_type_key UNIQUE (word, language, word_type);

-- idx_word_forms_lookup already covers (language, word) — still the right
-- shape (queries fetch every sense for a word, then pick by word_type
-- client-side), so it's left as-is.

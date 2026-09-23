-- 003_word_dictionary_rls.sql
-- Enables RLS on word_dictionary. The table was created without it, leaving it
-- writable by anyone with the anon key.
--
-- Policy intent:
--   SELECT  — open to all (including unauthenticated users): it's a public shared dictionary.
--   INSERT/UPDATE — authenticated users only: prevents arbitrary writes via the anon key.
--
-- Side-effect: anonymous users triggering a fallback AI lookup will no longer
-- cache the result into word_dictionary. The word explanation still shows (from
-- the live AI call); it just won't persist for other users. The upsert in
-- dictionaryService.ts is already wrapped in try/catch so this fails silently.

ALTER TABLE word_dictionary ENABLE ROW LEVEL SECURITY;

-- Public read: every user (anon or authenticated) can look up words.
CREATE POLICY "word_dictionary_public_read" ON word_dictionary
  FOR SELECT USING (true);

-- Authenticated write: only signed-in users can upsert dictionary entries.
-- This covers both Gemini/Excel bulk imports (run with a service-role key that
-- bypasses RLS) and in-app fallback writes (anon users are excluded; they still
-- see the AI result, the cache write just no-ops).
CREATE POLICY "word_dictionary_auth_write" ON word_dictionary
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "word_dictionary_auth_update" ON word_dictionary
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

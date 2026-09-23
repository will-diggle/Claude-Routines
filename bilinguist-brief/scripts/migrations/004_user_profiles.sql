-- Migration 004: user_profiles
--
-- One row per user. Created on first sign-in (or via the record-acceptance
-- Edge Function when the user agrees to ToS and Privacy Policy).
--
-- terms_version / privacy_version store the document version string the user
-- accepted (e.g. '2026-07-21'). If these columns are NULL the user has not
-- yet accepted. If they differ from the current app version, re-prompt.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name         TEXT,
  terms_accepted_at    TIMESTAMPTZ,
  terms_version        TEXT,
  privacy_accepted_at  TIMESTAMPTZ,
  privacy_version      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users may read and update only their own profile.
CREATE POLICY "user_profiles_select_own"
  ON user_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_profiles_update_own"
  ON user_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Insert is handled server-side (Edge Function with service role key).
-- No client-side insert policy — clients cannot create profiles for other users.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

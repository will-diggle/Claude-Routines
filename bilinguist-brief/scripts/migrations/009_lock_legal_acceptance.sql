-- Migration 009: stop clients editing their own legal-acceptance record
--
-- 004 gave every user an UPDATE policy on their own user_profiles row, which
-- covers every column — including terms_version / terms_accepted_at /
-- privacy_version / privacy_accepted_at. That makes the acceptance audit
-- trail editable by the very person it's evidence about.
--
-- Nothing writes user_profiles from the client: the app and website only
-- SELECT their own row (FriendsScreen, SettingsScreen, bilinguist-web
-- lib/auth.ts), and every write goes through a service-role Edge Function
-- (record-acceptance, update-profile, register-push-token). So the client
-- UPDATE policy can simply go; service_role bypasses RLS and is unaffected.
--
-- Run once in the Supabase SQL editor.

DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;

-- Migration 006: avatar upload
--
-- Adds avatar_url to user_profiles and creates the "avatars" Storage bucket
-- that backs it. Public bucket (same tradeoff every mainstream app makes for
-- profile photos — not sensitive PII, path is a random UUID, no directory
-- listing) so avatar_url is a stable, permanent public URL rather than an
-- expiring signed URL that would need refreshing on every read.
--
-- Upload path convention: avatars/{user_id}/avatar.{ext} — the leading
-- {user_id} folder is what the RLS policies below key off of, via
-- storage.foldername(name), so a user can only write inside their own folder.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Public read (the bucket itself is public, but Storage still requires an
-- explicit SELECT policy on storage.objects for the public/anon role).
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- A user may only write/replace/delete objects inside their own {user_id}/
-- folder — storage.foldername(name) splits the object path on "/" and
-- returns the folder segments, so [1] is the top-level folder.
CREATE POLICY "avatars_own_folder_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_own_folder_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_own_folder_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 007_friends.sql
-- Friends feature: username search + shareable invite link (see ToS §7).
--
-- Cross-user reads (search results, a friend's streak data) deliberately do
-- NOT go through RLS policies here — RLS is row-level, not column-level, and
-- a policy letting any user read "rows with a username" would expose the
-- whole user_profiles/user_streaks row, including fields never promised to
-- friends (terms_accepted_at, practice_streak, speed_snap_high_score, etc.).
-- Those reads go through service-role Edge Functions that whitelist columns
-- in code instead (search-username, list-friends).

-- ── Real unique usernames ──────────────────────────────────────────────────
-- Separate column from user_profiles.display_name (which today is free text,
-- not unique, and used for a different purpose — OAuth display name). Stays
-- nullable: most existing accounts won't have one until they visit Friends.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_]{3,20}$');

-- One-time backfill: seed username from display_name for the handful of
-- existing values that already qualify (username-shaped, no case-insensitive
-- collision). Must run before the unique index below. Everyone else is
-- prompted to claim a handle the first time they open Friends.
UPDATE user_profiles a
SET username = a.display_name
WHERE a.username IS NULL
  AND a.display_name ~ '^[a-zA-Z0-9_]{3,20}$'
  AND NOT EXISTS (
    SELECT 1 FROM user_profiles b
    WHERE b.user_id <> a.user_id AND LOWER(b.display_name) = LOWER(a.display_name)
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_unique_ci
  ON user_profiles (LOWER(username));

-- Prefix-search index (search-username Edge Function does `ILIKE 'query%'`).
CREATE INDEX IF NOT EXISTS user_profiles_username_prefix
  ON user_profiles (LOWER(username) text_pattern_ops);

-- ── Active languages, for the "active languages" half of what friends see ──
-- Nothing today syncs this to the server; src/services/streakSync.ts's
-- pushToSupabase gets extended to include it in the existing user_streaks upsert.

ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS active_language_codes TEXT[] NOT NULL DEFAULT '{}';

-- ── Friendships ─────────────────────────────────────────────────────────────
-- One table with a status column, not a separate friend_requests table — a
-- two-table design needs a dual-write on accept (insert here, delete/update
-- there), a second place for the two to desync. No soft-deleted state either:
-- decline/cancel/unfriend are all plain DELETEs, so a removed pair is free to
-- re-request later with no leftover row blocking it.

CREATE TABLE IF NOT EXISTS friendships (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  -- Unordered pair, generated purely to drive the uniqueness constraint below
  -- so (A,B) and (B,A) can never coexist regardless of who requested whom.
  user_low      UUID        GENERATED ALWAYS AS (LEAST(requester_id, addressee_id)) STORED,
  user_high     UUID        GENERATED ALWAYS AS (GREATEST(requester_id, addressee_id)) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> addressee_id),
  UNIQUE (user_low, user_high)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select_own" ON friendships
  FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "friendships_insert_own_request" ON friendships
  FOR INSERT WITH CHECK (requester_id = auth.uid() AND status = 'pending');

-- Only the addressee may flip pending -> accepted.
CREATE POLICY "friendships_update_accept" ON friendships
  FOR UPDATE USING (addressee_id = auth.uid() AND status = 'pending')
  WITH CHECK (addressee_id = auth.uid() AND status = 'accepted');

-- Either party may delete: addressee declining, requester cancelling their
-- own pending request, or either side unfriending an accepted one.
CREATE POLICY "friendships_delete_own" ON friendships
  FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- PostgREST UPDATE payloads apply whatever JSON keys the caller sends as SET
-- clauses. The accept policy's WITH CHECK only constrains addressee_id/status
-- on the NEW row — it does not stop a hand-crafted PATCH from also smuggling
-- a different requester_id into the same statement, re-targeting an existing
-- pending row at an arbitrary victim and "accepting" it. This trigger closes
-- that regardless of policy.
CREATE OR REPLACE FUNCTION friendships_guard_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.requester_id <> OLD.requester_id OR NEW.addressee_id <> OLD.addressee_id THEN
    RAISE EXCEPTION 'requester_id and addressee_id are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER friendships_guard_update_trigger
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION friendships_guard_update();

CREATE TRIGGER friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at(); -- reuses 004_user_profiles.sql's function

-- ── Invite links (Phase 2) ──────────────────────────────────────────────────
-- Zero RLS policies (default-deny) — token issuance ("reuse if unexpired")
-- and redemption (expiry/self-add/already-friends checks) aren't safely
-- expressible as ownership-gated RLS, so both routes go through Edge
-- Functions via the service-role client.

CREATE TABLE IF NOT EXISTS friend_invites (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_friend_invites_owner ON friend_invites (owner_id);
CREATE INDEX IF NOT EXISTS idx_friend_invites_token ON friend_invites (token);

ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;

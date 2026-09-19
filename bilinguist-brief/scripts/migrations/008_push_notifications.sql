-- 008_push_notifications.sql
-- Server-triggered push notifications for the morning brief (and, later,
-- any other notification). Replaces the previous client-only scheduling in
-- src/services/notifications.ts, which could only deliver real per-day
-- content if the app happened to be opened before that day's target time —
-- a case most real usage (opening the app in the evening) never satisfies.

-- ── Push tokens ─────────────────────────────────────────────────────────────
-- One row per device, not a column on user_profiles — a single column would
-- silently drop a user's iPad token the moment their iPhone registers.
-- Unique on the token itself: an Expo push token identifies one app
-- install, so if a device changes hands or a different account signs in on
-- it, the token should move to the new owner via upsert(onConflict:
-- 'expo_push_token'), not sit orphaned still pointed at the previous user.

CREATE TABLE IF NOT EXISTS push_tokens (
  id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token  TEXT        NOT NULL,
  platform         TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_unique ON push_tokens (expo_push_token);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Client can see its own registered devices (future device-management UI).
-- No client insert/update/delete policy — all writes go through the
-- register-push-token Edge Function (service role), same "server-only
-- writes" shape as user_profiles.
CREATE POLICY "push_tokens_select_own" ON push_tokens
  FOR SELECT USING (user_id = auth.uid());

-- ── Notification schedule ────────────────────────────────────────────────
-- Scalar columns on user_profiles, not a new table — one value per user, no
-- one-to-many relationship to justify a table. Covered by user_profiles'
-- existing RLS for free (RLS is row-level).

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notification_time     TIME;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notification_timezone TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_notified_date    DATE;

-- NULL time/timezone means "not yet registered" — the sender skips those
-- rows. No separate notifications_enabled flag: "has at least one live
-- push_tokens row" is the signal, avoiding a second source of truth that
-- can drift from reality.

-- ── Atomic claim function ────────────────────────────────────────────────
-- Used by the sender both to find "whose local time matches right now"
-- (without needing per-minute cron precision — see window_minutes) and to
-- claim exactly-once-per-day delivery atomically. The row is marked
-- notified BEFORE the Expo API call, so a crash mid-send costs one missed
-- push that day, never a duplicate.

CREATE OR REPLACE FUNCTION claim_due_notification_users(window_minutes INT DEFAULT 15)
RETURNS TABLE(user_id UUID, local_date DATE)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT up.user_id, up.notification_timezone,
           (NOW() AT TIME ZONE up.notification_timezone)::date AS local_date
    FROM user_profiles up
    WHERE up.notification_time IS NOT NULL
      AND up.notification_timezone IS NOT NULL
      AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = up.user_id)
      -- Minutes since the user's target time passed today, wrapping
      -- midnight, so a run starting at 06:58 still catches a 06:50 target.
      -- Postgres has no interval % interval operator, so the wrap is done
      -- in numeric seconds instead (+ 86400 before MOD keeps the dividend
      -- positive, matching the intent of the original + INTERVAL '24 hours').
      AND (
        MOD(
          EXTRACT(EPOCH FROM (
            (NOW() AT TIME ZONE up.notification_timezone)::time - up.notification_time
          ))::numeric + 86400,
          86400
        ) / 60
      ) < window_minutes
      AND up.last_notified_date IS DISTINCT FROM (NOW() AT TIME ZONE up.notification_timezone)::date
  )
  UPDATE user_profiles up
  SET last_notified_date = due.local_date
  FROM due
  WHERE up.user_id = due.user_id
    AND up.last_notified_date IS DISTINCT FROM due.local_date  -- re-checked under row lock
  RETURNING up.user_id, due.local_date;
END;
$$;

REVOKE ALL ON FUNCTION claim_due_notification_users FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_due_notification_users TO service_role;

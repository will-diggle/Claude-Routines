-- 002_user_streaks.sql
-- Tracks per-user streak snapshots and per-day reading history.
--
-- Retention policy: reading_history rows are kept indefinitely.
-- At one row per (user, language, date) the table grows at ~365 × num_languages rows/user/year.
-- At typical engagement (5 languages, 100k users) that is ~180M rows after two years — acceptable
-- for Postgres. Revisit only if per-session granularity (multiple rows per day) is added later.

-- ── Streak snapshot ───────────────────────────────────────────────────────────
-- One row per authenticated user. Upserted on every streak-relevant event.
-- Per-language maps are JSONB so new languages require no schema changes.

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id                             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_streak                     INTEGER     NOT NULL DEFAULT 0,
  last_practiced_date                 DATE,
  total_sessions                      INTEGER     NOT NULL DEFAULT 0,
  speed_snap_high_score               INTEGER     NOT NULL DEFAULT 0,
  reading_streaks                     JSONB       NOT NULL DEFAULT '{}',  -- { "fr": 12, "de": 3 }
  last_read_dates                     JSONB       NOT NULL DEFAULT '{}',  -- { "fr": "2026-07-20" }
  freeze_dates_used                   JSONB       NOT NULL DEFAULT '{}',  -- { "fr": ["2026-07-18"] }
  full_sweep_date                     DATE,
  -- Added before friends feature launches; cheap to add now vs retrofitting after real data exists
  reading_history_visible_to_friends  BOOLEAN     NOT NULL DEFAULT true,
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Reading history ───────────────────────────────────────────────────────────
-- Append-only. One row per (user, language, date). Source of truth for streak
-- calendars and future friends comparison. time_secs is the accumulated reading
-- time for that day (maps to readingTimeSecs in the local AsyncStorage store).

CREATE TABLE IF NOT EXISTS reading_history (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lang_code   TEXT        NOT NULL,
  read_date   DATE        NOT NULL,
  time_secs   INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (user_id, lang_code, read_date)
);

CREATE INDEX IF NOT EXISTS idx_reading_history_user_lang ON reading_history (user_id, lang_code);
CREATE INDEX IF NOT EXISTS idx_reading_history_user_date ON reading_history (user_id, read_date);

-- ── Row-level security ────────────────────────────────────────────────────────

ALTER TABLE user_streaks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;

-- Users can read and write only their own rows.
-- The friends feature will add read policies for followed users when it is built.

CREATE POLICY "users_own_streak_rows" ON user_streaks
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_own_history_rows" ON reading_history
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

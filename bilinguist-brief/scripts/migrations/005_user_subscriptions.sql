-- Migration 005: user_subscriptions
--
-- One row per user. Written server-side only (RevenueCat webhook → Edge Function).
-- The app reads this row to determine entitlement; it never writes it directly.
--
-- tier:   'free' | 'premium'
-- status: 'none' | 'trial' | 'active' | 'cancelled' | 'expired' | 'paused'
--
-- revenuecat_app_user_id — RC's originalAppUserId for the customer record.
-- entitlement_id         — RC entitlement identifier (e.g. 'premium_access').
-- subscription_expires_at — when the current period ends; NULL if status is 'none'.
--
-- Wire-up checklist (when RevenueCat is integrated):
--   1. Create a RevenueCat project and configure App Store product.
--   2. Set RC webhook URL to the 'revenuecat-webhook' Edge Function URL.
--   3. Set RC_WEBHOOK_SECRET as a Supabase secret.
--   4. Update useSubscriptionStore.ts to query this table on sign-in instead of
--      hardcoding isFullAccess() = true.

CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                     TEXT NOT NULL DEFAULT 'free'
                             CHECK (tier IN ('free', 'premium')),
  status                   TEXT NOT NULL DEFAULT 'none'
                             CHECK (status IN ('none', 'trial', 'active', 'cancelled', 'expired', 'paused')),
  revenuecat_app_user_id   TEXT,
  entitlement_id           TEXT,
  trial_started_at         TIMESTAMPTZ,
  subscription_started_at  TIMESTAMPTZ,
  subscription_expires_at  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users may read only their own subscription row.
CREATE POLICY "user_subscriptions_select_own"
  ON user_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- No client-side insert or update. All writes go through the service role
-- (RevenueCat webhook Edge Function). This prevents clients from self-granting
-- premium status.

CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

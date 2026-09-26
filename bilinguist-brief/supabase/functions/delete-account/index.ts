// Supabase Edge Function: delete-account
//
// Permanently deletes the calling user's account and all associated data.
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Deletion order:
//   1. Profile photo(s) in the "avatars" Storage bucket (not covered by any
//      FK cascade — the bucket is public, so a leftover file stays reachable)
//   2. RevenueCat customer record (app user ID = Supabase user ID)
//   3. PostHog person + their events (distinct ID = Supabase user ID)
//   4. reading_history rows for this user
//   5. user_streaks row for this user
//   6. auth.users record (via admin API — cascades to user_profiles,
//      user_subscriptions, friendships, friend_invites, push_tokens)
//
// Steps 1–3 are best-effort: a provider outage must not stop the user from
// deleting their account, so a failure there is logged (with the user ID, for
// manual follow-up) and deletion carries on. The privacy policy promises
// these are removed, so check the logs for "cleanup incomplete".
//
// Setup required (one-time):
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
//   the Supabase runtime. For steps 2–3, set these secrets:
//     supabase secrets set REVENUECAT_V1_SECRET_KEY=...   (RevenueCat → API keys → secret key, v1)
//     supabase secrets set POSTHOG_PERSONAL_API_KEY=...   (PostHog → personal API key, scope person:write)
//     supabase secrets set POSTHOG_PROJECT_ID=...
//   Without them the step is skipped and logged as incomplete.
//
// Deploy: supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const REVENUECAT_V1_SECRET_KEY = Deno.env.get('REVENUECAT_V1_SECRET_KEY') ?? '';
const POSTHOG_PERSONAL_API_KEY = Deno.env.get('POSTHOG_PERSONAL_API_KEY') ?? '';
const POSTHOG_PROJECT_ID = Deno.env.get('POSTHOG_PROJECT_ID') ?? '';
// The app sends events to PostHog's EU cloud (src/services/analytics.ts).
const POSTHOG_API_HOST = Deno.env.get('POSTHOG_API_HOST') ?? 'https://eu.posthog.com';

const EXTERNAL_TIMEOUT_MS = 8000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Removes everything under avatars/{userId}/ — the app always writes
// avatars/{userId}/avatar.jpg, but list the folder in case that changes.
async function deleteAvatarFiles(adminClient: SupabaseClient, userId: string): Promise<void> {
  const bucket = adminClient.storage.from('avatars');
  const { data: files, error: listError } = await bucket.list(userId);
  if (listError) throw new Error(`list: ${listError.message}`);
  if (!files?.length) return;
  const { error: removeError } = await bucket.remove(files.map((f) => `${userId}/${f.name}`));
  if (removeError) throw new Error(`remove: ${removeError.message}`);
}

// DELETE /v1/subscribers/{app_user_id} — removes the customer and their
// transaction history from RevenueCat. It does NOT cancel an App Store
// subscription; only the user can do that in their Apple ID settings.
async function deleteRevenueCatCustomer(userId: string): Promise<void> {
  if (!REVENUECAT_V1_SECRET_KEY) throw new Error('REVENUECAT_V1_SECRET_KEY not set');
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${REVENUECAT_V1_SECRET_KEY}` },
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });
  // 404 = never subscribed / already gone — nothing to delete.
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
}

// Queues deletion of the PostHog person and all their events. PostHog
// processes this asynchronously (a 202 means accepted, not yet done).
async function deletePostHogPerson(userId: string): Promise<void> {
  if (!POSTHOG_PERSONAL_API_KEY || !POSTHOG_PROJECT_ID) throw new Error('POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID not set');
  const res = await fetch(`${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/persons/bulk_delete/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ distinct_ids: [userId], delete_events: true, delete_recordings: true }),
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Resolve the calling user from their JWT — never trust user ID from the request body.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    console.error('Failed to resolve user from token:', userError?.message);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const userId = user.id;

  // Service-role client for privileged operations (data deletion + auth.users removal).
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1–3. Best-effort cleanup outside the database cascade — see header.
  const cleanup = await Promise.allSettled([
    deleteAvatarFiles(adminClient, userId),
    deleteRevenueCatCustomer(userId),
    deletePostHogPerson(userId),
  ]);
  const failed = ['avatars', 'revenuecat', 'posthog']
    .map((name, i) => {
      const result = cleanup[i];
      return result.status === 'rejected' ? `${name} (${(result.reason as Error)?.message ?? result.reason})` : null;
    })
    .filter(Boolean);
  if (failed.length) {
    console.error(`delete-account cleanup incomplete for ${userId}: ${failed.join('; ')}`);
  }

  try {
    // 4. Delete reading history.
    const { error: historyError } = await adminClient
      .from('reading_history')
      .delete()
      .eq('user_id', userId);
    if (historyError) throw new Error(`reading_history delete: ${historyError.message}`);

    // 5. Delete streak row.
    const { error: streakError } = await adminClient
      .from('user_streaks')
      .delete()
      .eq('user_id', userId);
    if (streakError) throw new Error(`user_streaks delete: ${streakError.message}`);

    // 6. Delete the auth.users record. This requires the service role key.
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) throw new Error(`auth.admin.deleteUser: ${deleteAuthError.message}`);

    console.log(`Account deleted: ${userId}`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('delete-account error:', err);
    return new Response(JSON.stringify({ error: 'Account deletion failed' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

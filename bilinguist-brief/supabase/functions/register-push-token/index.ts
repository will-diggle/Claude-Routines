// Supabase Edge Function: register-push-token
//
// Upserts the calling user's Expo push token and, if provided, their
// notification-time preference and IANA timezone. Called on every sign-in
// and whenever the user changes their briefing notification time.
//
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Deploy: supabase functions deploy register-push-token

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing or invalid authorization header' }, 401);

  // Resolve the calling user from their JWT — never trust a user ID from the request body.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { expoPushToken?: string; platform?: string; notificationTime?: string; timezone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const expoPushToken = typeof body.expoPushToken === 'string' ? body.expoPushToken.trim() : '';
  if (!TOKEN_RE.test(expoPushToken)) return json({ error: 'Invalid expoPushToken' }, 400);

  const platform = body.platform;
  if (platform !== 'ios' && platform !== 'android') return json({ error: 'platform must be ios or android' }, 400);

  let notificationTime: string | null = null;
  if (body.notificationTime !== undefined) {
    if (typeof body.notificationTime !== 'string' || !TIME_RE.test(body.notificationTime)) {
      return json({ error: 'notificationTime must be HH:MM' }, 400);
    }
    notificationTime = body.notificationTime;
  }

  let timezone: string | null = null;
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !Intl.supportedValuesOf('timeZone').includes(body.timezone)) {
      return json({ error: 'timezone must be a valid IANA name' }, 400);
    }
    timezone = body.timezone;
  }

  // Service-role client — push_tokens has no client-side write policy, and
  // user_profiles has no client-side INSERT policy, so this needs to
  // bypass RLS.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { error: tokenError } = await adminClient
    .from('push_tokens')
    .upsert(
      { user_id: user.id, expo_push_token: expoPushToken, platform, last_seen_at: new Date().toISOString() },
      { onConflict: 'expo_push_token' },
    );
  if (tokenError) {
    console.error('register-push-token: push_tokens upsert error', tokenError);
    return json({ error: 'Failed to register push token' }, 500);
  }

  // Only write the schedule fields actually provided — a bare token
  // refresh must never clobber an already-set time/timezone.
  if (notificationTime || timezone) {
    const profileRow: Record<string, string> = { user_id: user.id };
    if (notificationTime) profileRow.notification_time = notificationTime;
    if (timezone) profileRow.notification_timezone = timezone;

    const { error: profileError } = await adminClient
      .from('user_profiles')
      .upsert(profileRow, { onConflict: 'user_id' });
    if (profileError) {
      console.error('register-push-token: user_profiles upsert error', profileError);
      return json({ error: 'Failed to update notification schedule' }, 500);
    }
  }

  return json({ ok: true });
});

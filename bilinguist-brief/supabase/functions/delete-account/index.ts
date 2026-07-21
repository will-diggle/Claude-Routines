// Supabase Edge Function: delete-account
//
// Permanently deletes the calling user's account and all associated data.
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Deletion order:
//   1. reading_history rows for this user
//   2. user_streaks row for this user
//   3. auth.users record (via admin API — triggers any downstream FK cascades)
//
// Setup required (one-time):
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
//   the Supabase runtime — no manual secret configuration needed.
//
// Deploy: supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  try {
    // 1. Delete reading history.
    const { error: historyError } = await adminClient
      .from('reading_history')
      .delete()
      .eq('user_id', userId);
    if (historyError) throw new Error(`reading_history delete: ${historyError.message}`);

    // 2. Delete streak row.
    const { error: streakError } = await adminClient
      .from('user_streaks')
      .delete()
      .eq('user_id', userId);
    if (streakError) throw new Error(`user_streaks delete: ${streakError.message}`);

    // 3. Delete the auth.users record. This requires the service role key.
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

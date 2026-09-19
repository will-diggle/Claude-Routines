// Supabase Edge Function: create-friend-invite
//
// Issues a shareable invite link. Reuses the caller's existing unexpired,
// unrevoked invite if one exists — per 007_friends.sql's own design note
// ("reuse if unexpired") — rather than minting a new token every time the
// share sheet opens. friend_invites has zero RLS policies (default-deny):
// issuance logic isn't safely expressible as row-ownership RLS, so this
// must run as service role.
//
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Deploy: supabase functions deploy create-friend-invite

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INVITE_TTL_DAYS = 7;
// Reuses the app's existing custom-scheme deep link (see useAuthDeepLink.ts
// for the sibling bilinguistbrief://auth case) — no universal/web link
// domain exists for this app, so redemption only works from inside a device
// that already has the app installed.
const DEEP_LINK_PREFIX = 'bilinguistbrief://friend-invite';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

function inviteUrl(token: string): string {
  return `${DEEP_LINK_PREFIX}/${token}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing or invalid authorization header' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Unauthorized' }, 401);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const nowIso = new Date().toISOString();
  const { data: existing, error: existingError } = await adminClient
    .from('friend_invites')
    .select('token')
    .eq('owner_id', user.id)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error('create-friend-invite: existing lookup error', existingError);
    return json({ error: 'Failed to create invite' }, 500);
  }

  if (existing) {
    return json({ token: existing.token, url: inviteUrl(existing.token) });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await adminClient
    .from('friend_invites')
    .insert({ owner_id: user.id, token, expires_at: expiresAt });

  if (insertError) {
    console.error('create-friend-invite: insert error', insertError);
    return json({ error: 'Failed to create invite' }, 500);
  }

  return json({ token, url: inviteUrl(token) });
});

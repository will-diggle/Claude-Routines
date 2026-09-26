// Supabase Edge Function: redeem-friend-invite
//
// Redeems a friend-invite token: validates it (exists, not expired/revoked,
// not the caller's own invite, not already friends/pending with the owner),
// then inserts an already-accepted friendship row directly. A service-role
// client is required for both steps — friend_invites has zero RLS policies
// (see 007_friends.sql), and inserting status='accepted' bypasses the
// client-side friendships_insert_own_request policy (pending-only), which
// is correct here since redeeming a link is already a mutual, consented
// connection — no separate accept step needed.
//
// Returns a distinct `code` on every failure path so the client can show a
// specific message rather than a generic error.
//
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Deploy: supabase functions deploy redeem-friend-invite

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

function fail(code: string, message: string, status: number) {
  return json({ error: message, code }, status);
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

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return fail('invalid_token', 'This invite link is invalid.', 400);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: invite, error: inviteError } = await adminClient
    .from('friend_invites')
    .select('owner_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (inviteError) {
    console.error('redeem-friend-invite: invite lookup error', inviteError);
    return json({ error: 'Failed to redeem invite' }, 500);
  }
  if (!invite) return fail('invalid_token', 'This invite link is invalid.', 404);
  if (invite.revoked_at || new Date(invite.expires_at as string) < new Date()) {
    return fail('expired', 'This invite link has already been used or has expired.', 410);
  }
  if (invite.owner_id === user.id) {
    return fail('self_invite', "You can't redeem your own invite link.", 400);
  }

  const { data: existingFriendship, error: friendshipError } = await adminClient
    .from('friendships')
    .select('status')
    .or(
      `and(requester_id.eq.${invite.owner_id},addressee_id.eq.${user.id}),and(requester_id.eq.${user.id},addressee_id.eq.${invite.owner_id})`,
    )
    .maybeSingle();

  if (friendshipError) {
    console.error('redeem-friend-invite: friendship lookup error', friendshipError);
    return json({ error: 'Failed to redeem invite' }, 500);
  }
  if (existingFriendship?.status === 'accepted') {
    return fail('already_friends', "You're already friends.", 409);
  }
  if (existingFriendship?.status === 'pending') {
    return fail('already_pending', 'A friend request is already pending with this user.', 409);
  }

  // Invite links are single-use: claim this one atomically before creating
  // the friendship, so a forwarded or leaked link can't be redeemed by anyone
  // else (the owner only agreed to befriend whoever they sent it to).
  // create-friend-invite issues a fresh token once this one is used.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await adminClient
    .from('friend_invites')
    .update({ revoked_at: nowIso })
    .eq('token', token)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .select('token');

  if (claimError) {
    console.error('redeem-friend-invite: claim error', claimError);
    return json({ error: 'Failed to redeem invite' }, 500);
  }
  if (!claimed?.length) {
    // Someone else redeemed it between the lookup above and this claim.
    return fail('expired', 'This invite link has already been used or has expired.', 410);
  }

  const { error: insertError } = await adminClient
    .from('friendships')
    .insert({ requester_id: invite.owner_id, addressee_id: user.id, status: 'accepted' });

  if (insertError) {
    // Give the link back — the friendship wasn't created, so it wasn't used.
    await adminClient.from('friend_invites').update({ revoked_at: null }).eq('token', token);
    console.error('redeem-friend-invite: insert error', insertError);
    // Race: a concurrent redemption/request landed between the check above and this insert.
    if ((insertError as { code?: string }).code === '23505') {
      return fail('already_friends', "You're already friends.", 409);
    }
    return json({ error: 'Failed to redeem invite' }, 500);
  }

  const { data: ownerProfile } = await adminClient
    .from('user_profiles')
    .select('username')
    .eq('user_id', invite.owner_id)
    .maybeSingle();

  return json({ ok: true, friend: { user_id: invite.owner_id, username: ownerProfile?.username ?? '' } });
});

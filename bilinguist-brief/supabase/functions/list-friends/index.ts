// Supabase Edge Function: list-friends
//
// Returns the caller's accepted friends (with their whitelisted streak
// data) plus their own pending requests split into incoming (caller is
// addressee — actionable) and outgoing (caller is requester — cancel only).
// Pending rows never include reading_streaks/active_language_codes — a
// request must be accepted before any of that is shared (see ToS §7 /
// LegalDocModal.tsx's Friends Feature section). Cross-user reads of
// user_profiles/user_streaks go through this service-role function rather
// than RLS, per 007_friends.sql's design note: RLS is row-level, not
// column-level, and would otherwise expose whole rows (terms_accepted_at,
// practice_streak, speed_snap_high_score, etc.) never promised to friends.
//
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Deploy: supabase functions deploy list-friends

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

  const { data: rows, error: friendshipsError } = await adminClient
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (friendshipsError) {
    console.error('list-friends: friendships query error', friendshipsError);
    return json({ error: 'Failed to load friends' }, 500);
  }

  const acceptedIds: string[] = [];
  const incomingIds: string[] = [];
  const outgoingIds: string[] = [];

  for (const row of rows ?? []) {
    const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
    if (row.status === 'accepted') {
      acceptedIds.push(otherId);
    } else if (row.addressee_id === user.id) {
      incomingIds.push(otherId);
    } else {
      outgoingIds.push(otherId);
    }
  }

  const allIds = [...acceptedIds, ...incomingIds, ...outgoingIds];
  const usernames = new Map<string, string>();

  if (allIds.length > 0) {
    const { data: profiles, error: profilesError } = await adminClient
      .from('user_profiles')
      .select('user_id, username')
      .in('user_id', allIds);
    if (profilesError) {
      console.error('list-friends: user_profiles query error', profilesError);
      return json({ error: 'Failed to load friends' }, 500);
    }
    for (const p of profiles ?? []) {
      if (p.username) usernames.set(p.user_id, p.username);
    }
  }

  const streaksById = new Map<string, { reading_streaks: Record<string, number>; active_language_codes: string[] }>();
  if (acceptedIds.length > 0) {
    const { data: streaks, error: streaksError } = await adminClient
      .from('user_streaks')
      .select('user_id, reading_streaks, active_language_codes')
      .in('user_id', acceptedIds);
    if (streaksError) {
      console.error('list-friends: user_streaks query error', streaksError);
      return json({ error: 'Failed to load friends' }, 500);
    }
    for (const s of streaks ?? []) {
      streaksById.set(s.user_id as string, {
        reading_streaks: (s.reading_streaks as Record<string, number>) ?? {},
        active_language_codes: (s.active_language_codes as string[]) ?? [],
      });
    }
  }

  const friends = acceptedIds.map((id) => ({
    user_id: id,
    username: usernames.get(id) ?? '',
    reading_streaks: streaksById.get(id)?.reading_streaks ?? {},
    active_language_codes: streaksById.get(id)?.active_language_codes ?? [],
  }));

  const toPending = (ids: string[]) =>
    ids.map((id) => ({ user_id: id, username: usernames.get(id) ?? '', status: 'pending' as const }));

  return json({
    friends,
    incoming: toPending(incomingIds),
    outgoing: toPending(outgoingIds),
  });
});

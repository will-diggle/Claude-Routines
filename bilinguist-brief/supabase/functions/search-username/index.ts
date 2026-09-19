// Supabase Edge Function: search-username
//
// Case-insensitive prefix search over user_profiles.username (uses the
// user_profiles_username_prefix index from 007_friends.sql), capped at 20
// results, excluding the caller. Returns only { user_id, username } — no
// email or other profile fields. This is the friends feature's only way to
// discover other users (no open browsing of all users), per the migration's
// own design note: cross-user reads go through service-role functions that
// whitelist columns in code, since RLS can't express column-level limits.
//
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Deploy: supabase functions deploy search-username

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESULT_LIMIT = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

// Escapes LIKE/ILIKE wildcards so a query containing "%" or "_" is matched
// literally instead of as a pattern.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
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

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 20) : '';
  if (!query) return json({ results: [] });

  // Service-role client — user_profiles only has a select-own RLS policy,
  // and this needs to read other users' rows (whitelisted to two columns).
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data, error } = await adminClient
    .from('user_profiles')
    .select('user_id, username')
    .not('username', 'is', null)
    .ilike('username', `${escapeLikePattern(query)}%`)
    .neq('user_id', user.id)
    .order('username', { ascending: true })
    .limit(RESULT_LIMIT);

  if (error) {
    console.error('search-username: query error', error);
    return json({ error: 'Search failed' }, 500);
  }

  return json({ results: data ?? [] });
});

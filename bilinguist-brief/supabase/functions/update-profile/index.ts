// Supabase Edge Function: update-profile
//
// Upserts the calling user's `user_profiles.display_name`. Distinct from
// record-acceptance (which also writes user_profiles, but only as a
// side-effect of stamping ToS/Privacy acceptance timestamps) — reusing that
// function for a plain profile edit would incorrectly re-stamp acceptance
// dates every time someone just changes their display name. This is the
// only writer that touches display_name in isolation.
//
// Requires a valid user JWT (verify_jwt = true in config.toml).
//
// Setup required (one-time):
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
//   the Supabase runtime — no manual secret configuration needed.
//
// Deploy: supabase functions deploy update-profile

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

  // Resolve the calling user from their JWT — never trust a user ID from the request body.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: { displayName?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : null;
  if (!displayName) {
    return new Response(JSON.stringify({ error: 'displayName is required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Service-role client — user_profiles has no client-side INSERT policy
  // (row creation is server-side only), so this needs to bypass RLS to
  // create the row on first write. onConflict upsert only ever touches the
  // display_name column here — terms/privacy acceptance columns on an
  // existing row are left untouched.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error: upsertError } = await adminClient
    .from('user_profiles')
    .upsert({ user_id: user.id, display_name: displayName }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('update-profile upsert error:', upsertError);
    return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, displayName }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

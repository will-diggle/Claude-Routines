// Supabase Edge Function: record-acceptance
//
// Called when the user agrees to the Terms of Service and Privacy Policy
// (app sign-in, website sign-up). Does two things:
//   1. Stamps user_profiles with which versions were accepted and when.
//   2. Sends a confirmation email to the user via Resend.
//
// Idempotent: if this account has already accepted exactly these versions,
// nothing changes — the original timestamp is kept and no email is sent
// (reinstalls and new devices used to re-stamp it and re-send the email).
// It never overwrites a display name the user has set; displayName is only
// used to fill an empty one.
//
// Setup required (one-time):
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxx
//
// Deploy: supabase functions deploy record-acceptance

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS = 'Bilinguist Brief <noreply@bilinguistbrief.com>';
// Version labels are short dates like "2026-09-26" — reject anything else
// so junk can't end up in the audit trail.
const VERSION_RE = /^[A-Za-z0-9._-]{1,40}$/;

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

  // Resolve caller from JWT.
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

  let body: { termsVersion?: unknown; privacyVersion?: unknown; displayName?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const termsVersion = typeof body.termsVersion === 'string' ? body.termsVersion.trim() : '';
  const privacyVersion = typeof body.privacyVersion === 'string' ? body.privacyVersion.trim() : '';
  const displayName = typeof body.displayName === 'string' && body.displayName.trim()
    ? body.displayName.trim().slice(0, 60)
    : null;

  if (!VERSION_RE.test(termsVersion) || !VERSION_RE.test(privacyVersion)) {
    return new Response(JSON.stringify({ error: 'termsVersion and privacyVersion are required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();

  const { data: existing, error: selectError } = await adminClient
    .from('user_profiles')
    .select('display_name, terms_version, privacy_version')
    .eq('user_id', user.id)
    .maybeSingle();

  if (selectError) {
    console.error('user_profiles select error:', selectError.message);
    return new Response(JSON.stringify({ error: 'Failed to record acceptance' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (existing?.terms_version === termsVersion && existing?.privacy_version === privacyVersion) {
    return new Response(JSON.stringify({ ok: true, alreadyRecorded: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const acceptance = {
    terms_accepted_at: now,
    terms_version: termsVersion,
    privacy_accepted_at: now,
    privacy_version: privacyVersion,
  };

  // The row may already exist without an acceptance (register-push-token and
  // update-profile both create it), so update when present, insert otherwise.
  // If a concurrent call created it in between (23505), fall back to update.
  const updateExisting = (fillName: boolean) => adminClient
    .from('user_profiles')
    .update({ ...acceptance, ...(fillName && displayName ? { display_name: displayName } : {}) })
    .eq('user_id', user.id);

  let { error: writeError } = existing
    ? await updateExisting(!existing.display_name)
    : await adminClient.from('user_profiles').insert({ user_id: user.id, display_name: displayName, ...acceptance });
  if (writeError?.code === '23505') {
    ({ error: writeError } = await updateExisting(false));
  }

  if (writeError) {
    console.error('user_profiles write error:', writeError.message);
    return new Response(JSON.stringify({ error: 'Failed to record acceptance' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Send confirmation email if the user has an email address and Resend is configured.
  const userEmail = user.email;
  if (userEmail && RESEND_API_KEY) {
    const emailText = [
      `Hi${(existing?.display_name || displayName) ? ` ${existing?.display_name || displayName}` : ''},`,
      '',
      'This email confirms that you agreed to the Bilinguist Brief Terms of Service',
      `(version ${termsVersion}) and Privacy Policy (version ${privacyVersion})`,
      `on ${new Date(now).toUTCString()}.`,
      '',
      'If you did not create an account or agree to these terms, please contact us at',
      'support@bilinguistbrief.com immediately.',
      '',
      '— Bilinguist Brief',
    ].join('\n');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [userEmail],
        subject: 'Your Bilinguist Brief account — terms accepted',
        text: emailText,
      }),
    });

    if (!resendRes.ok) {
      // Log but don't fail the request — acceptance is recorded in the DB.
      console.error(`Resend error ${resendRes.status}`);
    }
  } else if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — acceptance recorded but confirmation email not sent');
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

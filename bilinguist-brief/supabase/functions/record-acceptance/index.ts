// Supabase Edge Function: record-acceptance
//
// Called once during sign-up (or re-prompt) when the user agrees to the
// Terms of Service and Privacy Policy. Does two things atomically:
//   1. Upserts a user_profiles row stamping which versions were accepted and when.
//   2. Sends a confirmation email to the user via Resend.
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

  const body = await req.json() as {
    termsVersion?: string;
    privacyVersion?: string;
    displayName?: string;
  };

  if (!body.termsVersion || !body.privacyVersion) {
    return new Response(JSON.stringify({ error: 'termsVersion and privacyVersion are required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();

  // Upsert profile — creates on first acceptance, updates on re-acceptance.
  const { error: upsertError } = await adminClient
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        display_name: body.displayName ?? null,
        terms_accepted_at: now,
        terms_version: body.termsVersion,
        privacy_accepted_at: now,
        privacy_version: body.privacyVersion,
      },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    console.error('user_profiles upsert error:', upsertError.message);
    return new Response(JSON.stringify({ error: 'Failed to record acceptance' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Send confirmation email if the user has an email address and Resend is configured.
  const userEmail = user.email;
  if (userEmail && RESEND_API_KEY) {
    const emailText = [
      `Hi${body.displayName ? ` ${body.displayName}` : ''},`,
      '',
      'This email confirms that you agreed to the Bilinguist Brief Terms of Service',
      `(version ${body.termsVersion}) and Privacy Policy (version ${body.privacyVersion})`,
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
      const body = await resendRes.text();
      console.error(`Resend error ${resendRes.status}:`, body);
    }
  } else if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — acceptance recorded but confirmation email not sent');
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

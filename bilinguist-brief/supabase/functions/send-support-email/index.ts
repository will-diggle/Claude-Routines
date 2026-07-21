// Supabase Edge Function: send-support-email
//
// Receives a support form submission from the app and sends it to
// support@bilinguistbrief.com via Resend (https://resend.com).
//
// Setup required (one-time):
//   1. Create a Resend account and verify bilinguistbrief.com as a sending domain.
//   2. Generate a Resend API key.
//   3. Run: supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxx
//   4. Deploy: supabase functions deploy send-support-email
//
// The function will return HTTP 500 until RESEND_API_KEY is set.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPPORT_EMAIL = 'support@bilinguistbrief.com';
const FROM_ADDRESS = 'Bilinguist Brief <noreply@bilinguistbrief.com>';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { subject, message, email, appVersion, platform } = await req.json() as {
      subject?: string;
      message?: string;
      email?: string;
      appVersion?: string;
      platform?: string;
    };

    if (!subject?.trim() || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'subject and message are required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const emailText = [
      `From: ${email || 'Anonymous user (not signed in)'}`,
      `App version: ${appVersion || 'unknown'}`,
      `Platform: ${platform || 'unknown'}`,
      '',
      '---',
      '',
      message.trim(),
    ].join('\n');

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set — run: supabase secrets set RESEND_API_KEY=re_...');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 503,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [SUPPORT_EMAIL],
        // reply_to lets support staff reply directly to the user's email
        ...(email ? { reply_to: email } : {}),
        subject: `[Support] ${subject.trim()}`,
        text: emailText,
      }),
    });

    if (!resendRes.ok) {
      const body = await resendRes.text();
      console.error(`Resend API error ${resendRes.status}:`, body);
      throw new Error(`Resend ${resendRes.status}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-support-email error:', err);
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

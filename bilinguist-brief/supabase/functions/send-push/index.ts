// Supabase Edge Function: send-push
//
// General-purpose push send — breaking news, re-engagement, anything
// beyond the morning digest. Not a client-facing function: invoked via
// `supabase functions invoke send-push` (authenticates with the
// service-role key).
//
// verify_jwt is false (see supabase/config.toml) because the caller isn't
// presenting an end-user session — so, same as revenuecat-webhook, this
// function must check the caller itself rather than trust the gateway.
// Previously it didn't: the comment above used to claim "only whoever
// holds the service-role key can call this" without ever checking the
// Authorization header, so the function was reachable by anyone with the
// public URL. Now it actually requires the service-role key.
//
// Body: { userIds?: string[]; all?: boolean; title: string; body: string; data?: object }
// Exactly one of userIds or all: true is required.
//
// Deploy: supabase functions deploy send-push

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPushBatch, type ExpoPushMessage } from '../_shared/expoPush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set — send-push rejected until configured');
    return json({ error: 'Server misconfigured' }, 500);
  }
  const authHeader = req.headers.get('Authorization') ?? '';
  const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (presented !== SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('send-push: rejected — Authorization did not match the service-role key');
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { userIds?: string[]; all?: boolean; title?: string; body?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!title || !messageBody) return json({ error: 'title and body are required' }, 400);

  const userIds = Array.isArray(body.userIds) ? body.userIds.filter((id) => typeof id === 'string') : null;
  if (!userIds?.length && !body.all) return json({ error: 'Provide userIds or all: true' }, 400);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let query = adminClient.from('push_tokens').select('expo_push_token');
  if (!body.all && userIds) query = query.in('user_id', userIds);
  const { data: tokenRows, error } = await query;

  if (error) {
    console.error('send-push: token lookup error', error);
    return json({ error: 'token lookup failed' }, 500);
  }
  if (!tokenRows?.length) return json({ sent: 0, pruned: 0 });

  const messages: ExpoPushMessage[] = tokenRows.map((row) => ({
    to: row.expo_push_token,
    title,
    body: messageBody,
    data: body.data,
    sound: 'default',
  }));

  const result = await sendExpoPushBatch(messages, adminClient);
  return json(result);
});

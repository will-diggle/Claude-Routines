// Supabase Edge Function: send-morning-notifications
//
// Triggered every 15 minutes by a pg_cron job (see scripts/migrations/
// 008_push_notifications.sql for the claim_due_notification_users() it
// calls, and the operational pg_cron.schedule() setup done via the SQL
// editor — not part of this file). Finds every user whose local
// notification time just arrived, fetches today's bundle once, and sends
// each of them their real daily_notification text via Expo push.
//
// Not a user-facing function — invoked with the service-role key as its
// own bearer token (itself a valid signed JWT), so verify_jwt = true in
// config.toml is sufficient with no custom secret scheme.
//
// Setup required (one-time, outside this file):
//   - DATA_WORKER_URL secret: supabase secrets set DATA_WORKER_URL=https://bilinguist-brief.williamdiggz.workers.dev
//   - pg_cron + pg_net extensions enabled, and the cron.schedule(...) call
//     made, via the Supabase SQL editor.
//
// Deploy: supabase functions deploy send-morning-notifications

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPushBatch, type ExpoPushMessage } from '../_shared/expoPush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DATA_WORKER_URL = (Deno.env.get('DATA_WORKER_URL') ?? '').replace(/\/+$/, '');

interface DailyBundle {
  date: string;
  daily_notification?: string;
}

serve(async (_req) => {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: claimed, error: claimError } = await adminClient.rpc('claim_due_notification_users', { window_minutes: 15 });
  if (claimError) {
    console.error('send-morning-notifications: claim error', claimError);
    return new Response(JSON.stringify({ error: 'claim failed' }), { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return new Response(JSON.stringify({ claimed: 0, sent: 0 }), { status: 200 });
  }

  if (!DATA_WORKER_URL) {
    console.error('send-morning-notifications: DATA_WORKER_URL secret not set');
    return new Response(JSON.stringify({ error: 'DATA_WORKER_URL not configured' }), { status: 500 });
  }

  let bundle: DailyBundle | null = null;
  try {
    const res = await fetch(`${DATA_WORKER_URL}/latest?t=${Date.now()}`);
    if (res.ok) bundle = await res.json();
  } catch (e) {
    console.error('send-morning-notifications: bundle fetch failed', e);
  }

  if (!bundle?.daily_notification) {
    // Nothing to send today — the claimed rows stay claimed (see migration
    // comment: a missed day is preferable to a duplicate/retry storm).
    return new Response(JSON.stringify({ claimed: claimed.length, sent: 0, reason: 'no bundle content' }), { status: 200 });
  }

  const dueUserIds = (claimed as Array<{ user_id: string; local_date: string }>)
    .filter((row) => row.local_date === bundle!.date)
    .map((row) => row.user_id);

  if (dueUserIds.length === 0) {
    return new Response(JSON.stringify({ claimed: claimed.length, sent: 0, reason: 'bundle not ready for any claimed local date' }), { status: 200 });
  }

  const { data: tokenRows, error: tokenError } = await adminClient
    .from('push_tokens')
    .select('expo_push_token')
    .in('user_id', dueUserIds);

  if (tokenError) {
    console.error('send-morning-notifications: token lookup error', tokenError);
    return new Response(JSON.stringify({ error: 'token lookup failed' }), { status: 500 });
  }

  const messages: ExpoPushMessage[] = (tokenRows ?? []).map((row) => ({
    to: row.expo_push_token,
    title: 'Bilinguist Brief ☀️',
    body: bundle!.daily_notification!,
    data: { screen: 'Briefing' },
    badge: 1,
    sound: 'default',
  }));

  const result = await sendExpoPushBatch(messages, adminClient);

  return new Response(JSON.stringify({ claimed: claimed.length, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Supabase Edge Function: revenuecat-webhook
//
// Receives purchase/renewal/cancellation events from RevenueCat and writes
// the current subscription state to user_subscriptions.
//
// RevenueCat sends a shared secret in the Authorization header.
// Validate it before processing any event.
//
// Setup required (when RevenueCat integration is live):
//   1. In RevenueCat dashboard → Project → Integrations → Webhooks:
//      - URL: https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
//      - Set a shared secret and copy it.
//   2. supabase secrets set RC_WEBHOOK_SECRET=<shared-secret>
//   3. supabase functions deploy revenuecat-webhook
//
// RevenueCat event types handled:
//   INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE → status=active, tier=premium
//   CANCELLATION                              → status=cancelled
//   EXPIRATION                               → status=expired, tier=free
//   BILLING_ISSUE                            → status=paused (grace period)
//   TRIAL_STARTED                            → status=trial
//   TRIAL_CONVERTED                          → status=active
//   TRIAL_CANCELLED                          → status=cancelled
//
// The app_user_id field in RevenueCat must be set to the Supabase user UUID
// when the purchase is initiated (call Purchases.logIn(supabaseUserId)).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RC_WEBHOOK_SECRET = Deno.env.get('RC_WEBHOOK_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maps RevenueCat event types to subscription state.
function resolveState(eventType: string): { tier: string; status: string } | null {
  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'TRIAL_CONVERTED':
      return { tier: 'premium', status: 'active' };
    case 'TRIAL_STARTED':
      return { tier: 'premium', status: 'trial' };
    case 'CANCELLATION':
    case 'TRIAL_CANCELLED':
      return { tier: 'premium', status: 'cancelled' };
    case 'EXPIRATION':
      return { tier: 'free', status: 'expired' };
    case 'BILLING_ISSUE':
      return { tier: 'premium', status: 'paused' };
    default:
      return null; // Unhandled event — log and ignore.
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Validate the shared secret. Without this anyone could write to user_subscriptions.
  if (!RC_WEBHOOK_SECRET) {
    console.error('RC_WEBHOOK_SECRET is not set — webhook rejected until configured');
    return new Response('Webhook not configured', { status: 503 });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== RC_WEBHOOK_SECRET) {
    console.warn('Rejected webhook — invalid Authorization header');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const event = payload['event'] as Record<string, unknown> | undefined;
  const eventType = event?.['type'] as string | undefined;
  const appUserId = event?.['app_user_id'] as string | undefined;
  const rcAppUserId = event?.['original_app_user_id'] as string | undefined;
  const entitlementId = (event?.['entitlement_ids'] as string[] | undefined)?.[0];
  const expiresAt = event?.['expiration_at_ms']
    ? new Date(event['expiration_at_ms'] as number).toISOString()
    : null;
  const purchasedAt = event?.['purchased_at_ms']
    ? new Date(event['purchased_at_ms'] as number).toISOString()
    : null;

  if (!eventType || !appUserId) {
    console.warn('Webhook missing event.type or app_user_id:', JSON.stringify(payload));
    return new Response('Missing required fields', { status: 400 });
  }

  const state = resolveState(eventType);
  if (!state) {
    // Acknowledged but not acted on — RC expects 200 for unhandled events.
    console.log(`Unhandled RC event type: ${eventType}`);
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await adminClient
    .from('user_subscriptions')
    .upsert(
      {
        user_id: appUserId,
        tier: state.tier,
        status: state.status,
        revenuecat_app_user_id: rcAppUserId ?? appUserId,
        entitlement_id: entitlementId ?? null,
        subscription_started_at: purchasedAt,
        subscription_expires_at: expiresAt,
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error(`user_subscriptions upsert error for ${appUserId}:`, error.message);
    return new Response('Database error', { status: 500 });
  }

  console.log(`RC event ${eventType} processed for user ${appUserId}: ${state.tier}/${state.status}`);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

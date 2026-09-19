// Shared helper for sending batches of Expo push notifications and pruning
// dead tokens from the per-send results. Not deployed as its own function —
// imported by send-morning-notifications and send-push.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Sends every message, then prunes any token Expo reports as permanently
// dead (DeviceNotRegistered, InvalidCredentials) from push_tokens — this is
// a token-hygiene step, not fire-and-forget.
export async function sendExpoPushBatch(
  messages: ExpoPushMessage[],
  adminClient: SupabaseClient,
): Promise<{ sent: number; pruned: number }> {
  let sent = 0;
  let pruned = 0;

  for (const batch of chunk(messages, CHUNK_SIZE)) {
    let tickets: ExpoPushTicket[];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      const json = await res.json();
      tickets = json.data ?? [];
    } catch (e) {
      console.error('sendExpoPushBatch: request failed', e);
      continue;
    }

    const tokensToPrune: string[] = [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'ok') {
        sent++;
      } else {
        const permanent = ticket.details?.error === 'DeviceNotRegistered'
          || ticket.details?.error === 'InvalidCredentials';
        if (permanent) tokensToPrune.push(batch[i].to);
        console.warn('sendExpoPushBatch: ticket error', ticket);
      }
    });

    if (tokensToPrune.length > 0) {
      const { error } = await adminClient.from('push_tokens').delete().in('expo_push_token', tokensToPrune);
      if (!error) pruned += tokensToPrune.length;
    }
  }

  return { sent, pruned };
}

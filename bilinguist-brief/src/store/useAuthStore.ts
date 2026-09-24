import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { identifyUser, resetIdentity } from '../services/analytics';
import { loginPurchasesUser, logoutPurchasesUser } from '../services/purchases';
import { syncPushRegistration } from '../services/pushRegistration';
import { useSubscriptionStore } from './useSubscriptionStore';
import type { Session } from '@supabase/supabase-js';

// Bumped whenever the legal draft's substance materially changes — see
// scripts/legal-draft-privacy-terms.md. Recorded (with a timestamp) against
// every session so there's an actual audit trail of what a user agreed to,
// rather than nothing at all — record-acceptance existed but nothing called it.
const TERMS_VERSION = '2026-09-17';
const PRIVACY_VERSION = '2026-09-19';

// Fire-and-forget — must never block sign-in on a network call, and a failure
// here (offline, function cold-start) shouldn't surface as a sign-in error.
// Resolves true only on a real 2xx response, so the caller can gate the
// locally-persisted "already recorded" flag on actual success, not just on
// having attempted the call.
function recordLegalAcceptance(session: Session): Promise<boolean> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !session.access_token) return Promise.resolve(false);
  return fetch(`${supabaseUrl}/functions/v1/record-acceptance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      displayName: sessionDisplayName(session),
    }),
  }).then((res) => res.ok).catch(() => false);
}

function generateAnonymousId(): string {
  return 'anon-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface AuthStore {
  session: Session | null;
  anonymousId: string;
  // Per-user-id record of the (terms, privacy) version pair last
  // successfully recorded on THIS device — gates recordLegalAcceptance so
  // it only fires on a genuine new acceptance (new sign-in, or a version
  // bump), not on every token refresh / app relaunch, which previously
  // re-stamped the audit timestamp to "now" every time and likely
  // re-sent the acceptance confirmation email on every app open.
  acceptedLegalVersions: Record<string, { terms: string; privacy: string }>;
  setSession: (session: Session | null) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      session: null,
      anonymousId: generateAnonymousId(),
      acceptedLegalVersions: {},

      setSession: (session) => {
        set({ session });
        if (session?.user) {
          identifyUser(session.user.id, {
            email: session.user.email,
            name: sessionDisplayName(session),
          });
          loginPurchasesUser(session.user.id).then((info) => {
            useSubscriptionStore.getState().syncFromCustomerInfo(info);
          });
          const userId = session.user.id;
          const recorded = get().acceptedLegalVersions[userId];
          if (recorded?.terms !== TERMS_VERSION || recorded?.privacy !== PRIVACY_VERSION) {
            recordLegalAcceptance(session).then((ok) => {
              if (!ok) return;
              set((s) => ({
                acceptedLegalVersions: {
                  ...s.acceptedLegalVersions,
                  [userId]: { terms: TERMS_VERSION, privacy: PRIVACY_VERSION },
                },
              }));
            });
          }
          syncPushRegistration(session);
        } else {
          resetIdentity();
        }
      },

      signOut: async () => {
        if (supabase) await supabase.auth.signOut().catch(() => {});
        set({ session: null });
        resetIdentity();
        logoutPurchasesUser();
      },

      refresh: async () => {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        set({ session: data.session });
      },
    }),
    {
      name: 'bilinguist-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ session: s.session, anonymousId: s.anonymousId, acceptedLegalVersions: s.acceptedLegalVersions }),
    }
  )
);

// Derive display name from a session object
export function sessionDisplayName(session: Session | null): string | null {
  const meta = session?.user?.user_metadata;
  if (!meta) return null;
  return (meta.full_name ?? meta.name ?? null) as string | null;
}

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import type { Session } from '@supabase/supabase-js';

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
  setSession: (session: Session | null) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      session: null,
      anonymousId: generateAnonymousId(),

      setSession: (session) => set({ session }),

      signOut: async () => {
        if (supabase) await supabase.auth.signOut().catch(() => {});
        set({ session: null });
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
      partialize: (s) => ({ session: s.session, anonymousId: s.anonymousId }),
    }
  )
);

// Derive display name from a session object
export function sessionDisplayName(session: Session | null): string | null {
  const meta = session?.user?.user_metadata;
  if (!meta) return null;
  return (meta.full_name ?? meta.name ?? null) as string | null;
}

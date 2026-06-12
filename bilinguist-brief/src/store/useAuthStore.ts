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
  // null = anonymous (using anonymousId), Session = signed in
  session: Session | null;
  anonymousId: string;
  // Convenience getters
  userId: string;        // session user id or anonymousId
  displayName: string | null;
  email: string | null;
  isSignedIn: boolean;

  // Actions
  setSession: (session: Session | null) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      session: null,
      anonymousId: generateAnonymousId(),

      get userId() {
        const s = get().session;
        return s?.user?.id ?? get().anonymousId;
      },
      get displayName() {
        const s = get().session;
        if (!s) return null;
        const meta = s.user?.user_metadata;
        if (meta?.full_name) return meta.full_name as string;
        if (meta?.name) return meta.name as string;
        return null;
      },
      get email() {
        return get().session?.user?.email ?? null;
      },
      get isSignedIn() {
        return !!get().session;
      },

      setSession: (session) => set({ session }),

      signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null });
      },

      refresh: async () => {
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

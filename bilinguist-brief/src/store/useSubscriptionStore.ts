import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SubscriptionStatus = 'free' | 'active' | 'promo' | 'dev';

// Add codes here to grant full access. Share freely with testers.
const PROMO_CODES: Record<string, string> = {
  EARLYBIRD: 'Early Bird',
  FOUNDER: 'Founder',
  BILINGUIST: 'Bilinguist',
};

interface SubscriptionStore {
  status: SubscriptionStatus;
  promoLabel: string | null;
  isFullAccess: () => boolean;
  applyPromoCode: (code: string) => 'success' | 'invalid' | 'already_active';
  activateRevenueCat: () => void;
  setDev: (enabled: boolean) => void;
  restore: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      status: 'promo',
      promoLabel: null,

      isFullAccess: () => true,

      applyPromoCode: (raw) => {
        const code = raw.trim().toUpperCase();
        const label = PROMO_CODES[code];
        if (!label) return 'invalid';
        if (get().isFullAccess()) return 'already_active';
        set({ status: 'promo', promoLabel: label });
        return 'success';
      },

      activateRevenueCat: () => set({ status: 'active', promoLabel: null }),

      setDev: (enabled) =>
        set({ status: enabled ? 'dev' : 'free', promoLabel: enabled ? 'Developer' : null }),

      restore: () => {
        // RevenueCat restore flow — stub for now
        // In Stage 5 production: call Purchases.restorePurchases()
      },
    }),
    {
      name: 'bilinguist-subscription',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import {
  fetchCustomerInfo,
  fetchPackages,
  purchasePackage as purchasePackageSDK,
  restorePurchases as restorePurchasesSDK,
  hasProEntitlement,
  addCustomerInfoListener,
  isPurchasesConfigured,
} from '../services/purchases';

export type SubscriptionStatus = 'free' | 'active' | 'promo';

// Add codes here to grant full access. Share freely with testers.
// NOTE: this is a client-side-only check — the codes are visible to anyone
// who inspects the app bundle. Fine for early testers/friends, not a real
// access-control mechanism. For a real promo, use a RevenueCat promotional
// entitlement or an Apple offer code instead (granted server-side).
const PROMO_CODES: Record<string, string> = {
  EARLYBIRD: 'Early Bird',
  FOUNDER: 'Founder',
  BILINGUIST: 'Bilinguist',
};

interface SubscriptionStore {
  status: SubscriptionStatus;
  promoLabel: string | null;
  packages: PurchasesPackage[];
  purchaseInProgress: boolean;

  isFullAccess: () => boolean;
  applyPromoCode: (code: string) => 'success' | 'invalid' | 'already_active';

  /** Pull the current offering's packages from RevenueCat for the paywall
   *  to render real prices — call when the paywall opens. */
  loadPackages: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<'success' | 'cancelled' | 'error'>;
  restore: () => Promise<'success' | 'no_purchases' | 'error'>;
  /** Re-check RevenueCat's view of the customer and sync `status`. Also
   *  called automatically by the live listener set up in App.tsx. */
  refreshEntitlement: () => Promise<void>;
  syncFromCustomerInfo: (info: CustomerInfo | null) => void;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      status: 'free',
      promoLabel: null,
      packages: [],
      purchaseInProgress: false,

      isFullAccess: () => get().status !== 'free',

      applyPromoCode: (raw) => {
        const code = raw.trim().toUpperCase();
        const label = PROMO_CODES[code];
        if (!label) return 'invalid';
        if (get().isFullAccess()) return 'already_active';
        set({ status: 'promo', promoLabel: label });
        return 'success';
      },

      loadPackages: async () => {
        const packages = await fetchPackages();
        set({ packages });
      },

      purchase: async (pkg) => {
        set({ purchaseInProgress: true });
        try {
          const result = await purchasePackageSDK(pkg);
          if (result.ok) {
            get().syncFromCustomerInfo(result.info);
            return 'success';
          }
          return result.userCancelled ? 'cancelled' : 'error';
        } finally {
          set({ purchaseInProgress: false });
        }
      },

      restore: async () => {
        const info = await restorePurchasesSDK();
        if (!info) return 'error';
        const wasFullAccess = get().isFullAccess();
        get().syncFromCustomerInfo(info);
        return hasProEntitlement(info) || wasFullAccess ? 'success' : 'no_purchases';
      },

      refreshEntitlement: async () => {
        if (!isPurchasesConfigured()) return;
        const info = await fetchCustomerInfo();
        get().syncFromCustomerInfo(info);
      },

      syncFromCustomerInfo: (info) => {
        if (hasProEntitlement(info)) {
          set({ status: 'active', promoLabel: null });
        } else if (get().status === 'active') {
          // Entitlement lapsed (cancelled/refunded/expired) — drop back to
          // free unless a promo code separately granted access.
          set({ status: 'free' });
        }
      },
    }),
    {
      name: 'bilinguist-subscription',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ status: s.status, promoLabel: s.promoLabel }),
    }
  )
);

/** Wire once at app startup (see App.tsx) so entitlement changes from
 *  anywhere — a purchase, a renewal, a refund, a cross-device restore —
 *  update the store live without polling. */
export function startSubscriptionSync(): () => void {
  return addCustomerInfoListener((info) => {
    useSubscriptionStore.getState().syncFromCustomerInfo(info);
  });
}

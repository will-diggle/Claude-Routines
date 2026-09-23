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

// ── Freemium limits ──────────────────────────────────────────────────────
// English is always included free; a free user may additionally have this
// many non-English languages active at once.
export const FREE_MAX_LANGUAGES = 1;
// How long a free user must wait before changing their one non-English
// language again — stops "switch to read everything". Level is not
// cooldown-gated (see setLanguageLevel in useSettingsStore.ts) — free
// users can adjust their level in the brief any time.
export const FREE_SWITCH_COOLDOWN_DAYS = 1;
// Genres available without a subscription; the rest (Business, UK/US/Europe)
// are premium. Weather is a utility strip, not an "article" — it's rendered
// separately in LanguageBriefingSection and isn't subject to this list at all.
export const FREE_TOPICS = new Set(['weather', 'worldNews']);
// Within Global News, a free user sees this many articles in full each day —
// the rest render blurred (see BriefingArticle's `locked` prop). The pipeline
// normally writes 3 Global News articles/day, so this trims exactly one.
export const FREE_WORLDNEWS_ARTICLE_LIMIT = 2;
export const FREE_READ_LENGTH = 'short';
export const FREE_GAME_KEY = 'Flashcards';
export const FREE_FLASHCARD_DAILY_LIMIT = 4;

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

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

  // ── Freemium gating ──────────────────────────────────────────────────
  /** Timestamp of the last time a free user changed their one active
   *  non-English language or its level. Null = never changed yet. */
  freeSlotChangedAt: string | null;
  canChangeFreeSlot: () => boolean;
  daysUntilFreeSlotChange: () => number;
  recordFreeSlotChange: () => void;

  /** Flashcard rounds started today, keyed by date, for free users. */
  flashcardPlaysByDay: Record<string, number>;
  canPlayFlashcardsToday: () => boolean;
  flashcardPlaysRemainingToday: () => number;
  recordFlashcardPlay: () => void;

  // ── Global paywall trigger — any screen can call showPaywall() rather
  // than owning its own Modal + local state. Rendered once at the App root.
  paywallVisible: boolean;
  showPaywall: () => void;
  hidePaywall: () => void;
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

      freeSlotChangedAt: null,

      canChangeFreeSlot: () => {
        const last = get().freeSlotChangedAt;
        if (!last) return true;
        const elapsedDays = (Date.now() - new Date(last).getTime()) / 86_400_000;
        return elapsedDays >= FREE_SWITCH_COOLDOWN_DAYS;
      },

      daysUntilFreeSlotChange: () => {
        const last = get().freeSlotChangedAt;
        if (!last) return 0;
        const elapsedDays = (Date.now() - new Date(last).getTime()) / 86_400_000;
        return Math.max(0, Math.ceil(FREE_SWITCH_COOLDOWN_DAYS - elapsedDays));
      },

      recordFreeSlotChange: () => set({ freeSlotChangedAt: new Date().toISOString() }),

      flashcardPlaysByDay: {},

      canPlayFlashcardsToday: () => {
        if (get().isFullAccess()) return true;
        return (get().flashcardPlaysByDay[todayKey()] ?? 0) < FREE_FLASHCARD_DAILY_LIMIT;
      },

      flashcardPlaysRemainingToday: () => {
        if (get().isFullAccess()) return Infinity;
        return Math.max(0, FREE_FLASHCARD_DAILY_LIMIT - (get().flashcardPlaysByDay[todayKey()] ?? 0));
      },

      recordFlashcardPlay: () => {
        if (get().isFullAccess()) return;
        const key = todayKey();
        set({
          flashcardPlaysByDay: {
            ...get().flashcardPlaysByDay,
            [key]: (get().flashcardPlaysByDay[key] ?? 0) + 1,
          },
        });
      },

      paywallVisible: false,
      showPaywall: () => set({ paywallVisible: true }),
      hidePaywall: () => set({ paywallVisible: false }),
    }),
    {
      name: 'bilinguist-subscription',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        status: s.status,
        promoLabel: s.promoLabel,
        freeSlotChangedAt: s.freeSlotChangedAt,
        flashcardPlaysByDay: s.flashcardPlaysByDay,
      }),
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

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeneratedBriefing, ArticleLength } from '../services/anthropic';
import { fetchWeather, type WeatherData } from '../services/weather';
import { getMockBriefing } from '../data/mockBriefings';
import { fetchTodayBundle, applyBundleToCache, clearPreviousDaysBriefings } from '../services/briefingSync';
import type { LanguageCode, LanguageLevel } from './useSettingsStore';
import { useSettingsStore } from './useSettingsStore';

// Briefings are generated server-side at 04:30 UTC and delivered via the
// Cloudflare Worker. The app never calls Anthropic directly — no API key
// is stored in or shipped with the app.

function cacheKey(date: string, language: LanguageCode, level: LanguageLevel, length: ArticleLength): string {
  return `briefing_${date}_${language}_${level}_${length}`;
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

const NOT_READY_MESSAGE =
  "Today's briefing isn't ready yet — check back shortly after 06:30.";

interface BriefingStore {
  briefings: Partial<Record<LanguageCode, GeneratedBriefing>>;
  generatingFor: LanguageCode[];
  errorsFor: Partial<Record<LanguageCode, string>>;
  weather: WeatherData | null;
  weatherByLang: Partial<Record<LanguageCode, WeatherData>>;
  isLoadingWeather: boolean;
  isSyncing: boolean;
  syncMessage: string | null;
  bundleReceivedAt: number | null;

  syncFromServer: () => Promise<void>;
  loadBriefing: (
    language: LanguageCode,
    level: LanguageLevel,
    length: ArticleLength,
    forceRefresh?: boolean
  ) => Promise<void>;

  loadWeather: (language: LanguageCode) => Promise<void>;
  clearError: (language: LanguageCode) => void;
}

export const useBriefingStore = create<BriefingStore>()(
  persist(
    (set, get) => ({
      briefings: {},
      generatingFor: [],
      errorsFor: {},
      weather: null,
      weatherByLang: {},
      isLoadingWeather: false,
      isSyncing: false,
      syncMessage: null,
      bundleReceivedAt: null,

      syncFromServer: async () => {
        set({ isSyncing: true, syncMessage: "Fetching today's brief…" });
        try {
          const bundle = await fetchTodayBundle();
          if (!bundle) return;

          set({ syncMessage: 'Applying…' });
          await applyBundleToCache(bundle);
          await clearPreviousDaysBriefings(bundle.date);

          const receivedAt = Date.now();
          const settings = useSettingsStore.getState();
          const updates: Partial<Record<LanguageCode, GeneratedBriefing>> = {};
          const clearedErrors: Partial<Record<LanguageCode, undefined>> = {};

          for (const lang of settings.languages.filter((l) => l.active)) {
            const level = lang.level ?? 'B1';
            const length: ArticleLength =
              level === 'A1' || level === 'A2' ? 'short' : settings.readLength;
            const briefing = bundle.briefings[lang.code]?.[level]?.[length];
            if (briefing) {
              updates[lang.code as LanguageCode] = briefing;
              clearedErrors[lang.code as LanguageCode] = undefined;
            }
          }

          set((s) => ({
            briefings: { ...s.briefings, ...updates },
            // Clear spinner and error for any language that now has content
            generatingFor: s.generatingFor.filter((l) => !(l in updates)),
            errorsFor: { ...s.errorsFor, ...clearedErrors },
            bundleReceivedAt: receivedAt,
          }));
        } finally {
          set({ isSyncing: false, syncMessage: null });
        }
      },

      loadWeather: async (language) => {
        set({ isLoadingWeather: true });
        const weatherData = await fetchWeather(language);
        set((s) => ({
          weather: weatherData,
          weatherByLang: { ...s.weatherByLang, [language]: weatherData ?? undefined },
          isLoadingWeather: false,
        }));
      },

      loadBriefing: async (language, level, length, forceRefresh = false) => {
        const today = todayString();
        const key = cacheKey(today, language, level, length);

        // ── 1. In-memory cache hit ───────────────────────────────────────────
        if (!forceRefresh) {
          const cached = get().briefings[language];
          if (
            cached &&
            cached.date === today &&
            cached.language === language &&
            cached.level === level &&
            cached.length === length
          ) {
            return;
          }

          // ── 2. AsyncStorage cache hit ──────────────────────────────────────
          try {
            const stored = await AsyncStorage.getItem(key);
            if (stored) {
              const parsed: GeneratedBriefing = JSON.parse(stored);
              set((s) => ({
                briefings: { ...s.briefings, [language]: parsed },
                errorsFor: { ...s.errorsFor, [language]: undefined },
              }));
              return;
            }
          } catch {
            // Cache miss — fall through
          }
        }

        // ── 3. Developer mock mode ───────────────────────────────────────────
        if (useSettingsStore.getState().developerMode) {
          const mock = getMockBriefing(language, level, length);
          set((s) => ({
            briefings: { ...s.briefings, [language]: mock },
            errorsFor: { ...s.errorsFor, [language]: undefined },
          }));
          return;
        }

        // ── 4. No cache — show spinner while server sync is in progress ───────
        // syncFromServer runs concurrently; when it finishes it will update
        // briefings and clear generatingFor. If sync finishes with nothing,
        // the finally block sets isSyncing:false and we show NOT_READY_MESSAGE.
        if (get().isSyncing) {
          set((s) => ({
            generatingFor: s.generatingFor.includes(language)
              ? s.generatingFor
              : [...s.generatingFor, language],
            errorsFor: { ...s.errorsFor, [language]: undefined },
          }));

          // Wait for sync to finish then check again
          await new Promise<void>((resolve) => {
            const unsub = useBriefingStore.subscribe((state) => {
              if (!state.isSyncing) {
                unsub();
                resolve();
              }
            });
          });

          // If sync populated this language, we're done
          const afterSync = get().briefings[language];
          if (afterSync && afterSync.date === today) {
            set((s) => ({
              generatingFor: s.generatingFor.filter((l) => l !== language),
            }));
            return;
          }
        }

        // ── 5. Sync done, still nothing — show friendly not-ready message ────
        set((s) => ({
          generatingFor: s.generatingFor.filter((l) => l !== language),
          errorsFor: { ...s.errorsFor, [language]: NOT_READY_MESSAGE },
        }));
      },

      clearError: (language) =>
        set((s) => ({ errorsFor: { ...s.errorsFor, [language]: undefined } })),
    }),
    {
      name: 'bilinguist-briefing-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        briefings: state.briefings,
        weather: state.weather,
        weatherByLang: state.weatherByLang,
        bundleReceivedAt: state.bundleReceivedAt,
      }),
    }
  )
);

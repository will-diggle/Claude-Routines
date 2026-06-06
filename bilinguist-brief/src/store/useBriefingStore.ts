import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import type { GeneratedBriefing, ArticleLength } from '../services/anthropic';
import { fetchWeather, type WeatherData } from '../services/weather';
import { getMockBriefing } from '../data/mockBriefings';
import { fetchTodayBundle, applyBundleToCache, clearPreviousDaysBriefings, type BundleFetchResult } from '../services/briefingSync';
import type { LanguageCode, LanguageLevel } from './useSettingsStore';
import { useSettingsStore } from './useSettingsStore';

// Cached user GPS coords for the session — undefined = not yet fetched, null = denied/failed
let _userCoords: { latitude: number; longitude: number; cityName?: string } | null | undefined = undefined;

// Briefings are generated server-side at 04:30 UTC and delivered via the
// Cloudflare Worker. The app never calls Anthropic directly — no API key
// is stored in or shipped with the app.

function cacheKey(date: string, language: LanguageCode, level: LanguageLevel, length: ArticleLength): string {
  return `briefing_${date}_${language}_${level}_${length}`;
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

// Derive a single CEFR grade per language from Prompt 4's genre-keyed grading dict.
// Uses the modal (most frequent) level for day-to-day stability.
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type CefrLevel = typeof CEFR_ORDER[number];
function modalCefr(langGrading: Record<string, { level: string }>): LanguageLevel {
  const counts: Record<string, number> = {};
  for (const assessment of Object.values(langGrading)) {
    if (CEFR_ORDER.includes(assessment.level as CefrLevel)) {
      counts[assessment.level] = (counts[assessment.level] ?? 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return (best ?? 'C1') as LanguageLevel;
}

function notReadyMessage(result?: BundleFetchResult): string {
  if (!result || result.ok) return "Today's briefing isn't ready yet — check back shortly after 06:30.";
  if (result.reason === 'network') return "Can't reach the server — check your connection and pull to refresh.";
  if (result.reason === 'http') {
    const s = result.status;
    if (s === 404) return "Today's briefing hasn't been published yet — check back shortly after 06:30.";
    if (s === 502 || s === 503) return "Server error fetching today's brief — check back soon or pull to refresh.";
    return `Can't fetch today's brief (HTTP ${s}) — pull to refresh or check back later.`;
  }
  return "Today's briefing isn't ready yet — check back shortly after 06:30.";
}

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
  lastFetchResult: BundleFetchResult | null;
  // Persistent volume counter — increments each time a new daily bundle is applied.
  // Displayed as "Vol. N" in the masthead, so it tracks real publications not calendar days.
  briefVolume: number;
  lastBundleDate: string | null;
  // Daily native CEFR grade per language — derived from Prompt 4 assessments.
  // The modal CEFR level across all native-journalism articles for a given language.
  // Used to position the 'Native' slot in the level picker dynamically.
  nativeGradeByLang: Partial<Record<LanguageCode, LanguageLevel>>;

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
      lastFetchResult: null,
      briefVolume: 0,
      lastBundleDate: null,
      nativeGradeByLang: {},

      syncFromServer: async () => {
        set({ isSyncing: true, syncMessage: "Fetching today's brief…" });
        try {
          const result = await fetchTodayBundle();
          if (!result.ok) {
            // Store the fetch result so loadBriefing can surface the right error
            set({ lastFetchResult: result });
            return;
          }

          const { bundle } = result;

          // Guard: the write pipeline sometimes produces an empty briefings dict
          // (e.g. all batch jobs failed). Treat this as "not ready yet" so the
          // user gets a meaningful message rather than a silent empty screen.
          const hasBriefings = Object.keys(bundle.briefings ?? {}).length > 0;
          if (!hasBriefings) {
            console.warn('[bilinguist] Bundle fetched but briefings is empty — write pipeline likely failed');
            set({
              lastFetchResult: {
                ok: false,
                reason: 'date-mismatch',
                bundleDate: `${bundle.date} (articles not ready yet)`,
              },
            });
            return;
          }

          set({ syncMessage: 'Applying…', lastFetchResult: result });
          await applyBundleToCache(bundle);
          await clearPreviousDaysBriefings(bundle.date);

          // Use the server's generation timestamp so "Published at" reflects when
          // the pipeline ran, not when the phone received the bundle.
          // Guard against seconds vs milliseconds: server may emit either format.
          const generatedTs = bundle.generatedAt;
          const receivedAt = generatedTs
            ? (generatedTs < 1e12 ? generatedTs * 1000 : generatedTs)
            : Date.now();
          const settings = useSettingsStore.getState();
          const updates: Partial<Record<LanguageCode, GeneratedBriefing>> = {};
          const clearedErrors: Partial<Record<LanguageCode, undefined>> = {};

          for (const lang of settings.languages.filter((l) => l.active)) {
            const level = lang.level ?? 'B1';
            const length: ArticleLength = (lang.readLength ?? 'medium') as ArticleLength;
            const briefing = bundle.briefings[lang.code]?.[level]?.[length];
            if (briefing) {
              updates[lang.code as LanguageCode] = briefing;
              clearedErrors[lang.code as LanguageCode] = undefined;
            }
          }

          const isNewDate = get().lastBundleDate !== bundle.date;

          // Derive daily native CEFR grade per language from Prompt 4 results
          const gradeUpdates: Partial<Record<LanguageCode, LanguageLevel>> = {};
          for (const [lang, langGrading] of Object.entries(bundle.grading ?? {})) {
            if (Object.keys(langGrading).length > 0) {
              gradeUpdates[lang as LanguageCode] = modalCefr(langGrading);
            }
          }

          set((s) => ({
            briefings: { ...s.briefings, ...updates },
            // Clear spinner and error for any language that now has content
            generatingFor: s.generatingFor.filter((l) => !(l in updates)),
            errorsFor: { ...s.errorsFor, ...clearedErrors },
            bundleReceivedAt: receivedAt,
            lastBundleDate: bundle.date,
            briefVolume: isNewDate ? s.briefVolume + 1 : s.briefVolume,
            nativeGradeByLang: { ...s.nativeGradeByLang, ...gradeUpdates },
          }));
        } finally {
          set({ isSyncing: false, syncMessage: null });
        }
      },

      loadWeather: async (language) => {
        set({ isLoadingWeather: true });

        // Request and cache user's real location on first call
        if (_userCoords === undefined) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
              const geo = await Location.reverseGeocodeAsync({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
              const cityName = geo[0]?.city ?? geo[0]?.district ?? geo[0]?.region ?? undefined;
              _userCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, cityName };
            } else {
              _userCoords = null; // permission denied — fall back to capital city
            }
          } catch {
            _userCoords = null;
          }
        }

        const weatherData = await fetchWeather(language, _userCoords ?? undefined);
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

        // ── 2.5. syncFromServer may have already loaded real content ───────
        // When forceRefresh=true, steps 1 and 2 are skipped above. But
        // syncFromServer (called concurrently in BriefingScreen) may have
        // already written today's real briefing into the store. Use it and
        // skip mock/error paths — this prevents developer mode from
        // overwriting real content with demo articles.
        {
          const fresh = get().briefings[language];
          if (fresh && fresh.date === today && fresh.language === language && fresh.level === level && fresh.length === length) {
            set((s) => ({ generatingFor: s.generatingFor.filter((l) => l !== language) }));
            return;
          }
        }

        // ── 3. Developer mock mode (fallback only — no real content found) ──
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

        // ── 5. Sync done — check again before giving up ─────────────────────
        // syncFromServer may have populated the briefing concurrently; re-check
        // before showing NOT_READY_MESSAGE (forceRefresh skips the early-return
        // cache check, so we must verify here too).
        const afterSyncCheck = get().briefings[language];
        if (afterSyncCheck && afterSyncCheck.date === today && afterSyncCheck.language === language && afterSyncCheck.level === level && afterSyncCheck.length === length) {
          set((s) => ({
            generatingFor: s.generatingFor.filter((l) => l !== language),
          }));
          return;
        }

        set((s) => ({
          generatingFor: s.generatingFor.filter((l) => l !== language),
          errorsFor: {
            ...s.errorsFor,
            [language]: notReadyMessage(s.lastFetchResult ?? undefined),
          },
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
        briefVolume: state.briefVolume,
        lastBundleDate: state.lastBundleDate,
        nativeGradeByLang: state.nativeGradeByLang,
      }),
    }
  )
);

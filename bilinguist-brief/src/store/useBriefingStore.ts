import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import type { GeneratedBriefing, ArticleLength } from '../services/anthropic';
import { fetchWeather, type WeatherData } from '../services/weather';
import { getMockBriefing } from '../data/mockBriefings';
import { fetchTodayBundle, fetchBundleMeta, applyBundleToCache, clearPreviousDaysBriefings, type BundleFetchResult } from '../services/briefingSync';
import type { LanguageCode, LanguageLevel } from './useSettingsStore';
import { useSettingsStore } from './useSettingsStore';
import { PIPELINE_READY_TIME } from '../services/notifications';

// Cached user GPS coords for the session — undefined = not yet fetched, null = denied/failed
let _userCoords: { latitude: number; longitude: number; cityName?: string } | null | undefined = undefined;

// Briefings are generated server-side at 04:30 UTC and delivered via the
// Cloudflare Worker. The app never calls Anthropic directly — no API key
// is stored in or shipped with the app.

function cacheKey(date: string, language: LanguageCode, level: LanguageLevel, length: ArticleLength): string {
  return `briefing_${date}_${language}_${level}_${length}`;
}

// Newest cached brief for a combination, whatever day it is from. Used when
// today's hasn't published: a reader opening the app should find the last brief
// that did, not an empty screen — it is only ever replaced by a newer one.
async function loadNewestCached(
  language: LanguageCode,
  level: LanguageLevel,
  length: ArticleLength,
): Promise<GeneratedBriefing | null> {
  try {
    const suffix = `_${language}_${level}_${length}`;
    const keys = (await AsyncStorage.getAllKeys())
      .filter((k) => k.startsWith('briefing_') && k.endsWith(suffix));
    if (keys.length === 0) return null;
    // Dates are ISO, so lexical order is chronological.
    const newest = keys.sort().at(-1)!;
    const stored = await AsyncStorage.getItem(newest);
    return stored ? JSON.parse(stored) as GeneratedBriefing : null;
  } catch {
    return null;
  }
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

// Derive a single CEFR grade per language from Prompt 4's genre-keyed grading dict.
// Uses the modal (most frequent) level for day-to-day stability.
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type CefrLevel = typeof CEFR_ORDER[number];
function modalCefr(assessments: Array<{ level: string }>, lang?: string): LanguageLevel {
  const counts: Record<string, number> = {};
  for (const assessment of assessments) {
    if (CEFR_ORDER.includes(assessment.level as CefrLevel)) {
      counts[assessment.level] = (counts[assessment.level] ?? 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!best) {
    console.warn(`[grading] modalCefr${lang ? ` (${lang})` : ''}: no valid CEFR levels in assessments — falling back to C1`);
  }
  return (best ?? 'C1') as LanguageLevel;
}

const NOT_READY_STRINGS: Partial<Record<LanguageCode, { notReady: string; network: string; notPublished: string; serverError: string; httpError: (s: number) => string }>> = {
  ar: {
    notReady:    `النشرة اليومية غير جاهزة بعد — تحقق مرة أخرى بعد الساعة ${PIPELINE_READY_TIME}.`,
    network:     'تعذّر الوصول إلى الخادم — تحقق من اتصالك واسحب للتحديث.',
    notPublished:`لم تُنشر النشرة اليومية بعد — تحقق مرة أخرى بعد الساعة ${PIPELINE_READY_TIME}.`,
    serverError: 'خطأ في الخادم — حاول مرة أخرى قريباً أو اسحب للتحديث.',
    httpError:   (s) => `تعذّر جلب النشرة (HTTP ${s}) — اسحب للتحديث أو حاول لاحقاً.`,
  },
};

function notReadyMessage(result?: BundleFetchResult, lang?: LanguageCode): string {
  const t = lang ? NOT_READY_STRINGS[lang] : undefined;
  if (!result || result.ok) return t?.notReady ?? `Today's briefing isn't ready yet — check back shortly after ${PIPELINE_READY_TIME}.`;
  if (result.reason === 'network') return t?.network ?? "Can't reach the server — check your connection and pull to refresh.";
  if (result.reason === 'http') {
    const s = result.status;
    if (s === 404) return t?.notPublished ?? `Today's briefing hasn't been published yet — check back shortly after ${PIPELINE_READY_TIME}.`;
    if (s === 502 || s === 503) return t?.serverError ?? "Server error fetching today's brief — check back soon or pull to refresh.";
    return (s !== undefined && t?.httpError ? t.httpError(s) : null) ?? `Can't fetch today's brief (HTTP ${s}) — pull to refresh or check back later.`;
  }
  return t?.notReady ?? `Today's briefing isn't ready yet — check back shortly after ${PIPELINE_READY_TIME}.`;
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
  nativeGradeByLang: Partial<Record<LanguageCode, LanguageLevel>>;
  // Levels actually generated today per language — CEFR levels from briefings
  // keys + Native if nativeJournalism exists. Updates each bundle sync.
  availableLevelsByLang: Partial<Record<LanguageCode, LanguageLevel[]>>;
  // Same as above but split by length — so the UI can show only levels that
  // actually have content for the user's selected short/longer preference.
  availableLevelsByLangAndLength: Partial<Record<LanguageCode, Partial<Record<ArticleLength, LanguageLevel[]>>>>;

  syncFromServer: (force?: boolean) => Promise<void>;
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
      availableLevelsByLang: {},
      availableLevelsByLangAndLength: {},

      syncFromServer: async (force = false) => {
        const today = todayString();
        set({ isSyncing: true, syncMessage: "Fetching today's brief…" });
        try {
          // Compare the server's generatedAt timestamp against what we already
          // have. If our copy is current (or the meta endpoint is unreachable),
          // skip the full bundle download and just read from AsyncStorage.
          // force=true (pull-to-refresh) bypasses this entirely.
          if (!force) {
            const meta = await fetchBundleMeta();
            const serverTs = meta?.generatedAt != null
              ? (meta.generatedAt < 1e12 ? meta.generatedAt * 1000 : meta.generatedAt)
              : null;
            const ourTs = get().bundleReceivedAt;
            const alreadyCurrent =
              serverTs != null && ourTs != null && serverTs <= ourTs && meta?.date === today;
            const noMetaFallback = meta == null && get().lastBundleDate === today;

            if (alreadyCurrent || noMetaFallback) {
              set({ syncMessage: 'Loading from cache…' });
              const settings = useSettingsStore.getState();
              const updates: Partial<Record<LanguageCode, GeneratedBriefing>> = {};
              const clearedErrors: Partial<Record<LanguageCode, undefined>> = {};
              for (const lang of settings.languages.filter((l) => l.active)) {
                const level = lang.level ?? 'B1';
                const length: ArticleLength = (lang.readLength === 'short' ? 'short' : 'longer') as ArticleLength;
                const key = cacheKey(today, lang.code as LanguageCode, level as LanguageLevel, length);
                try {
                  const stored = await AsyncStorage.getItem(key);
                  if (stored) {
                    updates[lang.code as LanguageCode] = JSON.parse(stored);
                    clearedErrors[lang.code as LanguageCode] = undefined;
                  }
                } catch { /* cache miss — leave existing content */ }
              }
              if (Object.keys(updates).length > 0) {
                set((s) => ({
                  briefings: { ...s.briefings, ...updates },
                  generatingFor: s.generatingFor.filter((l) => !(l in updates)),
                  errorsFor: { ...s.errorsFor, ...clearedErrors },
                }));
              }
              return;
            }
            // Server has a newer bundle — fall through to full fetch below
          }

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
            const length: ArticleLength = (lang.readLength === 'short' ? 'short' : 'longer') as ArticleLength;
            if (level === 'Native') {
              const nativeByLength = (bundle.nativeJournalism ?? {})[lang.code] as Record<string, any[]> | undefined;
              const nativeArticles = nativeByLength?.[length] ?? nativeByLength?.['longer'] ?? nativeByLength?.['short'];
              if (Array.isArray(nativeArticles) && nativeArticles.length) {
                updates[lang.code as LanguageCode] = {
                  articles: nativeArticles.map((a: any) => ({ genre: a.genre, headline: a.headline, body: a.body })),
                  date: bundle.date,
                  language: lang.code as LanguageCode,
                  level: 'Native' as LanguageLevel,
                  length,
                  generatedAt: receivedAt,
                };
                clearedErrors[lang.code as LanguageCode] = undefined;
              }
            } else {
              const briefing = bundle.briefings[lang.code]?.[level]?.[length];
              if (briefing) {
                updates[lang.code as LanguageCode] = briefing;
                clearedErrors[lang.code as LanguageCode] = undefined;
              }
            }
          }

          const isNewDate = get().lastBundleDate !== bundle.date;

          // Native journalism reading level from P4a — this is what gates which CEFR
          // levels the pipeline writes, and what the "B1 / Muttersprache" chip should show.
          const gradeUpdates: Partial<Record<LanguageCode, LanguageLevel>> = {};
          for (const [lang, grade] of Object.entries(bundle.nativeGrades ?? {})) {
            if (grade) gradeUpdates[lang as LanguageCode] = grade as LanguageLevel;
          }
          // Fall back to P4b modal if nativeGrades not present (older bundles)
          if (Object.keys(gradeUpdates).length === 0) {
            for (const [lang, langGrading] of Object.entries(bundle.grading ?? {})) {
              if (langGrading.length > 0) {
                gradeUpdates[lang as LanguageCode] = modalCefr(langGrading, lang);
              }
            }
          }

          // Derive available levels from what was actually generated today.
          // CEFR levels come from briefings keys (sorted by CEFR_ORDER);
          // Native is appended last if nativeJournalism exists for that language.
          const levelUpdates: Partial<Record<LanguageCode, LanguageLevel>> = {};
          const availableUpdates: Partial<Record<LanguageCode, LanguageLevel[]>> = {};
          const availableByLengthUpdates: Partial<Record<LanguageCode, Partial<Record<ArticleLength, LanguageLevel[]>>>> = {};
          // Walk both maps, not just briefings: a language can have native
          // journalism and no CEFR levels at all (en is configured Native-only),
          // and keying off briefings alone left it with no selectable level —
          // so the picker came up empty and the reader was stranded on whatever
          // level was last set, with nothing to show for it.
          const langsInBundle = new Set([
            ...Object.keys(bundle.briefings ?? {}),
            ...Object.keys(bundle.nativeJournalism ?? {}),
          ]);
          for (const lang of langsInBundle) {
            const levels = (bundle.briefings ?? {})[lang] ?? {};
            const cefrLevels = (Object.keys(levels) as LanguageLevel[])
              .filter((l) => CEFR_ORDER.includes(l as CefrLevel))
              .sort((a, b) => CEFR_ORDER.indexOf(a as CefrLevel) - CEFR_ORDER.indexOf(b as CefrLevel));
            const nativeByLength = (bundle.nativeJournalism ?? {})[lang] as Record<string, any[]> | undefined;
            const hasNative = !!(nativeByLength && Object.values(nativeByLength).some((arr) => Array.isArray(arr) && arr.length > 0));
            const available: LanguageLevel[] = [...cefrLevels, ...(hasNative ? ['Native' as LanguageLevel] : [])];
            if (available.length > 0) {
              availableUpdates[lang as LanguageCode] = available;
            }
            // Per-length availability: CEFR levels filtered to those with articles + Native per length.
            const byLength: Partial<Record<ArticleLength, LanguageLevel[]>> = {};
            for (const length of ['short', 'longer'] as ArticleLength[]) {
              const cefrForLength = cefrLevels.filter(
                (l) => ((levels as any)[l]?.[length]?.articles?.length ?? 0) > 0
              );
              const hasNativeForLength = Array.isArray(nativeByLength?.[length]) && (nativeByLength![length].length > 0);
              const avail: LanguageLevel[] = [...cefrForLength, ...(hasNativeForLength ? ['Native' as LanguageLevel] : [])];
              if (avail.length > 0) byLength[length] = avail;
            }
            if (Object.keys(byLength).length > 0) {
              availableByLengthUpdates[lang as LanguageCode] = byLength;
            }
          }

          // A reader can sit on a level the pipeline never produces — English is
          // configured Native-only, so a saved B2 has no content and never will.
          // Move them to the nearest level that does exist rather than leaving
          // them on an empty screen; the header then reflects what they're
          // actually reading.
          for (const lang of useSettingsStore.getState().languages.filter((l) => l.active)) {
            const available = availableUpdates[lang.code as LanguageCode];
            if (!available || available.length === 0) continue;
            const current = lang.level ?? 'B1';
            if (available.includes(current as LanguageLevel)) continue;

            const rank = (l: LanguageLevel) => {
              const i = CEFR_ORDER.indexOf(l as CefrLevel);
              // Native sits above every CEFR level rather than nowhere.
              return i === -1 ? CEFR_ORDER.length : i;
            };
            const target = [...available].sort(
              (a, b) => Math.abs(rank(a) - rank(current as LanguageLevel))
                      - Math.abs(rank(b) - rank(current as LanguageLevel)),
            )[0];
            if (target) {
              useSettingsStore.getState().setLanguageLevel(lang.code as LanguageCode, target);
            }
          }

          // Volume comes from the bundle (consistent across all devices). Fall back
          // to local increment for bundles published before the field was added.
          const nextVolume = bundle.volume != null
            ? bundle.volume
            : (isNewDate ? get().briefVolume + 1 : get().briefVolume);

          set((s) => ({
            briefings: { ...s.briefings, ...updates },
            // Clear spinner and error for any language that now has content
            generatingFor: s.generatingFor.filter((l) => !(l in updates)),
            errorsFor: { ...s.errorsFor, ...clearedErrors },
            bundleReceivedAt: receivedAt,
            lastBundleDate: bundle.date,
            briefVolume: nextVolume,
            nativeGradeByLang: { ...s.nativeGradeByLang, ...gradeUpdates },
            availableLevelsByLang: { ...s.availableLevelsByLang, ...availableUpdates },
            availableLevelsByLangAndLength: { ...s.availableLevelsByLangAndLength, ...availableByLengthUpdates },
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
          // On fetch failure keep any stale cached entry so weather doesn't vanish
          weather: weatherData ?? s.weather,
          weatherByLang: weatherData
            ? { ...s.weatherByLang, [language]: weatherData }
            : s.weatherByLang,
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

        // ── 2.6. Nothing for today — keep the last brief that did publish ───
        // The pipeline can be late, can fail, or can produce a bundle that
        // doesn't cover this combination. None of those are worth blanking the
        // screen for: the previous brief stays until a new one replaces it.
        {
          const previous = await loadNewestCached(language, level, length);
          if (previous) {
            set((s) => ({
              briefings: { ...s.briefings, [language]: previous },
              errorsFor: { ...s.errorsFor, [language]: undefined },
              generatingFor: s.generatingFor.filter((l) => l !== language),
            }));
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
            [language]: notReadyMessage(s.lastFetchResult ?? undefined, language),
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
        availableLevelsByLang: state.availableLevelsByLang,
        availableLevelsByLangAndLength: state.availableLevelsByLangAndLength,
      }),
    }
  )
);

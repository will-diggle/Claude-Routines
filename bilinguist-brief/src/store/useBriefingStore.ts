import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateBriefing, type GeneratedBriefing, type ArticleLength } from '../services/anthropic';
import { fetchWeather, type WeatherData } from '../services/weather';
import { getMockBriefing } from '../data/mockBriefings';
import { clearTodayFactbase } from '../services/factbase';
import type { LanguageCode, LanguageLevel } from './useSettingsStore';
import { useSettingsStore } from './useSettingsStore';


function cacheKey(date: string, language: LanguageCode, level: LanguageLevel, length: ArticleLength): string {
  return `briefing_${date}_${language}_${level}_${length}`;
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

interface BriefingStore {
  briefings: Partial<Record<LanguageCode, GeneratedBriefing>>;
  generatingFor: LanguageCode[];
  errorsFor: Partial<Record<LanguageCode, string>>;
  weather: WeatherData | null;
  isLoadingWeather: boolean;

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
      isLoadingWeather: false,

      loadWeather: async (language) => {
        set({ isLoadingWeather: true });
        const weather = await fetchWeather(language);
        set({ weather, isLoadingWeather: false });
      },

      loadBriefing: async (language, level, length, forceRefresh = false) => {
        const today = todayString();
        const key = cacheKey(today, language, level, length);

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
            // Cache miss — continue to generate
          }
        }

        // Force refresh: wipe factbase so a fresh gathering call runs
        if (forceRefresh) {
          await clearTodayFactbase();
          set((s) => ({ briefings: { ...s.briefings, [language]: undefined } }));
        }

        // Developer mock mode
        if (useSettingsStore.getState().developerMode) {
          const mock = getMockBriefing(language, level, length);
          set((s) => ({
            briefings: { ...s.briefings, [language]: mock },
            errorsFor: { ...s.errorsFor, [language]: undefined },
          }));
          return;
        }

        set((s) => ({
          generatingFor: s.generatingFor.includes(language)
            ? s.generatingFor
            : [...s.generatingFor, language],
          errorsFor: { ...s.errorsFor, [language]: undefined },
        }));

        try {
          const result = await generateBriefing(language, level, length);

          await AsyncStorage.setItem(key, JSON.stringify(result));

          set((s) => ({
            briefings: { ...s.briefings, [language]: result },
            generatingFor: s.generatingFor.filter((l) => l !== language),
            errorsFor: { ...s.errorsFor, [language]: undefined },
          }));
        } catch (err: any) {
          const raw: string = err?.message ?? 'Unknown error';
          let message: string;
          if (raw === 'NO_API_KEY') {
            message = 'Add your Anthropic API key to .env to generate briefings.';
          } else if (raw.includes('rate_limit_error') || raw.includes('429')) {
            message = 'Rate limit reached — please wait a moment and try again.';
          } else if (raw.includes('Daily limit')) {
            message = raw;
          } else {
            message = 'Could not generate briefing — please try again.';
          }
          set((s) => ({
            generatingFor: s.generatingFor.filter((l) => l !== language),
            errorsFor: { ...s.errorsFor, [language]: message },
          }));
        }
      },

      clearError: (language) =>
        set((s) => ({ errorsFor: { ...s.errorsFor, [language]: undefined } })),
    }),
    {
      name: 'bilinguist-briefing-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ briefings: state.briefings, weather: state.weather }),
    }
  )
);

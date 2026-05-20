import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateBriefing, generateFreeBriefing, type GeneratedBriefing } from '../services/anthropic';
import { fetchWeather, type WeatherData } from '../services/weather';
import { getMockBriefing } from '../data/mockBriefings';
import type { LanguageCode, LanguageLevel, BriefingLength } from './useSettingsStore';
import { useSettingsStore } from './useSettingsStore';

const TOPIC_LABELS: Record<string, string> = {
  worldNews: 'World News',
  goodNews: 'Good News',
  sport: 'Sport',
  politics: 'Politics',
  artsCulture: 'Arts & Culture',
  countryNews: 'Country News',
  scienceTech: 'Science & Technology',
  business: 'Business',
};

function cacheKey(date: string, language: LanguageCode, level: LanguageLevel): string {
  return `briefing_${date}_${language}_${level}`;
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

interface BriefingStore {
  briefing: GeneratedBriefing | null;
  weather: WeatherData | null;
  isGenerating: boolean;
  isLoadingWeather: boolean;
  error: string | null;

  loadBriefing: (
    language: LanguageCode,
    level: LanguageLevel,
    briefingLength: BriefingLength,
    topics: Record<string, boolean>,
    forceRefresh?: boolean,
    isFreeUser?: boolean
  ) => Promise<void>;

  loadWeather: (language: LanguageCode) => Promise<void>;
  clearError: () => void;
}

export const useBriefingStore = create<BriefingStore>()(
  persist(
    (set, get) => ({
      briefing: null,
      weather: null,
      isGenerating: false,
      isLoadingWeather: false,
      error: null,

      loadWeather: async (language) => {
        set({ isLoadingWeather: true });
        const weather = await fetchWeather(language);
        set({ weather, isLoadingWeather: false });
      },

      loadBriefing: async (language, level, briefingLength, topics, forceRefresh = false, isFreeUser = false) => {
        const today = todayString();
        const tierSuffix = isFreeUser ? '_free' : '_paid';
        const key = cacheKey(today, language, level) + tierSuffix;

        // Use cached briefing if available and not forcing refresh
        if (!forceRefresh) {
          const cached = get().briefing;
          const tierMatches = isFreeUser ? !!cached?.isFree : !cached?.isFree;
          if (cached && cached.date === today && cached.language === language && cached.level === level && tierMatches) {
            return;
          }

          // Check AsyncStorage for cached version
          try {
            const stored = await AsyncStorage.getItem(key);
            if (stored) {
              const parsed: GeneratedBriefing = JSON.parse(stored);
              set({ briefing: parsed, error: null });
              return;
            }
          } catch {
            // Cache miss — continue to generate
          }
        }

        // Developer mock mode — instant, no API call
        if (useSettingsStore.getState().developerMode) {
          const mock = getMockBriefing(language, level, briefingLength, isFreeUser);
          set({ briefing: mock, isGenerating: false, error: null });
          return;
        }

        set({ isGenerating: true, error: null });

        try {
          const result = isFreeUser
            ? await generateFreeBriefing(language, level)
            : await generateBriefing(
                language,
                level,
                briefingLength,
                Object.entries(topics).filter(([, on]) => on).map(([k]) => TOPIC_LABELS[k] ?? k)
              );

          // Cache to AsyncStorage
          await AsyncStorage.setItem(key, JSON.stringify(result));

          set({ briefing: result, isGenerating: false, error: null });
        } catch (err: any) {
          const message =
            err?.message === 'NO_API_KEY'
              ? 'Add your Anthropic API key to .env to generate briefings.'
              : `Could not generate briefing: ${err?.message ?? 'Unknown error'}`;
          set({ isGenerating: false, error: message });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'bilinguist-briefing',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ briefing: state.briefing, weather: state.weather }),
    }
  )
);

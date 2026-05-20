import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateBriefing, type GeneratedBriefing } from '../services/anthropic';
import { fetchWeather, type WeatherData } from '../services/weather';
import type { LanguageCode, LanguageLevel, BriefingLength } from './useSettingsStore';

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
    forceRefresh?: boolean
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

      loadBriefing: async (language, level, briefingLength, topics, forceRefresh = false) => {
        const today = todayString();
        const key = cacheKey(today, language, level);

        // Use cached briefing if available and not forcing refresh
        if (!forceRefresh) {
          const cached = get().briefing;
          if (cached && cached.date === today && cached.language === language && cached.level === level) {
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

        set({ isGenerating: true, error: null });

        try {
          const enabledTopics = Object.entries(topics)
            .filter(([, enabled]) => enabled)
            .map(([k]) => TOPIC_LABELS[k] ?? k);

          const result = await generateBriefing(language, level, briefingLength, enabledTopics);

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

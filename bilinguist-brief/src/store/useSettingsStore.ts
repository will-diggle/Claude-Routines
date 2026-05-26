import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BackgroundKey, FontFamilyKey, FontSizeKey } from '../theme';

export type LanguageCode = 'fr' | 'de' | 'en' | 'es' | 'it';
export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
export const LANGUAGE_LEVELS: LanguageLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

// User-facing depth choice. Only applies to B1+ levels.
// A1/A2 always generate at 'short' regardless of this setting.
export type ReadLength = 'medium' | 'longer';

export interface LanguagePreference {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  level: LanguageLevel;
  active: boolean;
}

export interface Topics {
  worldNews: boolean;
  goodNews: boolean;
  politics: boolean;
  business: boolean;
  [key: string]: boolean;
}

export interface Settings {
  languages: LanguagePreference[];
  displayLanguage: LanguageCode;
  topics: Topics;
  topicOrder: string[];
  readLength: ReadLength;
  briefingNotificationTime: string;
  practiceNotificationTime: string;
  fontSize: FontSizeKey;
  background: BackgroundKey;
  fontFamily: FontFamilyKey;
  developerMode: boolean;
}

interface SettingsStore extends Settings {
  setDisplayLanguage: (code: LanguageCode) => void;
  toggleLanguage: (code: LanguageCode) => void;
  setLanguageLevel: (code: LanguageCode, level: LanguageLevel) => void;
  reorderLanguages: (from: number, to: number) => void;
  toggleTopic: (topic: keyof Topics) => void;
  reorderTopics: (from: number, to: number) => void;
  setReadLength: (length: ReadLength) => void;
  setBriefingNotificationTime: (time: string) => void;
  setPracticeNotificationTime: (time: string) => void;
  setFontSize: (size: FontSizeKey) => void;
  setBackground: (bg: BackgroundKey) => void;
  setFontFamily: (font: FontFamilyKey) => void;
  setDeveloperMode: (enabled: boolean) => void;
  activeLanguages: () => LanguagePreference[];
}

const ALL_LANGUAGES: LanguagePreference[] = [
  { code: 'fr', name: 'French',  nativeName: 'Français', flag: '🇫🇷', level: 'B1', active: false },
  { code: 'de', name: 'German',  nativeName: 'Deutsch',  flag: '🇩🇪', level: 'A2', active: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español',  flag: '🇪🇸', level: 'A1', active: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', level: 'A1', active: false },
  { code: 'en', name: 'English', nativeName: 'English',  flag: '🇬🇧', level: 'C1', active: true  },
];

const DEFAULT_TOPIC_ORDER = [
  'worldNews', 'politics', 'business', 'goodNews',
];

const DEFAULT_SETTINGS: Settings = {
  languages: ALL_LANGUAGES,
  displayLanguage: 'en',
  topics: {
    worldNews: true,
    goodNews: true,
    politics: true,
    business: true,
  },
  topicOrder: DEFAULT_TOPIC_ORDER,
  readLength: 'medium',
  briefingNotificationTime: '07:00',
  practiceNotificationTime: '18:00',
  fontSize: 'medium',
  background: 'white',
  fontFamily: 'playfair',
  developerMode: false,
};

const MAX_ACTIVE_LANGUAGES = 5;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setDisplayLanguage: (code) => set({ displayLanguage: code }),

      toggleLanguage: (code) => {
        const languages = get().languages;
        const target = languages.find((l) => l.code === code);
        if (!target) return;

        const activeCount = languages.filter((l) => l.active).length;
        if (!target.active && activeCount >= MAX_ACTIVE_LANGUAGES) return;

        const updated = languages.map((l) =>
          l.code === code ? { ...l, active: !l.active } : l
        );

        const displayLanguage = get().displayLanguage;
        const displayStillActive = updated.find((l) => l.code === displayLanguage)?.active;
        const firstActive = updated.find((l) => l.active);

        set({
          languages: updated,
          displayLanguage: displayStillActive
            ? displayLanguage
            : firstActive?.code ?? displayLanguage,
        });
      },

      setLanguageLevel: (code, level) =>
        set({
          languages: get().languages.map((l) =>
            l.code === code ? { ...l, level } : l
          ),
        }),

      reorderLanguages: (from, to) => {
        const languages = [...get().languages];
        if (to < 0 || to >= languages.length) return;
        const [item] = languages.splice(from, 1);
        languages.splice(to, 0, item);
        set({ languages });
      },

      toggleTopic: (topic) =>
        set({ topics: { ...get().topics, [topic]: !get().topics[topic] } }),

      reorderTopics: (from, to) => {
        const order = [...(get().topicOrder ?? DEFAULT_TOPIC_ORDER)];
        if (to < 0 || to >= order.length) return;
        const [item] = order.splice(from, 1);
        order.splice(to, 0, item);
        set({ topicOrder: order });
      },

      setReadLength: (readLength) => set({ readLength }),
      setBriefingNotificationTime: (briefingNotificationTime) => set({ briefingNotificationTime }),
      setPracticeNotificationTime: (practiceNotificationTime) => set({ practiceNotificationTime }),
      setFontSize: (fontSize) => set({ fontSize }),
      setBackground: (background) => set({ background }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setDeveloperMode: (developerMode) => set({ developerMode }),

      activeLanguages: () => get().languages.filter((l) => l.active),
    }),
    {
      name: 'bilinguist-settings',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Remove parked topics (sport, countryNews, scienceTech, artsCulture) that were in older builds
        const VALID = new Set(['worldNews', 'politics', 'business', 'goodNews']);
        const cleanOrder = (state.topicOrder ?? DEFAULT_TOPIC_ORDER).filter((k) => VALID.has(k));
        VALID.forEach((k) => { if (!cleanOrder.includes(k)) cleanOrder.push(k); });
        state.topicOrder = cleanOrder;
        // Ensure topics object has exactly the valid keys
        const cleanTopics: any = {};
        VALID.forEach((k) => { cleanTopics[k] = state.topics?.[k] !== false; });
        state.topics = cleanTopics;
        // Migrate old briefingLength → readLength
        if (!(state as any).readLength) {
          state.readLength = 'medium';
        }
        // Migrate old ptserif → garamond (PT Serif removed; EB Garamond is the replacement)
        if ((state as any).fontFamily === 'ptserif') {
          state.fontFamily = 'garamond';
        }
      },
    }
  )
);

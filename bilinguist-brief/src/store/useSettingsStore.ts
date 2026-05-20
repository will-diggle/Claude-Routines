import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BackgroundKey, FontFamilyKey, FontSizeKey } from '../theme';

export type LanguageCode = 'fr' | 'de' | 'en' | 'es' | 'it';
export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
export const LANGUAGE_LEVELS: LanguageLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];
export type BriefingLength = 'short' | 'standard' | 'full';
export type LanguagesPerBriefing = '1' | '2' | 'all';

export interface LanguagePreference {
  code: LanguageCode;
  name: string;
  flag: string;
  level: LanguageLevel;
  active: boolean;
}

export interface Topics {
  worldNews: boolean;
  goodNews: boolean;
  sport: boolean;
  politics: boolean;
  artsCulture: boolean;
  countryNews: boolean;
  scienceTech: boolean;
  business: boolean;
  [key: string]: boolean;
}

export interface Settings {
  languages: LanguagePreference[];
  displayLanguage: LanguageCode;
  topics: Topics;
  briefingLength: BriefingLength;
  briefingNotificationTime: string;
  practiceNotificationTime: string;
  languagesPerBriefing: LanguagesPerBriefing;
  fontSize: FontSizeKey;
  background: BackgroundKey;
  fontFamily: FontFamilyKey;
  developerMode: boolean;
}

interface SettingsStore extends Settings {
  setDisplayLanguage: (code: LanguageCode) => void;
  toggleLanguage: (code: LanguageCode) => void;
  setLanguageLevel: (code: LanguageCode, level: LanguageLevel) => void;
  toggleTopic: (topic: keyof Topics) => void;
  setBriefingLength: (length: BriefingLength) => void;
  setBriefingNotificationTime: (time: string) => void;
  setPracticeNotificationTime: (time: string) => void;
  setLanguagesPerBriefing: (count: LanguagesPerBriefing) => void;
  setFontSize: (size: FontSizeKey) => void;
  setBackground: (bg: BackgroundKey) => void;
  setFontFamily: (font: FontFamilyKey) => void;
  setDeveloperMode: (enabled: boolean) => void;
  activeLanguages: () => LanguagePreference[];
}

const ALL_LANGUAGES: LanguagePreference[] = [
  { code: 'fr', name: 'French', flag: '🇫🇷', level: 'B1', active: false },
  { code: 'de', name: 'German', flag: '🇩🇪', level: 'A2', active: false },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', level: 'A1', active: false },
  { code: 'it', name: 'Italian', flag: '🇮🇹', level: 'A1', active: false },
  { code: 'en', name: 'English', flag: '🇬🇧', level: 'Native', active: true },
];

const DEFAULT_SETTINGS: Settings = {
  languages: ALL_LANGUAGES,
  displayLanguage: 'en',
  topics: {
    worldNews: true,
    goodNews: true,
    sport: false,
    politics: true,
    artsCulture: false,
    countryNews: true,
    scienceTech: false,
    business: false,
  },
  briefingLength: 'standard',
  briefingNotificationTime: '07:00',
  practiceNotificationTime: '18:00',
  languagesPerBriefing: '1',
  fontSize: 'medium',
  background: 'cream',
  fontFamily: 'playfair',
  developerMode: false,
};

const MAX_ACTIVE_LANGUAGES = 3;

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

      toggleTopic: (topic) =>
        set({ topics: { ...get().topics, [topic]: !get().topics[topic] } }),

      setBriefingLength: (briefingLength) => set({ briefingLength }),
      setBriefingNotificationTime: (briefingNotificationTime) => set({ briefingNotificationTime }),
      setPracticeNotificationTime: (practiceNotificationTime) => set({ practiceNotificationTime }),
      setLanguagesPerBriefing: (languagesPerBriefing) => set({ languagesPerBriefing }),
      setFontSize: (fontSize) => set({ fontSize }),
      setBackground: (background) => set({ background }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setDeveloperMode: (developerMode) => set({ developerMode }),

      activeLanguages: () => get().languages.filter((l) => l.active),
    }),
    {
      name: 'bilinguist-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

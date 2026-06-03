import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BackgroundKey, FontFamilyKey, FontSizeKey } from '../theme';

export type LanguageCode = 'fr' | 'de' | 'en' | 'sv' | 'it' | 'es' | 'tr';
export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
export const LANGUAGE_LEVELS: LanguageLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

// User-facing depth choice. Only applies to B1+ levels.
// A1/A2 always generate at 'short' regardless of this setting.
export type ReadLength = 'short' | 'medium' | 'longer';

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
  ukPolitics: boolean;
  politics: boolean;
  business: boolean;
  europe: boolean;
  scienceTech: boolean;
  artsCulture: boolean;
  asia: boolean;
  middleEast: boolean;
  africa: boolean;
  goodNews: boolean;
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
  { code: 'fr', name: 'French',           nativeName: 'Français', flag: '🇫🇷', level: 'B1',    active: false },
  { code: 'de', name: 'German',           nativeName: 'Deutsch',  flag: '🇩🇪', level: 'A2',    active: false },
  { code: 'sv', name: 'Swedish',          nativeName: 'Svenska',  flag: '🇸🇪', level: 'B2',    active: false },
  { code: 'en', name: 'English (British)',nativeName: 'English',  flag: '🇬🇧', level: 'C1',    active: true  },
  { code: 'it', name: 'Italian',          nativeName: 'Italiano', flag: '🇮🇹', level: 'A1',    active: false },
  { code: 'es', name: 'Spanish',          nativeName: 'Español',  flag: '🇪🇸', level: 'A2',    active: false },
  { code: 'tr', name: 'Turkish',          nativeName: 'Türkçe',   flag: '🇹🇷', level: 'A1',    active: false },
];

const DEFAULT_TOPIC_ORDER = [
  'worldNews', 'ukPolitics', 'business', 'europe',
  'politics', 'scienceTech', 'artsCulture', 'asia', 'middleEast', 'africa', 'goodNews',
];

const DEFAULT_SETTINGS: Settings = {
  languages: ALL_LANGUAGES,
  displayLanguage: 'en',
  topics: {
    worldNews: true,
    ukPolitics: true,
    politics: false,
    business: true,
    europe: true,
    scienceTech: false,
    artsCulture: false,
    asia: false,
    middleEast: false,
    africa: false,
    goodNews: false,
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
      // developerMode is intentionally excluded — always starts false on app launch
      partialize: (state) => ({
        languages: state.languages,
        displayLanguage: state.displayLanguage,
        topics: state.topics,
        topicOrder: state.topicOrder,
        readLength: state.readLength,
        briefingNotificationTime: state.briefingNotificationTime,
        practiceNotificationTime: state.practiceNotificationTime,
        fontSize: state.fontSize,
        background: state.background,
        fontFamily: state.fontFamily,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const VALID = new Set(['worldNews', 'ukPolitics', 'politics', 'business', 'europe', 'scienceTech', 'artsCulture', 'asia', 'middleEast', 'africa', 'goodNews']);
        const cleanOrder = (state.topicOrder ?? DEFAULT_TOPIC_ORDER).filter((k) => VALID.has(k));
        VALID.forEach((k) => { if (!cleanOrder.includes(k)) cleanOrder.push(k); });
        state.topicOrder = cleanOrder;
        const cleanTopics: any = {};
        VALID.forEach((k) => {
          // ukPolitics defaults on; coming-soon topics default off
          const COMING_SOON = new Set(['politics', 'scienceTech', 'artsCulture', 'asia', 'middleEast', 'africa', 'goodNews']);
          cleanTopics[k] = state.topics?.[k] !== undefined
            ? state.topics[k]
            : !COMING_SOON.has(k);
        });
        state.topics = cleanTopics;
        // Migrate old briefingLength → readLength
        if (!(state as any).readLength) {
          state.readLength = 'medium';
        }
        // Migrate old ptserif → garamond (PT Serif removed; EB Garamond is the replacement)
        if ((state as any).fontFamily === 'ptserif') {
          state.fontFamily = 'garamond';
        }
        // Ensure all languages are present; preserve user's existing languages
        const VALID_CODES = new Set<string>(['fr', 'de', 'sv', 'en', 'it', 'es', 'tr']);
        const filtered = (state.languages ?? ALL_LANGUAGES).filter((l) => VALID_CODES.has(l.code));
        // Validate levels without resetting the user's custom drag order
        const VALID_LEVELS: Record<string, string[]> = {
          fr: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
          de: ['A1', 'A2', 'Native'],
          sv: ['B2', 'Native'],
          en: ['B2', 'C1', 'C2', 'Native'],
          it: ['A1', 'Native'],
          es: ['A2'],
          tr: ['A1'],
        };
        // Preserve user's saved order — only migrate stale levels
        const migratedLangs: LanguagePreference[] = filtered.map((lang) => {
          const valid = VALID_LEVELS[lang.code];
          if (valid && !valid.includes(lang.level)) {
            return { ...lang, level: valid[0] as LanguageLevel };
          }
          return lang;
        });
        // Append any newly added languages not yet in the user's list
        const presentCodes = new Set(migratedLangs.map((l) => l.code));
        ALL_LANGUAGES.forEach((l) => { if (!presentCodes.has(l.code)) migratedLangs.push(l); });
        state.languages = migratedLangs;
        if (!VALID_CODES.has(state.displayLanguage)) {
          state.displayLanguage = state.languages.find((l) => l.active)?.code ?? 'en';
        }
      },
    }
  )
);

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BackgroundKey, FontFamilyKey, FontSizeKey } from '../theme';

export type LanguageCode = 'fr' | 'de' | 'en' | 'sv' | 'it' | 'es' | 'pt' | 'tr' | 'hu' | 'ar';
export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
export const LANGUAGE_LEVELS: LanguageLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

// Levels available per language — single source of truth used by all level pickers.
export const LEVELS_BY_LANG: Record<string, LanguageLevel[]> = {
  en: ['A1', 'A2', 'B1', 'B2', 'C1', 'Native'],
  fr: ['A1', 'A2', 'B1', 'B2', 'C1', 'Native'],
  de: ['A1', 'A2', 'B1', 'B2', 'C1', 'Native'],
  sv: ['B2', 'Native'],
  it: ['A1', 'A2', 'B1', 'B2', 'C1', 'Native'],
  es: ['A2'],
  tr: ['A1'],
  hu: ['Native'],
  ar: ['A1', 'A2'],
};

// Override the Latin code label for languages with non-Latin scripts.
export const LANG_DISPLAY_CODE: Partial<Record<LanguageCode, string>> = {
  ar: 'عر',
};

/** Returns the short display label for a language code (e.g. "FR", "عر"). */
export function langDisplayCode(code: string): string {
  return LANG_DISPLAY_CODE[code as LanguageCode] ?? code.toUpperCase();
}

export type ReadLength = 'short' | 'medium' | 'longer';

export interface LanguagePreference {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  level: LanguageLevel;
  readLength: ReadLength;
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
  briefingNotificationTime: string;
  practiceNotificationTime: string;
  fontSize: FontSizeKey;
  background: BackgroundKey;
  manualBackground: BackgroundKey; // user's chosen theme, preserved when auto-night overrides
  autoNightMode: boolean;
  fontFamily: FontFamilyKey;
  appIcon: string | null;
  appIconAuto: boolean;
  username: string;
}

interface SettingsStore extends Settings {
  setDisplayLanguage: (code: LanguageCode) => void;
  toggleLanguage: (code: LanguageCode) => void;
  setLanguageLevel: (code: LanguageCode, level: LanguageLevel) => void;
  setLanguageReadLength: (code: LanguageCode, length: ReadLength) => void;
  reorderLanguages: (from: number, to: number) => void;
  toggleTopic: (topic: keyof Topics) => void;
  reorderTopics: (from: number, to: number) => void;
  setBriefingNotificationTime: (time: string) => void;
  setPracticeNotificationTime: (time: string) => void;
  setFontSize: (size: FontSizeKey) => void;
  setBackground: (bg: BackgroundKey) => void;
  setEffectiveBackground: (bg: BackgroundKey) => void; // auto-night only — doesn't touch manualBackground
  setAutoNightMode: (v: boolean) => void;
  setFontFamily: (font: FontFamilyKey) => void;
  setAppIcon: (icon: string | null) => void;
  setAppIconAuto: (v: boolean) => void;
  setUsername: (v: string) => void;
  activeLanguages: () => LanguagePreference[];
}

const ALL_LANGUAGES: LanguagePreference[] = [
  { code: 'fr', name: 'French',           nativeName: 'Français',  flag: '🇫🇷', level: 'B2',     readLength: 'short', active: false },
  { code: 'de', name: 'German',           nativeName: 'Deutsch',   flag: '🇩🇪', level: 'A2',     readLength: 'short', active: false },
  { code: 'sv', name: 'Swedish',          nativeName: 'Svenska',   flag: '🇸🇪', level: 'B2',     readLength: 'short', active: false },
  { code: 'en', name: 'English (British)',nativeName: 'English',   flag: '🇬🇧', level: 'B2',     readLength: 'short', active: true  },
  { code: 'it', name: 'Italian',          nativeName: 'Italiano',  flag: '🇮🇹', level: 'A1',     readLength: 'short', active: false },
  { code: 'es', name: 'Spanish',                nativeName: 'Español',   flag: '🇪🇸', level: 'A2',     readLength: 'short', active: false },
  { code: 'pt', name: 'Portuguese (Brazilian)', nativeName: 'Português', flag: '🇧🇷', level: 'A2',     readLength: 'short', active: false },
  { code: 'tr', name: 'Turkish',          nativeName: 'Türkçe',    flag: '🇹🇷', level: 'A1',     readLength: 'short', active: false },
  { code: 'hu', name: 'Hungarian',        nativeName: 'Magyar',    flag: '🇭🇺', level: 'Native', readLength: 'short', active: false },
  { code: 'ar', name: 'Arabic',           nativeName: 'العربية',   flag: '🇸🇦', level: 'A1',     readLength: 'short', active: false },
];

const DEFAULT_TOPIC_ORDER = [
  'weather', 'worldNews', 'ukPolitics', 'business', 'europe',
  'politics', 'scienceTech', 'artsCulture', 'asia', 'middleEast', 'africa', 'goodNews',
];

const DEFAULT_SETTINGS: Settings = {
  languages: ALL_LANGUAGES,
  displayLanguage: 'en',
  topics: {
    weather: true,
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
  briefingNotificationTime: '07:00',
  practiceNotificationTime: '18:00',
  fontSize: 'medium',
  background: 'white',
  manualBackground: 'white',
  autoNightMode: false,
  fontFamily: 'lora',
  appIcon: null,
  appIconAuto: false,
  username: '',
};

const MAX_ACTIVE_LANGUAGES = 7;

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

        const toggled = languages.map((l) =>
          l.code === code ? { ...l, active: !l.active } : l
        );

        // Active languages float to the top (preserving their relative order),
        // inactive ones sink below — so the list always stays neat.
        const updated = [
          ...toggled.filter((l) => l.active),
          ...toggled.filter((l) => !l.active),
        ];

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

      setLanguageReadLength: (code, readLength) =>
        set({
          languages: get().languages.map((l) =>
            l.code === code ? { ...l, readLength } : l
          ),
        }),

      reorderLanguages: (from, to) => {
        const languages = [...get().languages];
        if (to < 0 || to >= languages.length) return;
        const [item] = languages.splice(from, 1);
        languages.splice(to, 0, item);
        set({ languages });
      },

      toggleTopic: (topic) => {
        const newTopics = { ...get().topics, [topic]: !get().topics[topic] };
        const currentOrder = get().topicOrder ?? DEFAULT_TOPIC_ORDER;
        // Active genres float to the top; inactive ones sink below.
        const active   = currentOrder.filter((k) => newTopics[k]);
        const inactive = currentOrder.filter((k) => !newTopics[k]);
        set({ topics: newTopics, topicOrder: [...active, ...inactive] });
      },

      reorderTopics: (from, to) => {
        const order = [...(get().topicOrder ?? DEFAULT_TOPIC_ORDER)];
        if (to < 0 || to >= order.length) return;
        const [item] = order.splice(from, 1);
        order.splice(to, 0, item);
        set({ topicOrder: order });
      },

      setBriefingNotificationTime: (briefingNotificationTime) => set({ briefingNotificationTime }),
      setPracticeNotificationTime: (practiceNotificationTime) => set({ practiceNotificationTime }),
      setFontSize: (fontSize) => set({ fontSize }),
      setBackground: (background) => set({ background, manualBackground: background }),
      setEffectiveBackground: (background) => set({ background }),
      setAutoNightMode: (autoNightMode) => set({ autoNightMode }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setAppIcon: (appIcon) => set({ appIcon }),
      setAppIconAuto: (appIconAuto) => set({ appIconAuto }),
      setUsername: (username) => set({ username }),

      activeLanguages: () => get().languages.filter((l) => l.active),
    }),
    {
      name: 'bilinguist-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        languages: state.languages,
        displayLanguage: state.displayLanguage,
        topics: state.topics,
        topicOrder: state.topicOrder,
        briefingNotificationTime: state.briefingNotificationTime,
        practiceNotificationTime: state.practiceNotificationTime,
        fontSize: state.fontSize,
        background: state.background,
        manualBackground: state.manualBackground,
        autoNightMode: state.autoNightMode,
        fontFamily: state.fontFamily,
        appIcon: state.appIcon,
        appIconAuto: state.appIconAuto,
        username: state.username,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const ORDER_VALID = new Set(['weather', 'worldNews', 'ukPolitics', 'politics', 'business', 'europe', 'scienceTech', 'artsCulture', 'asia', 'middleEast', 'africa', 'goodNews']);
        const TOPIC_VALID = ORDER_VALID;
        const cleanOrder = (state.topicOrder ?? DEFAULT_TOPIC_ORDER).filter((k) => ORDER_VALID.has(k));
        // Ensure weather appears at the front for existing users who didn't have it in topicOrder
        if (!cleanOrder.includes('weather')) cleanOrder.unshift('weather');
        ORDER_VALID.forEach((k) => { if (!cleanOrder.includes(k)) cleanOrder.push(k); });
        state.topicOrder = cleanOrder;
        const cleanTopics: any = {};
        TOPIC_VALID.forEach((k) => {
          const COMING_SOON = new Set(['politics', 'scienceTech', 'artsCulture', 'asia', 'middleEast', 'africa', 'goodNews']);
          cleanTopics[k] = state.topics?.[k] !== undefined
            ? state.topics[k]
            : !COMING_SOON.has(k);
        });
        state.topics = cleanTopics;
        // Migrate removed font options → lora
        if ((state as any).fontFamily === 'ptserif' || (state as any).fontFamily === 'system') {
          state.fontFamily = 'lora';
        }
        // Ensure all languages are present; preserve user's existing languages
        const VALID_CODES = new Set<string>(['fr', 'de', 'sv', 'en', 'it', 'es', 'pt', 'tr']);
        const filtered = (state.languages ?? ALL_LANGUAGES).filter((l) => VALID_CODES.has(l.code));
        // Validate levels without resetting the user's custom drag order
        // Preserve user's saved order — migrate stale levels and backfill readLength
        const globalReadLength = ((state as any).readLength as ReadLength) ?? 'short';
        const migratedLangs: LanguagePreference[] = filtered.map((lang: any) => {
          const valid = LEVELS_BY_LANG[lang.code];
          const migratedLevel = (valid && !valid.includes(lang.level))
            ? valid[0] as LanguageLevel
            : lang.level;
          const rawLength = (lang.readLength as ReadLength) ?? globalReadLength;
          // 'medium' has no UI button — migrate to 'short'
          const readLength: ReadLength = rawLength === 'medium' ? 'short' : rawLength;
          return {
            ...lang,
            level: migratedLevel,
            readLength,
          };
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

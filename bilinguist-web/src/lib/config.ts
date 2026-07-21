// Mirrors bilinguist-brief/src/store/useSettingsStore.ts — single source of
// truth for language/level/font options, kept in sync with the app.

export type LanguageCode = 'fr' | 'de' | 'en' | 'sv' | 'it' | 'es' | 'tr' | 'hu' | 'ar';
export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
export type ThemeKey = 'white' | 'cream' | 'softGrey' | 'night';
export type FontKey = 'lora' | 'garamond' | 'playfair' | 'times';

export interface LanguageInfo {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
];

// Levels available per language — must match the content pipeline exactly.
export const LEVELS_BY_LANG: Record<LanguageCode, LanguageLevel[]> = {
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

export const THEMES: { key: ThemeKey; label: string }[] = [
  { key: 'white', label: 'Press White' },
  { key: 'cream', label: 'Newsprint' },
  { key: 'softGrey', label: 'Slate' },
  { key: 'night', label: 'Midnight' },
];

export const FONTS: { key: FontKey; label: string; cssVar: string }[] = [
  { key: 'lora', label: 'Lora', cssVar: '--font-lora' },
  { key: 'garamond', label: 'EB Garamond', cssVar: '--font-garamond' },
  { key: 'playfair', label: 'Playfair Display', cssVar: '--font-playfair' },
  { key: 'times', label: 'Georgia', cssVar: '--font-times' },
];

export const DEFAULTS = {
  theme: 'cream' as ThemeKey,
  language: 'en' as LanguageCode,
  level: 'A2' as LanguageLevel,
  font: 'lora' as FontKey,
};

export function langInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

// Cloudflare Worker — same content source the iOS app reads, filtered
// server-side to a single language/level slice. Public, CORS-enabled, no key.
export const WORKER_BASE = 'https://bilinguist-brief.williamdiggz.workers.dev';

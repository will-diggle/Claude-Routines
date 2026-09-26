// Per-language strings and flag artwork from the iPhone app, so the phone
// replica on the login page reads exactly like the app in every language.
// Sources: BriefingScreen.tsx (NATIVE_WORD, LANG_CITY_NATIVE, LANG_LOCALE,
// PUBLISHED_PREFIX, TAGLINES), LanguageBriefingSection.tsx (BRIEF_PUBLISHED)
// and FlagCircle.tsx (flag designs).

// Every language the app knows, in the app's own order (useSettingsStore's
// ALL_LANGUAGES). Which of them have content today comes from the content
// Worker's /latest/available, not from this list.
export type AppLang = 'fr' | 'de' | 'sv' | 'en' | 'it' | 'es' | 'pt' | 'tr' | 'hu' | 'ar';

export const APP_LANGUAGES: { code: AppLang; nativeName: string; defaultLevel: string }[] = [
  { code: 'fr', nativeName: 'Français', defaultLevel: 'B2' },
  { code: 'de', nativeName: 'Deutsch', defaultLevel: 'A2' },
  { code: 'sv', nativeName: 'Svenska', defaultLevel: 'B2' },
  { code: 'en', nativeName: 'English', defaultLevel: 'B2' },
  { code: 'it', nativeName: 'Italiano', defaultLevel: 'A1' },
  { code: 'es', nativeName: 'Español', defaultLevel: 'A2' },
  { code: 'pt', nativeName: 'Português', defaultLevel: 'A2' },
  { code: 'tr', nativeName: 'Türkçe', defaultLevel: 'A1' },
  { code: 'hu', nativeName: 'Magyar', defaultLevel: 'Native' },
  { code: 'ar', nativeName: 'العربية', defaultLevel: 'A1' },
];

// Used only if /latest/available can't be reached: what the pipeline
// (bilinguist_write.py) publishes at concise length as of 26 Sept 2026.
const ALL_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];
export const FALLBACK_AVAILABLE: Partial<Record<AppLang, Record<string, string[]>>> = {
  fr: { short: ALL_CEFR, longer: ['B1', 'Native'] },
  de: { short: ALL_CEFR, longer: ['A2', 'Native'] },
  en: { short: ['Native'], longer: ['Native'] },
  es: { short: ALL_CEFR, longer: ['Native'] },
};

export const NATIVE_WORD: Partial<Record<AppLang, string>> = {
  en: 'Native', fr: 'Natif', de: 'Mutterspr.', es: 'Nativo', pt: 'Nativo', it: 'Madrelingua',
  sv: 'Modersmål', tr: 'Yerel', hu: 'Anyanyelvi',
};

export const CITY: Record<AppLang, string> = {
  en: 'London', fr: 'Paris', de: 'Berlin', es: 'Madrid', pt: 'Brasil', it: 'Roma',
  sv: 'Stockholm', tr: 'Ankara', hu: 'Budapest', ar: 'الرياض',
};

export const LOCALE: Record<AppLang, string> = {
  en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', pt: 'pt-BR', it: 'it-IT',
  sv: 'sv-SE', tr: 'tr-TR', hu: 'hu-HU', ar: 'ar-SA',
};

export const PUBLISHED_PREFIX: Record<AppLang, string> = {
  en: 'Published', fr: 'Publié le', de: 'Veröffentlicht am', es: 'Publicado el', pt: 'Publicado em',
  it: 'Pubblicato il', sv: 'Publicerad', tr: 'Yayınlandı', hu: 'Közzétéve', ar: 'نُشر في',
};

export const BRIEF_PUBLISHED: Record<AppLang, string> = {
  en: 'Brief published', fr: 'Brief publié', de: 'Brief veröffentlicht', it: 'Brief pubblicato',
  es: 'Brief publicado', pt: 'Brief publicado', sv: 'Brief publicerat', tr: 'Brief yayınlandı', hu: 'Brief közzétéve',
  ar: 'نُشر البريف',
};

export const TAGLINE: Partial<Record<AppLang, string>> = {
  en: 'Your daily brief', fr: 'Votre brief quotidien', de: 'Ihr tägliches Briefing',
  es: 'Su brief diario', it: 'Il tuo brief quotidiano', sv: 'Din dagliga brief',
  tr: 'Günlük brifinginiz', hu: 'Napi briefinged', ar: 'نشرتك اليومية',
};

// "ENGLISH · B2", or "ENGLISH · C1 / NATIVE" for native editions, as the app writes it.
export function levelLabel(lang: AppLang, level: string, nativeGrade?: string): string {
  return level === 'Native' ? `${nativeGrade ?? 'C1'} / ${NATIVE_WORD[lang] ?? 'Native'}` : level;
}

// FlagCircle.tsx's simplified flags, as a 100×100 SVG clipped to a circle.
export function flagSvg(code: AppLang): string {
  const r = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const h3 = (a: string, b: string, c: string) => r(0, 0, 100, 34, a) + r(0, 33.3, 100, 34, b) + r(0, 66.6, 100, 33.4, c);
  const v3 = (a: string, b: string, c: string) => r(0, 0, 34, 100, a) + r(33.3, 0, 34, 100, b) + r(66.6, 0, 33.4, 100, c);
  let inner: string;
  switch (code) {
    case 'fr': inner = v3('#002395', '#FFFFFF', '#ED2939'); break;
    case 'de': inner = h3('#000000', '#DD0000', '#FFCE00'); break;
    case 'it': inner = v3('#009246', '#FFFFFF', '#CE2B37'); break;
    case 'es': inner = r(0, 0, 100, 25, '#AA151B') + r(0, 25, 100, 50, '#F1BF00') + r(0, 75, 100, 25, '#AA151B'); break;
    case 'hu': inner = h3('#CE2939', '#FFFFFF', '#477050'); break;
    case 'sv': inner = r(0, 0, 100, 100, '#006AA7') + r(0, 37.5, 100, 25, '#FECC02') + r(30, 0, 25, 100, '#FECC02'); break;
    case 'tr': inner = r(0, 0, 100, 100, '#E30A17') + '<circle cx="34.5" cy="50" r="22.5" fill="#FFFFFF"/><circle cx="42" cy="50" r="20" fill="#E30A17"/>'; break;
    case 'pt': inner = r(0, 0, 100, 100, '#009C3B') + '<rect x="12.5" y="22.5" width="75" height="55" rx="4" fill="#FFDF00"/><circle cx="50" cy="50" r="19" fill="#002776"/>' + r(31, 45, 38, 10, '#FFFFFF'); break;
    case 'ar': inner = r(25, 0, 75, 34, '#009A44') + r(25, 33.3, 75, 34, '#FFFFFF') + r(25, 66.6, 75, 33.4, '#231F20') + r(0, 0, 25, 100, '#EF3340'); break;
    case 'en':
    default:
      inner = r(0, 0, 100, 100, '#012169') + r(0, 37.5, 100, 25, '#FFFFFF') + r(37.5, 0, 25, 100, '#FFFFFF')
        + r(0, 42.5, 100, 15, '#C8102E') + r(42.5, 0, 15, 100, '#C8102E');
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${inner}</svg>`;
}

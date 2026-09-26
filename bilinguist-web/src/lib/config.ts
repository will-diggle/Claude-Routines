// Mirrors bilinguist-brief/src/store/useSettingsStore.ts — single source of
// truth for language/level/font options, kept in sync with the app.

export type LanguageCode = 'fr' | 'de' | 'en' | 'sv' | 'it' | 'es' | 'tr' | 'hu' | 'ar';
export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
export type ThemeKey = 'white' | 'cream' | 'softGrey' | 'night';
export type FontKey = 'lora' | 'garamond' | 'playfair' | 'times';
export type ReadLength = 'short' | 'longer';

// The iPhone app's numeric App Store ID (the digits in its apps.apple.com
// link). Empty until the listing is live: badges show "Coming soon" and
// Safari's Smart App Banner stays off. Once set, the App Store page itself
// offers "Get" or "Open" depending on whether the app is installed.
export const APP_STORE_ID = '';
export const APP_STORE_URL = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : '';

// The app's URL scheme (app.json "scheme") — opens the installed app.
export const APP_SCHEME_URL = 'bilinguistbrief://';

// What a signed-in free account reads, matching the paywall's Free column:
// English only, one World News article in full, plus five teaser headlines.
// B2 / short is what the app itself opens on by default.
export const FREE_EDITION = {
  language: 'en' as const,
  level: 'B2' as const,
  length: 'short' as const,
  fullGenre: 'GLOBAL NEWS',
  teasers: 5,
};

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
  theme: 'white' as ThemeKey,
  language: 'en' as LanguageCode,
  level: 'A2' as LanguageLevel,
  font: 'lora' as FontKey,
  length: 'longer' as ReadLength,
};

export function langInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

// Length pill labels, localized per target language — matches
// SettingsScreen.tsx's LENGTH_LABELS (Concise/Long, no "medium" in the UI).
export const LENGTH_LABELS: Partial<Record<LanguageCode, [string, string]>> = {
  en: ['Concise', 'Long'],
  fr: ['Concis', 'Long'],
  de: ['Kurz', 'Lang'],
  sv: ['Kort', 'Lång'],
  it: ['Conciso', 'Lungo'],
  es: ['Conciso', 'Extenso'],
  tr: ['Kısa', 'Uzun'],
  hu: ['Rövid', 'Hosszú'],
  ar: ['موجز', 'طويل'],
};

// Genre labels translated per language — mirrors GENRE_LABELS in
// LanguageBriefingSection.tsx. Keys match the genre strings the API returns.
export const GENRE_LABELS: Record<string, Partial<Record<LanguageCode, string>>> = {
  'GLOBAL NEWS':          { en: 'GLOBAL NEWS',        fr: 'ACTUALITÉS MONDIALES',  de: 'WELTNACHRICHTEN',        es: 'NOTICIAS MUNDIALES',   it: 'NOTIZIE MONDIALI',    sv: 'VÄRLDSNYHETER',      hu: 'VILÁGHÍREK',      ar: 'أخبار عالمية' },
  'UK POLITICS':          { en: 'UK POLITICS',        fr: 'POLITIQUE BRITANNIQUE', de: 'BRITISCHE POLITIK',      es: 'POLÍTICA BRITÁNICA',   it: 'POLITICA BRITANNICA', sv: 'BRITTISK POLITIK',   hu: 'BRIT POLITIKA',   ar: 'السياسة البريطانية' },
  'POLITICS':             { en: 'POLITICS',           fr: 'POLITIQUE',             de: 'POLITIK',                es: 'POLÍTICA',             it: 'POLITICA',            sv: 'POLITIK',            hu: 'POLITIKA',        ar: 'السياسة' },
  'BUSINESS & ECONOMY':   { en: 'BUSINESS & ECONOMY', fr: 'ÉCONOMIE',              de: 'WIRTSCHAFT',             es: 'ECONOMÍA',             it: 'ECONOMIA',            sv: 'EKONOMI',            hu: 'GAZDASÁG',        ar: 'الاقتصاد' },
  'SCIENCE & TECHNOLOGY': { en: 'SCIENCES & TECH',    fr: 'SCIENCES & TECH',       de: 'WISSENSCHAFT & TECHNIK', es: 'CIENCIA & TECNOLOGÍA', it: 'SCIENZA & TECNICA',   sv: 'VETENSKAP & TEKNIK', hu: 'TUDOMÁNY & TECH', ar: 'العلوم والتكنولوجيا' },
  'ARTS & CULTURE':       { en: 'ARTS & CULTURE',     fr: 'ARTS & CULTURE',        de: 'KUNST & KULTUR',         es: 'ARTES & CULTURA',      it: 'ARTI & CULTURA',      sv: 'KULTUR',             hu: 'KULTÚRA',         ar: 'الفنون والثقافة' },
  'ASIA':                 { en: 'ASIA',               fr: 'ASIE',                  de: 'ASIEN',                  es: 'ASIA',                 it: 'ASIA',                sv: 'ASIEN',              hu: 'ÁZSIA',           ar: 'آسيا' },
  'EUROPE':               { en: 'EUROPE',             fr: 'EUROPE',                de: 'EUROPA',                 es: 'EUROPA',               it: 'EUROPA',              sv: 'EUROPA',             hu: 'EURÓPA',          ar: 'أوروبا' },
  'MIDDLE EAST':          { en: 'MIDDLE EAST',        fr: 'MOYEN-ORIENT',          de: 'NAHER OSTEN',            es: 'ORIENTE MEDIO',        it: 'MEDIO ORIENTE',       sv: 'MELLANÖSTERN',       hu: 'KÖZEL-KELET',     ar: 'الشرق الأوسط' },
  'AFRICA':               { en: 'AFRICA',             fr: 'AFRIQUE',               de: 'AFRIKA',                 es: 'ÁFRICA',               it: 'AFRICA',              sv: 'AFRIKA',             hu: 'AFRIKA',          ar: 'أفريقيا' },
  'GOOD NEWS':            { en: 'GOOD NEWS',          fr: 'BONNES NOUVELLES',      de: 'GUTE NACHRICHTEN',       es: 'BUENAS NOTICIAS',      it: 'BUONE NOTIZIE',       sv: 'GODA NYHETER',       hu: 'JÓ HÍREK',        ar: 'أخبار سارة' },
};

export const GENRE_COLORS: Record<string, string> = {
  'GLOBAL NEWS': '#4A6FA5',
  'UK POLITICS': '#8B1A1A',
  'POLITICS': '#8B1A1A',
  'BUSINESS & ECONOMY': '#1E6B3A',
  'SCIENCE & TECHNOLOGY': '#005F73',
  'ARTS & CULTURE': '#6A1B9A',
  'ASIA': '#7B4F3A',
  'EUROPE': '#3D5A80',
  'MIDDLE EAST': '#8B5E3C',
  'AFRICA': '#9B6B0C',
  'GOOD NEWS': '#2E7D32',
  'SPORT': '#4A3B8F',
};

export function translateGenre(genre: string, lang: LanguageCode): string {
  const key = genre.toUpperCase();
  return GENRE_LABELS[key]?.[lang] ?? key;
}

export function genreColor(genre: string): string {
  return GENRE_COLORS[genre.toUpperCase()] ?? '#3D3D3D';
}

// Loading-screen phrase pool — ported from SplashOverlay.tsx's PHRASE_POOL.
export const PHRASE_POOL: Partial<Record<LanguageCode, string[]>> = {
  en: ['Hello', 'Good morning', 'Good afternoon', 'Good evening', 'Welcome', 'Your daily brief', "Today's news", 'Hi there', 'Good to see you', 'Breaking news', 'Just in', 'Top stories', "Today's headlines", 'World news', 'Urgent update'],
  fr: ['Bonjour', 'Bonsoir', 'Salut', 'Bienvenue', 'Bon après-midi', 'Votre brief du jour', 'Les actualités du jour', 'Ravi de vous voir', 'Dernière heure', 'Infos du jour', 'Flash info', 'Actualités mondiales', 'À la une'],
  de: ['Hallo', 'Guten Morgen', 'Guten Tag', 'Servus', 'Willkommen', 'Guten Abend', 'Ihr täglicher Brief', 'Schön, Sie zu sehen', 'Eilmeldung', 'Aktuelle Nachrichten', 'Tagesschau', 'Wichtige Neuigkeiten', 'Schlagzeilen'],
  sv: ['Hej', 'God morgon', 'God eftermiddag', 'Välkommen', 'Hej hej', 'Dagens nyheter', 'God kväll', 'Senaste nytt', 'Viktiga nyheter', 'Breaking news', 'Toppnyheter', 'Världsnyheter'],
  it: ['Ciao', 'Buongiorno', 'Benvenuto', 'Buona sera', 'Salve', 'Le notizie di oggi', 'Ben trovato', 'Ultime notizie', 'Notizie importanti', 'In primo piano', 'Notizie dal mondo', 'Flash notizie'],
  es: ['Hola', 'Buenos días', 'Buenas tardes', 'Bienvenido', 'Buenas noches', 'Las noticias de hoy', 'Qué tal', 'Noticias de última hora', 'Noticias importantes', 'Titulares del día', 'Noticias del mundo', 'Urgente'],
  tr: ['Merhaba', 'Günaydın', 'Hoş geldiniz', 'İyi akşamlar', 'Selam', 'Günlük haberler', 'Nasılsınız', 'Son dakika', 'Önemli haberler', 'Günün haberleri', 'Dünya haberleri', 'Acil haber'],
  hu: ['Helló', 'Jó reggelt', 'Jó napot', 'Üdvözöljük', 'Jó estét', 'A mai hírek', 'Viszontlátásra', 'Friss hírek', 'Fontos hírek', 'Mai főcímek', 'Világhírek'],
  ar: ['مرحباً', 'صباح الخير', 'مساء الخير', 'أهلاً وسهلاً', 'أخبار اليوم', 'عاجل', 'آخر الأخبار', 'أهم الأخبار', 'عناوين اليوم'],
};

// Promo codes — mirrors useSubscriptionStore.ts's PROMO_CODES exactly.
// Purely cosmetic on the site (matching the app, which also has no live
// payment processing wired up yet): applying a code just shows the label.
export const PROMO_CODES: Record<string, string> = {
  EARLYBIRD: 'Early Bird',
  FOUNDER: 'Founder',
  BILINGUIST: 'Bilinguist',
};

// Cloudflare Worker — same content source the iOS app reads, filtered
// server-side to a single language/level slice. Public, CORS-enabled, no key.
export const WORKER_BASE = 'https://bilinguist-brief.williamdiggz.workers.dev';

// Fallback subscription price shown before /api/locale-price resolves (or if
// it's unreachable, e.g. local `astro preview` without the Worker running).
// The Worker picks the real one from the visitor's country at the edge.
export const DEFAULT_PRICE = { currency: 'GBP', symbol: '£', amount: '3.99' };

import {
  DEFAULTS,
  FONTS,
  LEVELS_BY_LANG,
  type FontKey,
  type LanguageCode,
  type LanguageLevel,
  type ThemeKey,
} from './config';

const STORAGE_KEY = 'bilinguist-web-preferences';

export interface Preferences {
  theme: ThemeKey;
  language: LanguageCode;
  level: LanguageLevel;
  font: FontKey;
}

function isValidPrefs(v: unknown): v is Preferences {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.theme === 'string' &&
    typeof p.language === 'string' &&
    typeof p.level === 'string' &&
    typeof p.font === 'string'
  );
}

export function loadPreferences(): Preferences {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!isValidPrefs(parsed)) return { ...DEFAULTS };
    // Guard against a stored level that's no longer valid for the stored language.
    const validLevels = LEVELS_BY_LANG[parsed.language as LanguageCode];
    if (!validLevels || !validLevels.includes(parsed.level as LanguageLevel)) {
      parsed.level = validLevels?.[0] ?? DEFAULTS.level;
    }
    return parsed;
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(prefs: Preferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private browsing, quota) — preference just won't persist.
  }
}

export function applyTheme(theme: ThemeKey): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function applyFont(font: FontKey): void {
  const entry = FONTS.find((f) => f.key === font) ?? FONTS[0];
  document.documentElement.style.setProperty(
    '--font-body-family',
    `var(${entry.cssVar})`,
  );
}

export function applyPreferences(prefs: Preferences): void {
  applyTheme(prefs.theme);
  applyFont(prefs.font);
}

// Inline, dependency-free version of the above, for the pre-hydration
// bootstrap script that runs in <head> to prevent a flash of default theme.
export const BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem('${STORAGE_KEY}');
    var prefs = raw ? JSON.parse(raw) : null;
    var theme = (prefs && prefs.theme) || '${DEFAULTS.theme}';
    var font = (prefs && prefs.font) || '${DEFAULTS.font}';
    var fontVarMap = { lora: '--font-lora', garamond: '--font-garamond', playfair: '--font-playfair', times: '--font-times' };
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--font-body-family', 'var(' + (fontVarMap[font] || '--font-lora') + ')');
  } catch (e) {}
})();
`;

import { FREE_EDITION, type LanguageCode } from './config';

// A free reader's choices: the one language they read besides English, and
// the extra section. The app keeps these on the phone, so the website keeps
// its own copy in the browser (same rules, not synced).

const STORAGE_KEY = 'bilinguist-web-free-picks';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FreePicks {
  secondLanguage: LanguageCode | null;
  secondLanguageSetAt: number | null;
  extraSection: string;
}

const DEFAULT_PICKS: FreePicks = {
  secondLanguage: null,
  secondLanguageSetAt: null,
  extraSection: FREE_EDITION.extraSections[0].key,
};

export function loadFreePicks(): FreePicks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PICKS };
    const p = JSON.parse(raw);
    return {
      secondLanguage: typeof p.secondLanguage === 'string' ? p.secondLanguage : null,
      secondLanguageSetAt: typeof p.secondLanguageSetAt === 'number' ? p.secondLanguageSetAt : null,
      extraSection: FREE_EDITION.extraSections.some((s) => s.key === p.extraSection)
        ? p.extraSection
        : DEFAULT_PICKS.extraSection,
    };
  } catch {
    return { ...DEFAULT_PICKS };
  }
}

export function saveFreePicks(picks: FreePicks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
  } catch {
    // storage unavailable — the choice just won't persist
  }
}

// When a free reader may next pick a different second language (null = now).
export function secondLanguageLockedUntil(picks: FreePicks, now = Date.now()): Date | null {
  if (!picks.secondLanguage || picks.secondLanguageSetAt === null) return null;
  const until = picks.secondLanguageSetAt + FREE_EDITION.secondLanguageCooldownDays * DAY_MS;
  return until > now ? new Date(until) : null;
}

export function canReadLanguage(picks: FreePicks, code: LanguageCode): boolean {
  return code === 'en' || code === picks.secondLanguage;
}

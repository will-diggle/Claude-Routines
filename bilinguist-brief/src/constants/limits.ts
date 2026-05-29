/**
 * Adjustable per-user usage caps.
 * Change these values when moving to a higher pricing tier.
 */

/** ElevenLabs word-pronunciation plays per user per calendar month. */
export const MONTHLY_AUDIO_CAP = 1_000;

/**
 * DeepL word-translation lookups per user per calendar month.
 * DeepL Free tier covers 500 k chars/month; at ~6 chars/word
 * this is ~83 k lookups before the free tier is exhausted.
 * Set a conservative cap so one power-user can't exhaust a shared key.
 */
export const MONTHLY_TRANSLATION_CAP = 1_000;

import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

// ─── Trial-stage audio allowlist ──────────────────────────────────────────────
//
// Audio pronunciation is enabled for all supported languages at any level/genre.
// The API key check and monthly cap are the effective guards.
// Narrow this list down if you want to restrict audio to specific combos.

interface AudioAllowCombo {
  language: LanguageCode;
  level?: LanguageLevel;
  genre?: string; // uppercase genre string, e.g. 'GLOBAL NEWS'
}

const AUDIO_TRIAL_ALLOWLIST: AudioAllowCombo[] = [
  { language: 'fr' },
  { language: 'en' },
  { language: 'de' },
  { language: 'sv' },
  { language: 'it' },
  { language: 'es' },
];

/**
 * Returns true if audio pronunciation should be available for this combination.
 * `genre` is the article genre in uppercase (e.g. 'GLOBAL NEWS'). Pass undefined
 * if genre is not known — any combo that requires a specific genre will fail.
 */
export function isAudioAllowed(
  language: LanguageCode,
  level: LanguageLevel,
  genre?: string,
): boolean {
  return AUDIO_TRIAL_ALLOWLIST.some((combo) => {
    if (combo.language !== language) return false;
    if (combo.level !== undefined && combo.level !== level) return false;
    if (combo.genre !== undefined && combo.genre !== genre?.toUpperCase()) return false;
    return true;
  });
}

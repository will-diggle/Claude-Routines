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

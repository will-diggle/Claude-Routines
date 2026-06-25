import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

let _ph: PostHog | null = null;

export function initAnalytics(): void {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  if (!apiKey) return;
  try {
    _ph = new PostHog(apiKey, { host: 'https://eu.posthog.com' });
    // Global super-properties attached to every event automatically
    _ph.register({
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? '0.0.0',
    });
  } catch (e) {
    console.warn('[analytics] PostHog init failed:', e);
  }
}

function ph(): PostHog | null {
  return _ph;
}

export function identifyUser(distinctId: string, properties?: Record<string, unknown>): void {
  ph()?.identify(distinctId, properties);
}

export function resetIdentity(): void {
  ph()?.reset();
}

export function setSuperProperties(props: Record<string, unknown>): void {
  ph()?.register(props);
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

/** Fired once on cold start. languages_active and days_streak give a snapshot
 *  of the user's engagement at the moment they open the app. */
export function trackAppOpened(
  languagesActive: string[],
  daysStreak: Record<string, number>,
): void {
  ph()?.capture('app_opened', {
    languages_active: languagesActive,
    days_streak: daysStreak,
  });
}

export function trackUserSignedUp(): void {
  ph()?.capture('user_signed_up');
}

export function trackUserLoggedIn(): void {
  ph()?.capture('user_logged_in');
}

export function trackAnonymousSessionStarted(): void {
  ph()?.capture('anonymous_session_started');
}

// ── Reading ───────────────────────────────────────────────────────────────────

/** Fired every time the user swipes to (or first opens) a language page. */
export function trackBriefOpened(language: string, level: string, date: string): void {
  ph()?.capture('brief_opened', { language, level, date });
}

/** Fired when the user has scrolled ≥80% AND spent ≥20 s on a brief.
 *  scroll_percent is the max scroll depth reached (0–100).
 *  time_spent_seconds is accumulated reading time for today. */
export function trackBriefCompleted(
  language: string,
  level: string,
  scrollPercent: number,
  timeSpentSeconds: number,
): void {
  ph()?.capture('brief_completed', {
    language,
    level,
    scroll_percent: scrollPercent,
    time_spent_seconds: timeSpentSeconds,
  });
}

// ── Word interactions ─────────────────────────────────────────────────────────

/** Fired when WordPopup opens. dictionary_hit = true when the word was already
 *  in the Supabase dictionary (instant), false when a live AI call was needed. */
export function trackWordTapped(
  word: string,
  language: string,
  level: string,
  dictionaryHit: boolean,
): void {
  ph()?.capture('word_tapped', { word, language, level, dictionary_hit: dictionaryHit });
}

/** Fired when the user saves a word to their word bank. */
export function trackWordSaved(word: string, language: string, level: string): void {
  ph()?.capture('word_saved', { word, language, level });
}

/** Fired when the user opens the full grammar/explanation card ("Tell me more"). */
export function trackTellMeMoreOpened(word: string, language: string, level: string): void {
  ph()?.capture('tell_me_more_opened', { word, language, level });
}

/** Fired when TTS audio starts playing for a word. */
export function trackAudioPlayed(word: string, language: string): void {
  ph()?.capture('audio_played', { word, language });
}

// ── Streaks ───────────────────────────────────────────────────────────────────

export function trackStreakIncremented(language: string, newStreakCount: number): void {
  ph()?.capture('streak_incremented', { language, new_streak_count: newStreakCount });
}

export function trackStreakLost(language: string, streakCountLost: number): void {
  ph()?.capture('streak_lost', { language, streak_count_lost: streakCountLost });
}

export function trackStreakFreezeUsed(language: string): void {
  ph()?.capture('streak_freeze_used', { language });
}

export function trackAllLanguagesRead(languageCount: number): void {
  ph()?.capture('all_languages_read', { language_count: languageCount });
}

// ── Games ─────────────────────────────────────────────────────────────────────

/** Fired when a game screen gains focus (once per session, not per question). */
export function trackGameOpened(gameName: string, language: string): void {
  ph()?.capture('game_opened', { game_name: gameName, language });
}

/** Fired when the results screen appears at the end of a game. */
export function trackGameCompleted(gameName: string, language: string, score: number): void {
  ph()?.capture('game_completed', { game_name: gameName, language, score });
}

// ── Settings ──────────────────────────────────────────────────────────────────

/** Fired when the user activates a language in preferences. */
export function trackLanguageSelected(language: string): void {
  ph()?.capture('language_selected', { language });
}

/** Fired when the user picks a CEFR level (or Native) for a language. */
export function trackLevelSelected(language: string, level: string): void {
  ph()?.capture('level_selected', { language, level });
}

// ── Kept for backward compatibility / internal uses ───────────────────────────

export function trackLanguageAdded(language: string): void {
  ph()?.capture('language_added', { language });
}

export function trackLanguageRemoved(language: string): void {
  ph()?.capture('language_removed', { language });
}

export function trackBriefLengthChanged(language: string, newLength: string): void {
  ph()?.capture('brief_length_changed', { language, new_length: newLength });
}

export function trackArticleTapped(language: string): void {
  ph()?.capture('article_tapped', { language });
}

// ── Subscription ──────────────────────────────────────────────────────────────

export function trackPaywallShown(): void {
  ph()?.capture('paywall_shown');
}

export function trackSubscriptionStarted(plan: string): void {
  ph()?.capture('subscription_started', { plan });
}

export function trackSubscriptionCancelled(): void {
  ph()?.capture('subscription_cancelled');
}

import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

let _ph: PostHog | null = null;

export function initAnalytics(): void {
  // .trim() guards against a corrupted EAS env var value (e.g. a leading
  // newline), which otherwise gets passed straight into `new PostHog(...)`
  // and silently breaks auth — same defensive pattern already used for
  // EXPO_PUBLIC_OWM_KEY in WeatherCard.tsx.
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim();
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
  ph()?.identify(distinctId, properties as any);
}

export function resetIdentity(): void {
  ph()?.reset();
}

export function setSuperProperties(props: Record<string, unknown>): void {
  ph()?.register(props as any);
}

/** Unlike setSuperProperties (attached to every future EVENT sent from this
 *  device), this updates the PERSON profile itself — what "which font/
 *  background/icon do people currently use across the whole user base"
 *  needs: a snapshot of current state, queryable directly off the person,
 *  not derived by counting change-events. reloadFeatureFlags is off since
 *  these are incidental settings taps, not moments where fresh flags matter. */
export function setPersonProperties(props: Record<string, unknown>): void {
  ph()?.setPersonProperties(props as any, undefined, false);
}

/** Fired on every navigation state change whose active route name differs
 *  from the previous one — PostHog's dedicated screen-view event, distinct
 *  from capture(). @react-navigation/native v7 removed the auto-tracking
 *  hook PostHogProvider used to rely on (navigationRef), so this is wired
 *  manually via NavigationContainer's onStateChange (see App.tsx) rather
 *  than through PostHogProvider's autocapture — the officially recommended
 *  replacement per posthog-react-native's own v7 migration notes. */
export function trackScreenView(routeName: string): void {
  ph()?.screen(routeName);
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

/** Fired when the user turns a genre/topic on or off for a language. */
export function trackTopicToggled(topic: string, enabled: boolean): void {
  ph()?.capture('topic_toggled', { topic, enabled });
}

/** Fired when the user picks a CEFR level (or Native) for a language. */
export function trackLevelSelected(language: string, level: string): void {
  ph()?.capture('level_selected', { language, level });
}

// ── Design preferences ───────────────────────────────────────────────────────
// These four were previously untracked entirely. Each pairs a change-event
// (so change frequency is visible) with a person property (so current
// distribution across the whole user base is visible without waiting for
// someone to touch the setting again) — see setPersonProperties above.

/** Fired when the user changes their reading font. */
export function trackFontChanged(fontFamily: string): void {
  ph()?.capture('font_changed', { font_family: fontFamily });
  setPersonProperties({ font_family: fontFamily });
}

/** Fired when the user changes their background/theme. Takes
 *  manualBackground — the user's actual choice — not the transient
 *  `background` value Auto Night Mode may currently have it overridden to.
 *  See useSettingsStore's manualBackground doc comment. */
export function trackBackgroundChanged(manualBackground: string): void {
  ph()?.capture('background_changed', { manual_background: manualBackground });
  setPersonProperties({ manual_background: manualBackground });
}

/** Fired when the user toggles Auto Night Mode. Also captures the iOS
 *  system color scheme alongside it, since the feature follows iOS
 *  appearance, not a sunrise/sunset schedule. */
export function trackAutoNightModeChanged(enabled: boolean, systemColorScheme: 'light' | 'dark' | null): void {
  ph()?.capture('auto_night_mode_changed', { enabled, system_color_scheme: systemColorScheme });
  setPersonProperties({ auto_night_mode: enabled, system_color_scheme: systemColorScheme });
}

/** Fired when the user changes their app icon. appIcon is null for the
 *  default ("White") icon. */
export function trackAppIconChanged(appIcon: string | null): void {
  const value = appIcon ?? 'White';
  ph()?.capture('app_icon_changed', { app_icon: value });
  setPersonProperties({ app_icon: value });
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

/** Fired when the user toggles spelled-out numbers, e.g. "20 (twenty)", on or off for a language. */
export function trackWrittenNumbersChanged(language: string, enabled: boolean): void {
  ph()?.capture('written_numbers_changed', { language, enabled });
}

/** genre is the article's own genre (GLOBAL NEWS, UK, EU, US, BUSINESS &
 *  ECONOMY) — a brief spans multiple genres, so this is the only reliable
 *  place to derive per-genre engagement from, not trackBriefOpened/Completed
 *  which are per-language/level and know nothing about genre mix. */
export function trackArticleTapped(language: string, genre?: string): void {
  ph()?.capture('article_tapped', { language, genre: genre ?? null });
}

/** Fired once per article per session when that SPECIFIC article (not the
 *  whole brief) has been ≥90% visible on screen at some point, gated by the
 *  same ≥30s reading-time-on-page threshold trackBriefCompleted uses — see
 *  BriefingScreen's maybeCredit. brief_completed is a whole-language-edition
 *  event and can't answer "which genres actually get read to completion";
 *  this is the per-article signal that can. */
export function trackArticleRead(language: string, genre?: string): void {
  ph()?.capture('article_read', { language, genre: genre ?? null });
}

/** Fired when the user opens the weather detail modal — the only tracked
 *  weather interaction; the widget had zero analytics coverage before this. */
export function trackWeatherOpened(language: string): void {
  ph()?.capture('weather_opened', { language });
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

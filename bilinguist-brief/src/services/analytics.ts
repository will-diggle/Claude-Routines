import PostHog from 'posthog-react-native';

let _ph: PostHog | null = null;

export function initAnalytics(): void {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  if (!apiKey) return;
  try {
    _ph = new PostHog(apiKey, { host: 'https://eu.posthog.com' });
  } catch (e) {
    // PostHog can fail in Expo Go if storage isn't ready — analytics silently disabled
    console.warn('[analytics] PostHog init failed:', e);
  }
}

function ph(): PostHog | null {
  return _ph;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function identifyUser(distinctId: string, properties?: Record<string, any>): void {
  ph()?.identify(distinctId, properties);
}

export function resetIdentity(): void {
  ph()?.reset();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSuperProperties(props: Record<string, any>): void {
  ph()?.register(props);
}

// ── Onboarding & Auth ─────────────────────────────────────────────────────────

export function trackAppOpened(coldStart: boolean): void {
  ph()?.capture('app_opened', { cold_start: coldStart });
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

// ── Language & Settings ───────────────────────────────────────────────────────

export function trackLanguageAdded(language: string): void {
  ph()?.capture('language_added', { language });
}

export function trackLanguageRemoved(language: string): void {
  ph()?.capture('language_removed', { language });
}

export function trackLevelChanged(language: string, newLevel: string, oldLevel: string): void {
  ph()?.capture('level_changed', { language, new_level: newLevel, old_level: oldLevel });
}

export function trackBriefLengthChanged(language: string, newLength: string): void {
  ph()?.capture('brief_length_changed', { language, new_length: newLength });
}

// ── Reading ───────────────────────────────────────────────────────────────────

export function trackBriefOpened(language: string): void {
  ph()?.capture('brief_opened', { language });
}

export function trackBriefCompleted(language: string): void {
  ph()?.capture('brief_completed', { language });
}

export function trackArticleTapped(language: string): void {
  ph()?.capture('article_tapped', { language });
}

export function trackWordTapped(language: string, word: string): void {
  ph()?.capture('word_tapped', { language, word });
}

// ── Streaks ───────────────────────────────────────────────────────────────────

export function trackStreakIncremented(language: string, newStreakCount: number): void {
  ph()?.capture('streak_incremented', { language, new_streak_count: newStreakCount });
}

export function trackStreakBroken(language: string, streakCountLost: number): void {
  ph()?.capture('streak_broken', { language, streak_count_lost: streakCountLost });
}

export function trackStreakFrozen(language: string, freezesRemainingThisWeek: number): void {
  ph()?.capture('streak_frozen', { language, freezes_remaining_this_week: freezesRemainingThisWeek });
}

export function trackAllLanguagesRead(languageCount: number): void {
  ph()?.capture('all_languages_read', { language_count: languageCount });
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

// ── Friends (future) ──────────────────────────────────────────────────────────

export function trackFriendRequestSent(): void {
  ph()?.capture('friend_request_sent');
}

export function trackFriendRequestAccepted(): void {
  ph()?.capture('friend_request_accepted');
}

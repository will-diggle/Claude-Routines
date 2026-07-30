// Placeholder shown before the app has fetched live data (or if the fetch
// fails). All-empty so charts render honest "No data" states rather than
// fabricated numbers.
export const EMPTY_ANALYTICS_DATA = {
  range_days: 90,
  generated_at: null as string | null,
  events: {
    brief_completed: [],
    word_tapped: [],
    word_saved: [],
    tell_me_more_opened: [],
    audio_played: [],
    game_opened: [],
    game_completed: [],
    streak_incremented: [],
    streak_lost: [],
    streak_freeze_used: [],
    all_languages_read: [],
    anonymous_session_started: [],
    user_signed_up: [],
    paywall_shown: [],
    subscription_started: [],
  },
};

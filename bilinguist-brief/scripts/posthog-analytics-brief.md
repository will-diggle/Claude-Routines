# Bilinguist Brief — PostHog Analytics Reference

This document covers every event the app sends to PostHog, what properties each carries, and how to slice the data into useful views. Pass this to the dashboard builder.

---

## Global properties on every event

These are automatically attached to **every** event — you can filter or break down any query by them without doing anything extra.

| Property | Values | Description |
|---|---|---|
| `platform` | `ios`, `android` | Device OS |
| `app_version` | e.g. `1.4.2` | App build version |
| `distinct_id` | UUID | PostHog's per-device identifier |

---

## Events catalogue

### App lifecycle

#### `app_opened`
Fired once per cold start.

| Property | Example | Notes |
|---|---|---|
| `languages_active` | `["fr","de"]` | Languages the user has turned on |
| `days_streak` | `{"fr":12,"de":3}` | Current streak per language at open time |

**Useful views:**
- DAU/WAU/MAU — count of `app_opened` unique users over day / week / month
- Retention — cohort of users who fired `app_opened` on day 0, came back on day N
- Streak distribution histogram — bucket `days_streak` values to see how engaged the user base is
- Language mix — breakdown by `languages_active` to see which language combos are most common

---

#### `anonymous_session_started`
Fired when a new user opens the app without an account.

#### `user_signed_up`
Fired on first account creation.

#### `user_logged_in`
Fired on subsequent logins.

**Useful views:**
- Conversion funnel: `anonymous_session_started` → `user_signed_up`
- Login frequency per user

---

### Reading

#### `brief_opened`
Fired every time the user swipes to or first opens a language brief page.

| Property | Example | Notes |
|---|---|---|
| `language` | `fr`, `de`, `es`, `it`, `sv`, `tr`, `hu`, `ar`, `en` | Which language brief was opened |
| `level` | `A1`, `A2`, `B1`, `B2`, `C1`, `native` | User's chosen CEFR level for that language |
| `date` | `2026-07-31` | The brief date (content date, not event date) |

**Useful views:**
- Daily opens per language — e.g. filter `language = fr`, group by day → how many users opened French each day
- Opens by level — filter `language = fr AND level = A1` → how many A1 French readers per week/month
- All languages × all levels matrix — breakdown by `language` then `level` to see which combination is most popular
- Brief date vs event date — compare `date` property with PostHog's `$timestamp` to spot how many people read yesterday's brief today

---

#### `brief_completed`
Fired when the user has scrolled ≥80% **and** spent ≥20 seconds on a brief. This is the core engagement signal.

| Property | Example | Notes |
|---|---|---|
| `language` | `fr` | Language of the brief |
| `level` | `B1` | User's CEFR level |
| `scroll_percent` | `94` | Maximum scroll depth reached (0–100) |
| `time_spent_seconds` | `187` | Accumulated reading time on that brief today |

**Useful views:**
- Completion rate — `brief_completed` ÷ `brief_opened` per language (funnel or formula)
- Completion by level — does A1 French complete more than B2 French?
- Time-on-brief distribution — histogram of `time_spent_seconds` to see how long engaged readers spend
- Scroll depth average — average `scroll_percent` to measure how far people get before leaving
- DAU who completed at least one brief — distinct count of users with a `brief_completed` event per day
- Language × level × day heatmap — e.g. French A1 readers who completed, grouped by calendar day

---

### Word interactions

#### `word_tapped`
Fired when the user taps a highlighted word and the popup opens.

| Property | Example | Notes |
|---|---|---|
| `word` | `approuver` | The word tapped |
| `language` | `fr` | Language of the brief |
| `level` | `B1` | User's level |
| `dictionary_hit` | `true` / `false` | `true` = served from cache instantly; `false` = needed a live AI lookup |

**Useful views:**
- Most tapped words per language — top-N `word` values, filter by `language`
- Cache hit rate — `dictionary_hit = true` count ÷ total `word_tapped` (shows how well the dictionary is pre-populated)
- Words tapped per session — avg `word_tapped` events per user per day
- Level vs curiosity — does B1 tap more words than A1? Breakdown by `level`

---

#### `word_saved`
Fired when the user saves a word to their word bank.

| Property | Example | Notes |
|---|---|---|
| `word` | `approuver` | The saved word |
| `language` | `fr` | Language |
| `level` | `B1` | User's level |

**Useful views:**
- Save rate — `word_saved` ÷ `word_tapped` (what % of tapped words get saved)
- Most saved words per language — top-N word bank additions
- Saves per day per user — engagement depth metric
- Save rate by level — do higher-level users save more or fewer words?

---

#### `tell_me_more_opened`
Fired when the user taps "Tell me more" to open the full grammar card inside WordPopup.

| Property | Example | Notes |
|---|---|---|
| `word` | `approuver` | The word |
| `language` | `fr` | Language |
| `level` | `B1` | Level |

**Useful views:**
- Deep-dive rate — `tell_me_more_opened` ÷ `word_tapped` per language
- Which words attract the most grammar curiosity — top-N by `word`

---

#### `audio_played`
Fired when TTS pronunciation audio plays.

| Property | Example | Notes |
|---|---|---|
| `word` | `approuver` | The word |
| `language` | `fr` | Language |

**Useful views:**
- Audio usage rate — `audio_played` ÷ `word_tapped`
- Which languages use audio most — breakdown by `language`

---

### Streaks

#### `streak_incremented`
Fired when a reading streak increases (user read today and yesterday).

| Property | Example | Notes |
|---|---|---|
| `language` | `fr` | Which language streak went up |
| `new_streak_count` | `13` | The new streak value |

**Useful views:**
- Streak length distribution — histogram of `new_streak_count` across all users
- Average streak per language — which language has the most loyal daily readers
- Long-streak cohorts — filter `new_streak_count >= 7` (weekly), `>= 30` (monthly) to find power users

---

#### `streak_lost`
Fired when a streak resets to 0 (user missed a day).

| Property | Example | Notes |
|---|---|---|
| `language` | `fr` | Which language streak was lost |
| `streak_count_lost` | `12` | How long the streak was before it broke |

**Useful views:**
- Churn risk signal — users who fire `streak_lost` are at risk; how many per day/week?
- Average streak length at break — mean `streak_count_lost` across all events
- Language where streaks break most — breakdown by `language`

---

#### `streak_freeze_used`
Fired when the user uses a streak freeze to protect a streak on a missed day.

| Property | Example | Notes |
|---|---|---|
| `language` | `fr` | Language whose streak was protected |

**Useful views:**
- Freeze usage rate — `streak_freeze_used` ÷ (`streak_lost` + `streak_freeze_used`) shows how many breaks get rescued
- Which language streaks get frozen most

---

#### `all_languages_read`
Fired when the user completes briefs in **all** their active languages on the same day (Full Sweep).

| Property | Example | Notes |
|---|---|---|
| `language_count` | `3` | Number of languages in the sweep |

**Useful views:**
- Daily Full Sweep count — how many users hit this milestone per day
- Multi-language power users — filter `language_count >= 3`

---

### Practice games

#### `game_opened`
Fired once per game session when the game screen gains focus.

| Property | Example | Notes |
|---|---|---|
| `game_name` | `flashcards`, `matching`, `multiple_choice`, `fill_blank`, `translation` | Which game |
| `language` | `fr`, `all` | Language filter the user selected (`all` = mixed) |

**Useful views:**
- Game popularity — count by `game_name`, see which games are played most
- Games per language — which language's word bank gets practised most
- Game opens per user per day — how many practice sessions on average
- Game preference by language — does French drive more flashcard use than German?

---

#### `game_completed`
Fired when the results screen appears at the end of a game.

| Property | Example | Notes |
|---|---|---|
| `game_name` | `flashcards`, `matching`, etc. | Which game |
| `language` | `fr`, `all` | Language filter |
| `score` | `8` | Score achieved (flashcards = correct count; matching = pairs score; etc.) |

**Useful views:**
- Completion rate — `game_completed` ÷ `game_opened` per game (do people quit mid-game?)
- Score distribution — histogram of `score` per game type to see difficulty
- Perfect score rate — filter `score = 10` (flashcards) or `score = 6` (matching) to count perfect runs
- Score improvement over time — per-user avg `score` trend week-over-week
- Most played + best scores by language

---

### Settings & configuration

#### `language_selected`
Fired when the user activates a language in preferences.

| Property | Example | Notes |
|---|---|---|
| `language` | `fr` | Language turned on |

#### `level_selected`
Fired when the user picks a CEFR level for a language.

| Property | Example | Notes |
|---|---|---|
| `language` | `fr` | Language |
| `level` | `A1`, `A2`, `B1`, `B2`, `C1`, `native` | Level chosen |

**Useful views:**
- Level distribution per language — e.g. what % of French users are at each CEFR level
- Level changes over time — do users level up over weeks/months?
- Most popular language additions — which languages get turned on most

#### `language_added` / `language_removed`
Older events tracking language library changes.

#### `brief_length_changed`
Fired when the user changes brief length (short/medium/long).

| Property | Example |
|---|---|
| `language` | `fr` |
| `new_length` | `short`, `medium`, `long` |

#### `article_tapped`
Fired when the user taps the source article link.

| Property | Example |
|---|---|
| `language` | `fr` |

---

### Subscription

#### `paywall_shown`
Fired when the paywall screen appears.

#### `subscription_started`
Fired on successful purchase.

| Property | Example |
|---|---|
| `plan` | `monthly`, `annual` |

#### `subscription_cancelled`
Fired when the user cancels.

**Useful views:**
- Conversion funnel: `paywall_shown` → `subscription_started`
- Plan mix — monthly vs annual split
- Churn rate — `subscription_cancelled` ÷ active subscribers

---

## Recommended PostHog dashboard views

### 1. Daily engagement
- Unique users who fired `brief_completed` (by day)
- Breakdown by `language` — line per language on the same chart
- Add filter options: `level = A1` etc. to drill into a specific cohort

### 2. Reading funnel (per language + level)
Steps: `app_opened` → `brief_opened` → `brief_completed`
Filter by: `language`, `level`, date range

### 3. Language × level grid (Insights → Breakdown)
Event: `brief_completed`
- Breakdown by `language`
- Then secondary breakdown by `level`
- Time range: day / week / month toggle
- This gives you the exact "French A1 readers per week" view

### 4. Word bank engagement
- `word_tapped` count per day (shows reading curiosity)
- `word_saved` count per day
- Ratio = save rate trend

### 5. Streak health
- `streak_incremented` unique users per day (loyal readers)
- `streak_lost` events per day (churn signal)
- Average `new_streak_count` over time

### 6. Game performance
- `game_completed` grouped by `game_name` (bar chart)
- Average `score` per `game_name`
- Perfect-score rate as a formula metric

### 7. Subscription funnel
- `paywall_shown` → `subscription_started`
- Conversion % over time
- Plan breakdown pie

### 8. Level progression
- `level_selected` events — breakdown by `language` and `level`
- Watch for users moving from A1 → A2 over time (signals product value)

---

## How to query a specific example in PostHog

**"How many users read French at A1 level each day/week/month?"**

1. Go to **Insights → Trends**
2. Event: `brief_completed`
3. Add filter: `language = fr`
4. Add filter: `level = A1`
5. Metric: **Unique users**
6. Time range: last 90 days
7. Interval: Day / Week / Month (toggle in the chart)

**"Which words are saved most in German?"**

1. Insights → Trends
2. Event: `word_saved`
3. Filter: `language = de`
4. Breakdown by: `word`
5. Sort descending

**"What % of people who open a brief actually finish it?"**

1. Insights → **Funnels**
2. Step 1: `brief_opened`
3. Step 2: `brief_completed`
4. Filter by `language` or `level` as needed
5. This shows the drop-off % per language/level

---

## Notes for the dashboard builder

- All language codes: `fr` (French), `de` (German), `es` (Spanish), `it` (Italian), `sv` (Swedish), `tr` (Turkish), `hu` (Hungarian), `ar` (Arabic), `en` (English)
- All CEFR levels: `A1`, `A2`, `B1`, `B2`, `C1`, `native`
- All game names: `flashcards`, `matching`, `multiple_choice`, `fill_blank`, `translation`
- The PostHog instance is on the **EU cloud** (`eu.posthog.com`)
- Every event has `platform` (ios/android) and `app_version` available for filtering without extra setup

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { fetchTodayBundle } from './briefingSync';
import type { DailyBundle } from './briefingSync';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {}

// ─── Constants ────────────────────────────────────────────────────────────────

const MORNING_NOTIFICATION_ID = 'daily-briefing';
const STREAK_NOTIFICATION_ID = 'streak-reminder';

// Hour/minute (local time) for the streak reminder — change here to make configurable later.
const STREAK_REMINDER_HOUR = 18;
const STREAK_REMINDER_MINUTE = 0;

// The pipeline reliably finishes by this time each morning (shown as a hint in Settings UI).
export const PIPELINE_READY_TIME = '07:30';

/**
 * Returns the earliest allowed notification time in the device's local timezone.
 * Reference: 06:30 UK local (BST or GMT), which equals 07:30 for EU users (CEST/CET).
 * Uses Intl to detect whether UK is currently in BST (+1) or GMT (+0).
 */
export function getMinNotifTime(): string {
  try {
    const now = new Date();
    // Detect UK's current UTC offset (0 = GMT winter, 1 = BST summer)
    const londonHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(now),
      10,
    );
    const ukOffsetHours = ((londonHour - now.getUTCHours() + 24) % 24);
    // 06:30 UK local expressed as minutes since midnight UTC
    const refUtcMinutes = 6 * 60 + 30 - ukOffsetHours * 60;
    // Shift to device local time
    const deviceOffsetMinutes = -now.getTimezoneOffset();
    const localMinutes = refUtcMinutes + deviceOffsetMinutes;
    const h = Math.floor(localMinutes / 60) % 24;
    const m = localMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } catch {
    return '06:30';
  }
}

// Maps store topic keys to the genre label strings used in brief article data.
const TOPIC_LABELS: Record<string, string> = {
  worldNews:   'Global News',
  ukPolitics:  'UK Politics',
  politics:    'Politics',
  business:    'Business',
  europe:      'Europe',
  scienceTech: 'Science & Tech',
  artsCulture: 'Arts & Culture',
  asia:        'Asia',
  middleEast:  'Middle East',
  africa:      'Africa',
  goodNews:    'Good News',
};

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(hhmm: string): { hour: number; minute: number } | null {
  const parts = hhmm.split(':');
  if (parts.length !== 2) return null;
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// Builds from before the current identifiers existed scheduled their own daily
// notifications, which nothing since has cancelled — they keep firing with text
// frozen at whatever was current then. Clearing everything before rescheduling
// is the only way to reach them, since we can't know what they were called.
async function clearOrphanedSchedules(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const known = new Set([MORNING_NOTIFICATION_ID, STREAK_NOTIFICATION_ID]);
    for (const n of scheduled) {
      if (!known.has(n.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
    }
  } catch {}
}

async function scheduleDaily(
  identifier: string,
  title: string,
  body: string,
  hhmm: string,
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    const time = parseTime(hhmm);
    if (!time) return;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, data: { screen: 'Briefing' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
      },
    });
  } catch {}
}

// Find the first headline in the bundle matching a genre label (case-insensitive),
// checking each active language's nativeJournalism in order.
function findHeadlineForGenre(
  bundle: DailyBundle,
  activeLanguageCodes: string[],
  genreLabel: string,
): string | null {
  const needle = genreLabel.toLowerCase();
  for (const lang of activeLanguageCodes) {
    const lengths = bundle.nativeJournalism?.[lang];
    if (!lengths) continue;
    for (const articles of Object.values(lengths as Record<string, Array<{ genre: string; headline: string }>>)) {
      const match = articles.find((a) => a.genre?.toLowerCase() === needle);
      if (match?.headline) return match.headline;
    }
  }
  return null;
}

// Build streak reminder body with correct English grammar.
function buildStreakBody(langNames: string[]): string {
  if (langNames.length === 1)
    return `Don't lose your ${langNames[0]} streak 🔥 Today's brief is waiting.`;
  if (langNames.length === 2)
    return `Don't lose your ${langNames[0]} and ${langNames[1]} streak 🔥 Today's brief is waiting.`;
  const head = langNames.slice(0, -1).join(', ');
  return `Don't lose your ${head} and ${langNames[langNames.length - 1]} streak 🔥 Today's brief is waiting.`;
}


// ─── Remote push registration ─────────────────────────────────────────────────
// The morning brief can't be delivered locally: it's scheduled in advance, and
// the bundle publishes after the delivery slot, so a local notification always
// carries the previous day's copy. Registering here hands that one over to the
// worker, which sends it once the bundle actually exists — and lets the wording
// change server-side without an app update.

const WORKER_URL = process.env.EXPO_PUBLIC_DATA_URL ?? 'https://bilinguist-brief.williamdiggz.workers.dev';

export async function registerPushToken(
  deliveryTime: string,
  languageCodes: string[],
): Promise<boolean> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return false;

    const res = await fetch(`${WORKER_URL}/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        deliveryTime,
        // Sent so the worker can fire at the reader's own morning rather than UTC.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        languages: languageCodes,
        platform: Platform.OS,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Called when the user turns notifications off, so the row goes away rather
// than lingering until Expo reports the install as gone.
export async function unregisterPushToken(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await fetch(`${WORKER_URL}/push/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {}
}

// ─── Morning brief notification ───────────────────────────────────────────────

export async function scheduleMorningBriefNotification(
  time: string,
  options: {
    topicOrder?: string[];
    topics?: Record<string, boolean>;
    activeLanguageCodes?: string[];
  } = {},
): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    let body = "Today's brief is ready.";

    try {
      const result = await fetchTodayBundle();
      if (result.ok) {
        if (result.bundle.daily_notification) {
          body = result.bundle.daily_notification;
        } else {
          const { topicOrder = [], topics = {}, activeLanguageCodes = [] } = options;
          const topGenreKey = topicOrder.find((k) => topics[k]);
          if (topGenreKey) {
            const genreLabel = TOPIC_LABELS[topGenreKey];
            if (genreLabel) {
              const headline = findHeadlineForGenre(result.bundle, activeLanguageCodes, genreLabel);
              if (headline) body = headline;
            }
          }
        }
      }
    } catch {}

    await scheduleDaily(MORNING_NOTIFICATION_ID, 'Morning Bilingual Briefing ☀️', body, time);
  } catch {}
}

// ─── Streak reminder notification ─────────────────────────────────────────────

export async function scheduleStreakReminder(
  activeLanguages: Array<{ code: string; name: string }>,
  lastReadDates: Record<string, string>,
): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    const today = new Date().toISOString().split('T')[0];
    const unread = activeLanguages.filter((l) => lastReadDates[l.code] !== today);

    if (unread.length === 0 || activeLanguages.length === 0) {
      await Notifications.cancelScheduledNotificationAsync(STREAK_NOTIFICATION_ID).catch(() => {});
      return;
    }

    const body = buildStreakBody(unread.map((l) => l.name));
    const hhmm = `${String(STREAK_REMINDER_HOUR).padStart(2, '0')}:${String(STREAK_REMINDER_MINUTE).padStart(2, '0')}`;
    await scheduleDaily(STREAK_NOTIFICATION_ID, 'Bilinguist Brief', body, hhmm);
  } catch {}
}

// ─── Combined scheduler ───────────────────────────────────────────────────────

// Call on app open and after completing a brief.
export async function scheduleAllNotifications(params: {
  briefingTime: string;
  topicOrder: string[];
  topics: Record<string, boolean>;
  activeLanguages: Array<{ code: string; name: string }>;
  lastReadDates: Record<string, string>;
}): Promise<void> {
  const { briefingTime, topicOrder, topics, activeLanguages, lastReadDates } = params;
  await clearOrphanedSchedules();

  // Hand the morning brief to the server when push is available. Scheduling it
  // locally as well would deliver the same slot twice — once with yesterday's
  // copy — so the local one is only kept as the fallback.
  const pushed = await registerPushToken(briefingTime, activeLanguages.map((l) => l.code));
  if (pushed) {
    await Notifications.cancelScheduledNotificationAsync(MORNING_NOTIFICATION_ID).catch(() => {});
  }

  await Promise.all([
    pushed
      ? Promise.resolve()
      : scheduleMorningBriefNotification(briefingTime, {
          topicOrder,
          topics,
          activeLanguageCodes: activeLanguages.map((l) => l.code),
        }),
    scheduleStreakReminder(activeLanguages, lastReadDates),
  ]);
}

// ─── Keep for compatibility (used by practice notification in Settings) ───────

export async function schedulePracticeNotification(_time: string): Promise<void> {
  // Practice notification removed — was sending personal feedback request
  await Notifications.cancelScheduledNotificationAsync('daily-practice').catch(() => {});
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

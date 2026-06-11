import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { LanguageCode } from '../store/useSettingsStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const BRIEFING_COPY: Record<LanguageCode, { title: string; body: string }> = {
  en: { title: '🇬🇧 Good Morning',  body: 'Your daily news briefing is ready.' },
  fr: { title: '🇫🇷 Bonjour',       body: 'Votre bref d\'actualités quotidien est prêt.' },
  de: { title: '🇩🇪 Guten Morgen',  body: 'Ihr täglicher Nachrichtenüberblick ist bereit.' },
  sv: { title: '🇸🇪 God morgon',    body: 'Din dagliga nyhetssammanfattning är redo.' },
  it: { title: '🇮🇹 Buongiorno',    body: 'Il tuo briefing quotidiano sulle notizie è pronto.' },
  es: { title: '🇪🇸 Buenos días',   body: 'Tu resumen diario de noticias está listo.' },
};

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function parseTime(hhmm: string): { hour: number; minute: number } | null {
  const parts = hhmm.split(':');
  if (parts.length !== 2) return null;
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

async function scheduleDaily(
  identifier: string,
  title: string,
  body: string,
  hhmm: string
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const time = parseTime(hhmm);
  if (!time) return;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
    },
  });
}

export async function scheduleBriefingNotification(
  time: string,
  language: LanguageCode = 'en'
): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  const copy = BRIEFING_COPY[language] ?? BRIEFING_COPY.en;
  await scheduleDaily('daily-briefing', copy.title, copy.body, time);
}

export async function schedulePracticeNotification(time: string): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleDaily(
    'daily-practice',
    'How was today\'s briefing?',
    'Send your feedback to William — did you like the article?',
    time
  );
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

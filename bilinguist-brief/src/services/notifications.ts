import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

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
  // Cancel any existing notification with this identifier
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

export async function scheduleBriefingNotification(time: string): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleDaily(
    'daily-briefing',
    'Your briefing is ready',
    "Today's edition has been prepared. Tap to read.",
    time
  );
}

export async function schedulePracticeNotification(time: string): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleDaily(
    'daily-practice',
    'Time to practise',
    'Keep your streak going — your words are waiting.',
    time
  );
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

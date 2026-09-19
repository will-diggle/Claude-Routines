import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { Session } from '@supabase/supabase-js';
import { requestNotificationPermission } from './notifications';
import { useSettingsStore } from '../store/useSettingsStore';

// Registers this device's Expo push token (and the user's current
// notification-time/timezone preference) with the server, so
// send-morning-notifications can deliver the real daily content at the
// user's chosen local time regardless of when they last opened the app.
// Fire-and-forget — must never throw or block sign-in/settings changes.
export async function syncPushRegistration(session: Session | null): Promise<void> {
  try {
    if (!session?.access_token) return;

    const granted = await requestNotificationPermission();
    if (!granted) return;

    // Simulators return a token shape that never resolves to a real device —
    // Expo's own recommended guard before calling getExpoPushTokenAsync.
    if (!Device.isDevice) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!expoPushToken) return;

    let timezone: string | undefined;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timezone = 'UTC';
    }

    const notificationTime = useSettingsStore.getState().briefingNotificationTime;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;

    await fetch(`${supabaseUrl}/functions/v1/register-push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        expoPushToken,
        platform: Device.osName?.toLowerCase() === 'android' ? 'android' : 'ios',
        notificationTime,
        timezone,
      }),
    });
  } catch {
    // Fire-and-forget — a failure here should never surface to the user.
  }
}

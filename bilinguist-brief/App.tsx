import React, { useEffect, useState, Component } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_400Regular_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  EBGaramond_400Regular,
  EBGaramond_700Bold,
  EBGaramond_400Regular_Italic,
} from '@expo-google-fonts/eb-garamond';
import {
  Lora_400Regular,
  Lora_700Bold,
  Lora_400Regular_Italic,
} from '@expo-google-fonts/lora';
import {
  NotoNaskhArabic_400Regular,
  NotoNaskhArabic_700Bold,
} from '@expo-google-fonts/noto-naskh-arabic';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import type { LanguageCode, LanguageLevel } from './src/store/useSettingsStore';
import type { BackgroundKey } from './src/theme';
import { useAuthStore } from './src/store/useAuthStore';
import { supabase } from './src/services/supabase';
import { useWordBankStore } from './src/store/useWordBankStore';
import { SplashOverlay, shouldShowSplash } from './src/components/SplashOverlay';
import * as Notifications from 'expo-notifications';
import { scheduleAllNotifications, schedulePracticeNotification } from './src/services/notifications';
// expo-alternate-app-icons requires a native build — not available in Expo Go.
// Check executionEnvironment before requiring so we never touch the native module
// in a store-client (Expo Go) context.
import Constants from 'expo-constants';
function safeSetAppIcon(icon: string | null) {
  const env = (Constants as any).executionEnvironment;
  if (env === 'storeClient') return; // Expo Go — native module not present
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-alternate-app-icons');
    const result = mod.setAlternateAppIcon?.(icon);
    if (result?.catch) result.catch(() => {});
  } catch {}
}
import { lookupWord } from './src/services/wordService';
import * as analytics from './src/services/analytics';
import { useSubscriptionStore } from './src/store/useSubscriptionStore';
import { useStreakStore, getStreakSnapshot } from './src/store/useStreakStore';
import { migrateAnonymousData, reconcileStreaks } from './src/services/streakSync';

// ── Error boundary ────────────────────────────────────────────────────────────
// Catches any JS render errors so the app shows a meaningful screen
// instead of a blank cream page.

interface EBState { error: Error | null }

class AppErrorBoundary extends Component<{ children: React.ReactNode; bg: string }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const ink = this.props.bg === 'softGrey' || this.props.bg === 'night' ? '#F5F0E8' : '#162032';
    return (
      <View style={[errStyles.container, { backgroundColor: this.props.bg === 'cream' ? '#F5F0E8' : this.props.bg === 'white' ? '#FAF8F6' : this.props.bg === 'softGrey' ? '#162032' : '#141414' }]}>
        <Text style={[errStyles.title, { color: ink }]}>Something went wrong</Text>
        <Text style={[errStyles.message, { color: ink }]}>{this.state.error.message}</Text>
        <TouchableOpacity onPress={() => this.setState({ error: null })} style={errStyles.button}>
          <Text style={[errStyles.buttonText, { color: ink }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const errStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  message: { fontSize: 13, opacity: 0.7, textAlign: 'center', marginBottom: 24 },
  button: { borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  buttonText: { fontSize: 14 },
});

// ── Main content ──────────────────────────────────────────────────────────────

// Light → dark background pairs for Auto Night Mode.
const NIGHT_BG_MAP: Partial<Record<BackgroundKey, BackgroundKey>> = {
  white: 'night',
  cream: 'softGrey',
};

function AppContent() {
  const { background, briefingNotificationTime, practiceNotificationTime, activeLanguages,
          topics, topicOrder,
          autoNightMode, manualBackground, setEffectiveBackground,
          appIcon } = useSettingsStore();
  const lastReadDates = useStreakStore((s) => s.lastReadDates);
  const setSession = useAuthStore((s) => s.setSession);

  // Deduplicate streak sync calls within this session (avoids double-sync on
  // getSession + INITIAL_SESSION both firing for the same persisted session).
  const syncedUsers = React.useRef(new Set<string>());

  // Waits for the streak store to finish hydrating from AsyncStorage before
  // we snapshot it for sync — ensures we push real data, not initial defaults.
  async function waitForStreakHydration(): Promise<void> {
    if (useStreakStore.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
      const unsub = useStreakStore.persist.onFinishHydration(() => { unsub(); resolve(); });
    });
  }

  async function runStreakSync(userId: string, isNewSignIn: boolean): Promise<void> {
    if (syncedUsers.current.has(userId)) return;
    syncedUsers.current.add(userId);
    try {
      await waitForStreakHydration();
      const snap = getStreakSnapshot();
      const merged = isNewSignIn
        ? await migrateAnonymousData(userId, snap)
        : await reconcileStreaks(userId, snap);
      useStreakStore.getState().applyMergedState(merged);
    } catch (e) {
      console.warn('[App] streak sync error:', e);
    }
  }

  // Keep auth store in sync with Supabase session changes (no-op when not configured)
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) {
        analytics.identifyUser(data.session.user.id);
        analytics.setSuperProperties({
          active_languages: useSettingsStore.getState().languages.filter(l => l.active).map(l => l.code),
          subscription_status: useSubscriptionStore.getState().isFullAccess() ? 'pro' : 'free',
        });
        // Existing session on app open — reconcile (not a fresh sign-in)
        runStreakSync(data.session.user.id, false).catch(() => {});
      } else {
        const anonId = useAuthStore.getState().anonymousId;
        analytics.identifyUser(anonId);
        analytics.trackAnonymousSessionStarted();
      }
    }).catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        analytics.identifyUser(session.user.id);
        analytics.setSuperProperties({
          active_languages: useSettingsStore.getState().languages.filter(l => l.active).map(l => l.code),
          subscription_status: useSubscriptionStore.getState().isFullAccess() ? 'pro' : 'free',
        });
        // SIGNED_IN = user just authenticated; INITIAL_SESSION = persisted session on startup
        const isNewSignIn = _event === 'SIGNED_IN';
        runStreakSync(session.user.id, isNewSignIn).catch(() => {});
      } else if (_event === 'SIGNED_OUT') {
        analytics.resetIdentity();
        syncedUsers.current.clear(); // allow re-sync if user signs back in
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isNight    = background === 'night';
  const colorScheme = useColorScheme();

  // Sync app icon with user's manual choice.
  useEffect(() => {
    safeSetAppIcon(appIcon);
  }, [appIcon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto Night Mode — switch background theme with iOS dark mode.
  useEffect(() => {
    if (!autoNightMode) return;
    const isDarkOS = colorScheme === 'dark';
    const target: BackgroundKey = isDarkOS
      ? (NIGHT_BG_MAP[manualBackground] ?? manualBackground)
      : manualBackground;
    setEffectiveBackground(target);
  }, [colorScheme, autoNightMode, manualBackground]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showSplash, setShowSplash] = useState(false);
  const [splashChecked, setSplashChecked] = useState(false);

  useEffect(() => {
    function runScheduling() {
      const { briefingNotificationTime: time, topicOrder: order, topics: tpcs, languages } = useSettingsStore.getState();
      const { lastReadDates: lrd } = useStreakStore.getState();
      const activeLangs = languages.filter((l) => l.active).map((l) => ({ code: l.code, name: l.name }));
      scheduleAllNotifications({
        briefingTime: time,
        topicOrder: order ?? [],
        topics: tpcs as Record<string, boolean>,
        activeLanguages: activeLangs,
        lastReadDates: lrd,
      }).catch(() => {});
      schedulePracticeNotification(useSettingsStore.getState().practiceNotificationTime).catch(() => {});
    }

    // Check synchronously first — if the store was already hydrated before this
    // effect ran (a common race on fast devices), we'd miss the callback otherwise.
    if (useSettingsStore.persist.hasHydrated()) {
      shouldShowSplash().then((show) => {
        setShowSplash(show);
        setSplashChecked(true);
      }).catch(() => { setSplashChecked(true); });
      runScheduling();
      return;
    }

    const unsub = useSettingsStore.persist.onFinishHydration(() => {
      shouldShowSplash().then((show) => {
        setShowSplash(show);
        setSplashChecked(true);
      }).catch(() => { setSplashChecked(true); });
      runScheduling();
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Fallback: if hydration never fires (corrupted storage, slow device), show
  // the app after 3 s rather than leaving a permanent blank screen.
  useEffect(() => {
    const t = setTimeout(() => setSplashChecked(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Background backfill: find any words saved before their lookup completed
  // (translation/explanation empty) and silently re-fetch them.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Wait for word bank to hydrate before reading words
      if (!useWordBankStore.persist.hasHydrated()) {
        await new Promise<void>(resolve => {
          const unsub = useWordBankStore.persist.onFinishHydration(() => { unsub(); resolve(); });
        });
      }
      const { words, backfillWord } = useWordBankStore.getState();
      const stale = words.filter(w => (!w.translation || !w.explanation) && w.word && w.language);
      for (const w of stale) {
        if (cancelled) break;
        const entry = await lookupWord(w.word, w.language as LanguageCode, (w.level as LanguageLevel) ?? 'intermediate');
        if (entry?.translation && !cancelled) {
          backfillWord(w.word, w.language, {
            translation: entry.translation ?? undefined,
            explanation: entry.explanation ?? undefined,
            lemma: entry.lemma,
            pronunciation: entry.pronunciation,
            verbTable: entry.verbTable,
            verbTablePast: entry.verbTablePast,
            forms: entry.forms,
            wordType: entry.wordType,
            tip: entry.tip,
            meta: entry.meta,
          });
        }
        // Small delay to avoid hammering the worker
        await new Promise(r => setTimeout(r, 500));
      }
    };
    run().catch(() => {});
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!splashChecked) return <View style={{ flex: 1, backgroundColor: BG_COLORS[background] ?? '#F5F0E8' }} />;

  return (
    <>
      <StatusBar style={isNight ? 'light' : 'dark'} />
      <AppErrorBoundary bg={background}>
        <AppNavigator />
      </AppErrorBoundary>
      {showSplash && <SplashOverlay onDone={() => setShowSplash(false)} />}
    </>
  );
}

const BG_COLORS: Record<string, string> = {
  white: '#FAF8F6', cream: '#F5F0E8', softGrey: '#162032', night: '#141414',
};
const SPINNER_COLORS: Record<string, string> = {
  white: '#1A1A1A', cream: '#7D6B4F', softGrey: '#F5F0E8', night: '#F5F0E8',
};

export default function App() {
  useEffect(() => {
    analytics.initAnalytics();
    const langs = useSettingsStore.getState().languages.filter(l => l.active);
    const streaks = useStreakStore.getState().readingStreaks;
    analytics.trackAppOpened(
      langs.map(l => l.code),
      Object.fromEntries(langs.map(l => [l.code, (streaks as Record<string, number>)[l.code] ?? 0])),
    );
  }, []);

  const [fontsLoaded] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    Lora_400Regular_Italic,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_400Regular_Italic,
    EBGaramond_400Regular,
    EBGaramond_700Bold,
    EBGaramond_400Regular_Italic,
    NotoNaskhArabic_400Regular,
    NotoNaskhArabic_700Bold,
  });
  const [storedBg, setStoredBg] = useState('cream');
  const navRef = useNavigationContainerRef();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    AsyncStorage.getItem('bilinguist-settings').then((json) => {
      if (!json) return;
      try {
        const bg = JSON.parse(json)?.state?.background;
        if (bg) setStoredBg(bg);
      } catch {}
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!lastResponse) return;
    const screen = lastResponse.notification.request.content.data?.screen;
    if (screen === 'Briefing' && navRef.isReady()) {
      navRef.navigate('Briefing' as never);
    }
  }, [lastResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG_COLORS[storedBg] ?? '#F5F0E8' }}>
        <ActivityIndicator color={SPINNER_COLORS[storedBg] ?? '#7D6B4F'} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navRef}>
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import React, { useEffect, useState, Component } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
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
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import type { LanguageCode, LanguageLevel } from './src/store/useSettingsStore';
import { useAuthStore } from './src/store/useAuthStore';
import { supabase } from './src/services/supabase';
import { useWordBankStore } from './src/store/useWordBankStore';
import { SplashOverlay, shouldShowSplash } from './src/components/SplashOverlay';
import { scheduleBriefingNotification, schedulePracticeNotification } from './src/services/notifications';
import { setAlternateAppIcon } from 'expo-alternate-app-icons';
import { lookupWord } from './src/services/wordService';

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

// Pairs for auto day/night icon switching — same logic as theme pairing.
const ICON_PAIRS: { base: string | null; dark: string }[] = [
  { base: null,     dark: 'Black'  }, // White  ↔ Black
  { base: 'Cream',  dark: 'Navy'   }, // Cream  ↔ Navy
  { base: 'Pride1', dark: 'Pride2' }, // Pride1 ↔ Pride2
];

function AppContent() {
  const { background, briefingNotificationTime, practiceNotificationTime, activeLanguages,
          autoNightMode, manualBackground, setEffectiveBackground,
          appIcon, appIconAuto } = useSettingsStore();
  const setSession = useAuthStore((s) => s.setSession);

  // Keep auth store in sync with Supabase session changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isNight    = background === 'night';
  const colorScheme = useColorScheme();

  // Follow iOS system dark mode (which the user can set to Automatic in
  // iOS Settings → Display & Brightness → Automatic, tied to sunset/sunrise).
  // white→night, cream→softGrey (navy); if already on a dark theme, leave it.
  useEffect(() => {
    if (!autoNightMode) return;
    const darkPair = manualBackground === 'cream' ? 'softGrey'
      : (manualBackground === 'night' || manualBackground === 'softGrey') ? manualBackground
      : 'night';
    setEffectiveBackground(colorScheme === 'dark' ? darkPair : manualBackground);
  }, [colorScheme, autoNightMode, manualBackground]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync app icon — either the user's manual choice, or the auto day/night pair.
  useEffect(() => {
    let target: string | null = appIcon;
    if (appIconAuto) {
      const pair = ICON_PAIRS.find((p) => p.base === appIcon || p.dark === appIcon);
      if (pair) target = colorScheme === 'dark' ? pair.dark : pair.base;
    }
    setAlternateAppIcon(target).catch(() => {});
  }, [colorScheme, appIcon, appIconAuto]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showSplash, setShowSplash] = useState(false);
  const [splashChecked, setSplashChecked] = useState(false);

  useEffect(() => {
    // Check synchronously first — if the store was already hydrated before this
    // effect ran (a common race on fast devices), we'd miss the callback otherwise.
    if (useSettingsStore.persist.hasHydrated()) {
      shouldShowSplash().then((show) => {
        setShowSplash(show);
        setSplashChecked(true);
      });
      const topLanguage = activeLanguages()[0]?.code ?? 'en';
      scheduleBriefingNotification(briefingNotificationTime, topLanguage);
      schedulePracticeNotification(practiceNotificationTime);
      return;
    }

    const unsub = useSettingsStore.persist.onFinishHydration(() => {
      shouldShowSplash().then((show) => {
        setShowSplash(show);
        setSplashChecked(true);
      });
      const topLanguage = activeLanguages()[0]?.code ?? 'en';
      scheduleBriefingNotification(briefingNotificationTime, topLanguage);
      schedulePracticeNotification(practiceNotificationTime);
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
    run();
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
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_400Regular_Italic,
    EBGaramond_400Regular,
    EBGaramond_700Bold,
    EBGaramond_400Regular_Italic,
  });
  const [storedBg, setStoredBg] = useState('cream');

  useEffect(() => {
    AsyncStorage.getItem('bilinguist-settings').then((json) => {
      if (!json) return;
      try {
        const bg = JSON.parse(json)?.state?.background;
        if (bg) setStoredBg(bg);
      } catch {}
    });
  }, []);

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
        <NavigationContainer>
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

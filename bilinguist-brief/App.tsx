import React, { useEffect, useState, Component } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
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
import { SplashOverlay, shouldShowSplash } from './src/components/SplashOverlay';
import { scheduleBriefingNotification, schedulePracticeNotification } from './src/services/notifications';

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
      <View style={[errStyles.container, { backgroundColor: this.props.bg === 'cream' ? '#F5F0E8' : this.props.bg === 'white' ? '#FFF' : this.props.bg === 'softGrey' ? '#162032' : '#141414' }]}>
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

function AppContent() {
  const { background, briefingNotificationTime, practiceNotificationTime, activeLanguages } = useSettingsStore();
  const isNight = background === 'night';
  const [showSplash, setShowSplash] = useState(false);
  const [splashChecked, setSplashChecked] = useState(false);
  // Wait for Zustand to rehydrate from AsyncStorage before showing the splash,
  // otherwise the splash renders with the default theme instead of the user's saved one.
  const [storeHydrated, setStoreHydrated] = useState(
    () => useSettingsStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (storeHydrated) return;
    const unsub = useSettingsStore.persist.onFinishHydration(() => setStoreHydrated(true));
    return unsub;
  }, [storeHydrated]);

  useEffect(() => {
    if (!storeHydrated) return;
    shouldShowSplash().then((show) => {
      setShowSplash(show);
      setSplashChecked(true);
    });
    // Schedule notifications using the user's saved times and top active language.
    // Runs on every launch so language changes take effect without needing a settings visit.
    const topLanguage = activeLanguages()[0]?.code ?? 'en';
    scheduleBriefingNotification(briefingNotificationTime, topLanguage);
    schedulePracticeNotification(practiceNotificationTime);
  }, [storeHydrated]);

  if (!splashChecked) return null;

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
  white: '#FFFFFF', cream: '#F5F0E8', softGrey: '#162032', night: '#141414',
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

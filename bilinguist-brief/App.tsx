import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
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

function AppContent() {
  const { background } = useSettingsStore();
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
  }, [storeHydrated]);

  if (!splashChecked) return null;

  return (
    <>
      <StatusBar style={isNight ? 'light' : 'dark'} />
      <AppNavigator />
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

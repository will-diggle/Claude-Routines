import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
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
  PTSerif_400Regular,
  PTSerif_700Bold,
  PTSerif_400Regular_Italic,
} from '@expo-google-fonts/pt-serif';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import { SplashOverlay, shouldShowSplash } from './src/components/SplashOverlay';

function AppContent() {
  const { background } = useSettingsStore();
  const isNight = background === 'night';
  const [showSplash, setShowSplash] = useState(false);
  const [splashChecked, setSplashChecked] = useState(false);

  useEffect(() => {
    shouldShowSplash().then((show) => {
      setShowSplash(show);
      setSplashChecked(true);
    });
  }, []);

  if (!splashChecked) return null;

  return (
    <>
      <StatusBar style={isNight ? 'light' : 'dark'} />
      <AppNavigator />
      {showSplash && <SplashOverlay onDone={() => setShowSplash(false)} />}
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_400Regular_Italic,
    PTSerif_400Regular,
    PTSerif_700Bold,
    PTSerif_400Regular_Italic,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}>
        <ActivityIndicator color="#7D6B4F" />
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

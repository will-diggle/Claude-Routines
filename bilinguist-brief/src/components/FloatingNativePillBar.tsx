import React, { useEffect } from 'react';
import { View, Platform } from 'react-native';
import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSettingsStore } from '../store/useSettingsStore';

// Load the native module — null on Android / Expo Go (falls through to nothing)
let NativePills: ReturnType<typeof requireNativeModule> | null = null;
try {
  if (Platform.OS === 'ios') NativePills = requireNativeModule('FloatingPills');
} catch { /* not linked */ }

export function FloatingNativePillBar({ navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name ?? 'Briefing';
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active)));

  // Mount overlay once
  useEffect(() => {
    if (!NativePills) return;
    NativePills.mount().catch(console.error);
    return () => { NativePills?.unmount().catch(console.error); };
  }, []);

  // Keep native pills in sync with RN state
  useEffect(() => {
    NativePills?.setBottomInset(insets.bottom);
  }, [insets.bottom]);

  useEffect(() => {
    NativePills?.setActiveTab(activeRoute);
  }, [activeRoute]);

  useEffect(() => {
    NativePills?.setLanguages(activeLanguages.map((l) => l.code));
  }, [activeLanguages]);

  // Handle tab press events from native pills
  useEffect(() => {
    if (!NativePills) return;
    const emitter = new EventEmitter(NativePills);
    const sub = emitter.addListener('onTabPress', ({ tab }: { tab: string }) => {
      const route = state.routes.find((r) => r.name === tab);
      if (!route) return;
      const isFocused = state.routes[state.index].name === tab;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation.navigate(tab as never);
    });
    return () => sub.remove();
  }, [navigation, state]);

  // Zero-height — the visual pills are entirely native
  return <View style={{ height: 0 }} />;
}

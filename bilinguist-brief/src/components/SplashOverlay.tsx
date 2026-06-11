import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../hooks/useTheme';

interface Props {
  onDone: () => void;
}

export function SplashOverlay({ onDone }: Props) {
  const { colors, fontFamily } = useTheme();

  useEffect(() => {
    const t = setTimeout(onDone, 700);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
        Bilinguist Brief
      </Text>
    </View>
  );
}

export async function shouldShowSplash(): Promise<boolean> {
  return true;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    letterSpacing: 0.5,
  },
});

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { WeatherData } from '../services/weather';

interface Props {
  weather: WeatherData | null;
  isLoading: boolean;
}

export function WeatherStrip({ weather, isLoading }: Props) {
  const { colors, fontFamily } = useTheme();

  const text = (() => {
    if (isLoading) return null;
    if (!weather) return null;
    return `${weather.greeting} — ${weather.temp}°C and ${weather.description} in ${weather.city}`;
  })();

  if (!isLoading && !text) return null;

  return (
    <View style={[styles.strip, { borderBottomColor: colors.borderLight }]}>
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.inkFaint} />
      ) : (
        <Text style={[styles.text, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});

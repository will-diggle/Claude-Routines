import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  SafeAreaView,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import type { WeatherData } from '../services/weather';

interface Props {
  weather: WeatherData | null;
  isLoading: boolean;
  weatherCode?: number;
}

export function codeToIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code === 51 || code === 53 || code === 55) return '🌦️';
  if (code === 61 || code === 63 || code === 65) return '🌧️';
  if (code === 71 || code === 73 || code === 75 || code === 77) return '❄️';
  if (code === 80 || code === 81 || code === 82) return '🌦️';
  if (code === 85 || code === 86) return '🌨️';
  if (code === 95 || code === 96 || code === 99) return '⛈️';
  return '🌡️';
}

function uvLabel(index: number): string {
  if (index <= 2) return 'Low';
  if (index <= 5) return 'Moderate';
  if (index <= 7) return 'High';
  return 'Very High';
}

export function WeatherStrip({ weather, isLoading, weatherCode }: Props) {
  const { colors, fontFamily } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const text = (() => {
    if (isLoading) return null;
    if (!weather) return null;
    const code = weatherCode ?? weather.code ?? 0;
    const icon = codeToIcon(code);
    return `${icon} ${weather.greeting} — ${weather.temp}°C, ${weather.description} in ${weather.city}`;
  })();

  if (!isLoading && !text) return null;

  function handlePress() {
    if (!weather || isLoading) return;
    setModalVisible(true);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.strip, { borderBottomColor: colors.borderLight }]}
        onPress={handlePress}
        activeOpacity={weather && !isLoading ? 0.7 : 1}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.inkFaint} />
        ) : (
          <Text style={[styles.text, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {text}
          </Text>
        )}
      </TouchableOpacity>

      {weather && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              style={[styles.sheet, { backgroundColor: colors.surface }]}
            >
              {/* Drag handle */}
              <View style={[styles.handle, { backgroundColor: colors.borderMid }]} />

              {/* Headline */}
              <Text style={[styles.city, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                {weather.city}
              </Text>
              <Text style={[styles.description, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>
                {weather.description}
              </Text>

              {/* Large temperature */}
              <Text style={[styles.tempLarge, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                {weather.temp}°C
              </Text>

              {/* Detail rows */}
              <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                <DetailRow
                  label={`Feels like ${weather.feelsLike}°C`}
                  colors={colors}
                  fontFamily={fontFamily}
                  isLast={false}
                />
                <DetailRow
                  emoji="💧"
                  label={`Humidity ${weather.humidity}%`}
                  colors={colors}
                  fontFamily={fontFamily}
                  isLast={false}
                />
                <DetailRow
                  emoji="💨"
                  label={`Wind ${weather.windKph} km/h`}
                  colors={colors}
                  fontFamily={fontFamily}
                  isLast={false}
                />
                <DetailRow
                  emoji="☀️"
                  label={`UV Index ${weather.uvIndex} (${uvLabel(weather.uvIndex)})`}
                  colors={colors}
                  fontFamily={fontFamily}
                  isLast
                />
              </View>

              {/* Close button */}
              <TouchableOpacity
                style={[styles.closeButton, { borderColor: colors.borderMid }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.closeText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                  Close
                </Text>
              </TouchableOpacity>

              <SafeAreaView />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}

function DetailRow({
  emoji,
  label,
  colors,
  fontFamily,
  isLast,
}: {
  emoji?: string;
  label: string;
  colors: any;
  fontFamily: any;
  isLast: boolean;
}) {
  return (
    <View style={[styles.detailRow, !isLast && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      {emoji ? (
        <Text style={styles.detailEmoji}>{emoji}</Text>
      ) : (
        <View style={styles.detailEmojiPlaceholder} />
      )}
      <Text style={[styles.detailText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
        {label}
      </Text>
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

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.md,
  },
  city: {
    fontSize: 22,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  description: {
    fontSize: 14,
    marginBottom: Spacing.md,
  },
  tempLarge: {
    fontSize: 64,
    lineHeight: 72,
    marginBottom: Spacing.lg,
  },
  detailsCard: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  detailEmoji: {
    fontSize: 16,
    width: 28,
  },
  detailEmojiPlaceholder: {
    width: 28,
  },
  detailText: {
    fontSize: 15,
    flex: 1,
  },
  closeButton: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  closeText: {
    fontSize: 16,
  },
});

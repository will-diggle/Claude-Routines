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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import type { WeatherData } from '../services/weather';

interface Props {
  weather: WeatherData | null;
  isLoading: boolean;
  weatherCode?: number;
}

// WMO code → Ionicons name
export function codeToIoniconName(code: number): React.ComponentProps<typeof Ionicons>['name'] {
  if (code === 0)                              return 'sunny-outline';
  if (code === 1)                              return 'partly-sunny-outline';
  if (code === 2)                              return 'partly-sunny-outline';
  if (code === 3)                              return 'cloudy-outline';
  if (code === 45 || code === 48)              return 'cloud-outline';
  if (code >= 51 && code <= 55)               return 'rainy-outline';
  if (code >= 61 && code <= 65)               return 'rainy-outline';
  if (code >= 71 && code <= 77)               return 'snow-outline';
  if (code >= 80 && code <= 82)               return 'rainy-outline';
  if (code >= 85 && code <= 86)               return 'snow-outline';
  if (code >= 95)                              return 'thunderstorm-outline';
  return 'thermometer-outline';
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

  if (!isLoading && !weather) return null;

  const code    = weatherCode ?? weather?.code ?? 0;
  const iconName = codeToIoniconName(code);

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
          <View style={styles.stripRow}>
            <Ionicons name={iconName} size={13} color={colors.inkFaint} style={styles.stripIcon} />
            <Text style={[styles.text, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              {weather!.greeting} — {weather!.temp}°C, {weather!.description} in {weather!.city}
            </Text>
          </View>
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

              {/* Large icon */}
              <Ionicons name={iconName} size={48} color={colors.inkMid} style={{ marginBottom: 8 }} />

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
                  icon="thermometer-outline"
                  label={`Feels like ${weather.feelsLike}°C`}
                  colors={colors}
                  fontFamily={fontFamily}
                  isLast={false}
                />
                <DetailRow
                  icon="water-outline"
                  label={`Humidity ${weather.humidity}%`}
                  colors={colors}
                  fontFamily={fontFamily}
                  isLast={false}
                />
                <DetailRow
                  icon="speedometer-outline"
                  label={`Wind ${weather.windKph} km/h`}
                  colors={colors}
                  fontFamily={fontFamily}
                  isLast={false}
                />
                <DetailRow
                  icon="sunny-outline"
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
  icon,
  label,
  colors,
  fontFamily,
  isLast,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  colors: any;
  fontFamily: any;
  isLast: boolean;
}) {
  return (
    <View style={[styles.detailRow, !isLast && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Ionicons name={icon} size={16} color={colors.inkFaint} style={styles.detailIcon} />
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
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stripIcon: {
    // slight nudge so it sits on the text baseline
    marginTop: 1,
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
  detailIcon: {
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

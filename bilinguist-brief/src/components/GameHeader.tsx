import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { GlassButton } from './GlassButton';

interface Props {
  title?: string;
  current: number;
  total: number;
  onSettingsPress?: () => void;
}

export function GameHeader({ title, current, total, onSettingsPress }: Props) {
  const navigation = useNavigation();
  const { colors, fontFamily, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const progress = total > 0 ? current / total : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, backgroundColor: colors.bg }]}>
      <View style={styles.row}>
        {/* X — left glass button */}
        <GlassButton onPress={() => navigation.goBack()} size={40}>
          <Ionicons name="chevron-back" size={24} color={isDark ? colors.bg : colors.inkMid} />
        </GlassButton>

        {/* Progress bar — center */}
        <View style={[styles.progressTrack, { backgroundColor: colors.borderLight }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%`, backgroundColor: colors.accentRed },
            ]}
          />
        </View>

        {/* Settings gear — right glass button (or counter when no settings) */}
        {onSettingsPress ? (
          <GlassButton onPress={onSettingsPress} size={40}>
            <Ionicons name="settings-outline" size={20} color={isDark ? colors.bg : colors.inkMid} />
          </GlassButton>
        ) : (
          <View style={styles.counter}>
            <Text style={[styles.counterText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              {current}/{total}
            </Text>
          </View>
        )}
      </View>

      {title ? (
        <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0DDD5',
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  counter: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    fontSize: 11,
    textAlign: 'center',
  },
  title: {
    fontSize: 13,
    letterSpacing: 1.8,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: Spacing.md,
  },
});

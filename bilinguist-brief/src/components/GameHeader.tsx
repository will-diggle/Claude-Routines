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

  const showProgress = total > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, backgroundColor: colors.bg, borderBottomColor: colors.borderLight }]}>
      <View style={styles.row}>
        {/* Back button */}
        <GlassButton onPress={() => navigation.goBack()} size={40}>
          <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
        </GlassButton>

        {/* Title centred in row (no progress) or progress bar */}
        {showProgress ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.borderLight }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: colors.accentRed },
              ]}
            />
          </View>
        ) : title ? (
          <Text style={[styles.inlineTitle, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
            {title.toUpperCase()}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* Settings gear — right glass button (or spacer to balance layout) */}
        {onSettingsPress ? (
          <GlassButton onPress={onSettingsPress} size={40}>
            <Ionicons name="settings-outline" size={20} color={colors.inkDark} />
          </GlassButton>
        ) : (
          <View style={styles.counter} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  inlineTitle: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 1.8,
    textAlign: 'center',
  },
});

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
  results?: Array<'correct' | 'wrong' | 'skipped'>;
  onSettingsPress?: () => void;
}

export function GameHeader({ title, current, total, results, onSettingsPress }: Props) {
  const navigation = useNavigation();
  const { colors, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();

  const showPills = total > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, backgroundColor: colors.bg, borderBottomColor: colors.borderLight }]}>
      <View style={styles.row}>
        {/* Back button */}
        <GlassButton onPress={() => navigation.goBack()} size={40}>
          <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
        </GlassButton>

        {/* Progress pills or title */}
        {showPills ? (
          <View style={styles.pillsRow}>
            {Array.from({ length: total }, (_, i) => {
              const outcome = results?.[i];
              const pillColor = outcome === 'correct'
                ? '#43A047'
                : outcome === 'wrong'
                ? '#E53935'
                : outcome === 'skipped'
                ? colors.inkFaint
                : null;
              const activeBg = i < current ? colors.accentRed : null;
              const shadowColor = pillColor ?? activeBg;
              return (
                <View
                  key={i}
                  style={[
                    styles.pill,
                    pillColor
                      ? { backgroundColor: pillColor }
                      : activeBg
                      ? { backgroundColor: activeBg }
                      : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderMid },
                    {
                      shadowColor: shadowColor ?? '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: shadowColor != null ? 0.22 : 0.08,
                      shadowRadius: 3,
                      elevation: shadowColor != null ? 2 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>
        ) : title ? (
          <Text style={[styles.inlineTitle, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
            {title.toUpperCase()}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* Settings gear or spacer */}
        {onSettingsPress ? (
          <GlassButton onPress={onSettingsPress} size={40}>
            <Ionicons name="settings-outline" size={20} color={colors.inkDark} />
          </GlassButton>
        ) : (
          <View style={styles.spacer} />
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
  pillsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pill: {
    flex: 1,
    height: 7,
    borderRadius: 4,
  },
  spacer: {
    width: 40,
    height: 40,
  },
  inlineTitle: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 1.8,
    textAlign: 'center',
  },
});

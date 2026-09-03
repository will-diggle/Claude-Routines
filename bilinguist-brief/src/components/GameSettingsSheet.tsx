import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, PanResponder, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { GlassButton } from './GlassButton';
import { SegmentedControl } from './settings/SettingsControls';

export const ROUND_SIZES = [10, 15, 20, 30] as const;
export type RoundSize = typeof ROUND_SIZES[number];

export interface GameSettings {
  direction: 'word-to-translation' | 'translation-to-word';
  errorChecking: boolean;
  /** Words/questions per round. Standard across every game except Speed Snap,
   *  which is timed rather than round-based and has no equivalent. */
  roundSize: RoundSize;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  direction: 'word-to-translation',
  errorChecking: false,
  roundSize: 10,
};

interface Props {
  visible: boolean;
  settings: GameSettings;
  onClose: () => void;
  onChange: (s: GameSettings) => void;
  /** Fill in the Blank has no word/translation direction to pick — hide that
   *  section rather than show a choice that doesn't apply to the game. */
  showDirection?: boolean;
}

export function GameSettingsSheet({ visible, settings, onClose, onChange, showDirection = true }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();

  const dragY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        dragY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          dragY.setValue(0);
          onClose();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
        }
      },
    })
  ).current;

  function toggle<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  const DIRECTIONS = [
    {
      value: 'word-to-translation' as const,
      label: 'Word → Translation',
      sub: 'You see the foreign word and recall its meaning',
    },
    {
      value: 'translation-to-word' as const,
      label: 'Translation → Word',
      sub: 'You see the meaning and recall the foreign word',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: colors.surface, transform: [{ translateY: dragY }] }]}
      >
        {/* Drag handle — touch to swipe down and dismiss */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.borderMid }]} />
        </View>

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            Options
          </Text>
          <GlassButton onPress={onClose} size={36}>
            <Ionicons name="close" size={20} color={colors.inkMid} />
          </GlassButton>
        </View>

        {showDirection && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              STUDY DIRECTION
            </Text>
            <View style={[styles.optionGroup, { borderColor: colors.borderLight }]}>
              {DIRECTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionRow,
                    { borderBottomColor: colors.borderLight },
                    settings.direction === opt.value && { backgroundColor: colors.accentRed + '10' },
                  ]}
                  onPress={() => toggle('direction', opt.value)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.optionSub, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      {opt.sub}
                    </Text>
                  </View>
                  {settings.direction === opt.value && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accentRed} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Pulled up closer to the section above — Spacing.md read as too
            much air once this became its own visually distinct control. */}
        <Text style={[styles.sectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, marginTop: Spacing.sm }]}>
          ROUND SIZE
        </Text>
        {/* Same SegmentedControl used for Text Size in Preferences, so it reads
            as the same kind of choice — joined into one control rather than
            separate chips — but tinted with the app's own red for its active
            segment (Text Size stays neutral chrome) and taller, since this is
            a five-way choice you return to mid-game, not a one-off preference. */}
        <SegmentedControl
          options={ROUND_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
          value={String(settings.roundSize)}
          onChange={(v) => toggle('roundSize', Number(v) as RoundSize)}
          colors={colors}
          fontFamily={fontFamily}
          // A faded tint, matching Study Direction's own selected-row treatment
          // above (accentRed + '10') — solid accentRed read as near-black at
          // full opacity, since it's a dark brick red rather than a bright one.
          activeColor={colors.accentRed + '15'}
          activeTextColor={colors.accentRed}
          optionPaddingVertical={16}
          containerStyle={{ marginHorizontal: 0 }}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 40,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  handleArea: {
    paddingTop: 14,
    paddingBottom: 4,
    alignItems: 'center',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 22,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  optionGroup: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  optionLabel: {
    marginBottom: 2,
  },
  optionSub: {
    fontSize: 12,
    lineHeight: 16,
  },
});

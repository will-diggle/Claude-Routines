import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, RADIUS } from '../theme/tokens';

// Per the design brief's Segmented Control spec: flex row, borderRadius 8,
// borderWidth 1 at borderMid. Selected segment fills with `chrome` (the
// paired accent ink for the current theme) and shows bold text in the
// background color; unselected segments are transparent with inkMid text.
// Hairline dividers separate segments.
interface Option<T extends string> {
  label: string;
  value: T;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderColor: colors.borderMid }]}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <React.Fragment key={opt.value}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: colors.borderMid }]} />}
            <Pressable
              style={[styles.segment, selected && { backgroundColor: colors.chrome }]}
              onPress={() => onChange(opt.value)}
            >
              <Text
                style={[
                  styles.label,
                  { color: selected ? colors.bg : colors.inkMid },
                  selected && styles.labelSelected,
                ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: RADIUS.input,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { width: StyleSheet.hairlineWidth },
  label: { fontSize: 13 },
  labelSelected: { fontWeight: '700' },
});

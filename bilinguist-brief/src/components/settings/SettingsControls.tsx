import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Spacing } from '../../theme';

export function SectionHeader({ title, colors, fontFamily }: { title: string; colors: any; fontFamily: any }) {
  return (
    <View style={sectionStyles.header}>
      <Text style={[sectionStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
        {title}
      </Text>
    </View>
  );
}

export function SegmentedControl({
  options,
  value,
  onChange,
  colors,
  fontFamily,
  containerStyle,
  // Both default to the Text Size control's own look (chrome fill, standard
  // height) — callers that want a different accent or a taller touch target,
  // like the round-size picker, pass these instead of forking the component.
  activeColor,
  activeTextColor,
  optionPaddingVertical,
}: {
  options: { label: string; value: string; optionFontSize?: number }[];
  value: string;
  onChange: (v: string) => void;
  colors: any;
  fontFamily: any;
  containerStyle?: object;
  activeColor?: string;
  activeTextColor?: string;
  optionPaddingVertical?: number;
}) {
  return (
    <View style={[segStyles.container, { borderColor: colors.borderMid, backgroundColor: colors.bg }, containerStyle]}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              segStyles.option,
              optionPaddingVertical != null && { paddingVertical: optionPaddingVertical },
              selected && { backgroundColor: activeColor ?? colors.chrome },
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderMid },
            ]}
            onPress={() => onChange(opt.value)}
          >
            <Text
              style={[
                segStyles.label,
                {
                  fontFamily: selected ? fontFamily.bold : fontFamily.regular,
                  color: selected ? (activeTextColor ?? colors.bg) : colors.inkMid,
                  fontSize: opt.optionFontSize ?? 13,
                  lineHeight: (opt.optionFontSize ?? 13) * 1.2,
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function TimeInput({
  value,
  onChange,
  onCommit,
  minTime,
  colors,
  fontFamily,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  minTime?: string;
  colors: any;
  fontFamily: any;
}) {
  return (
    <TextInput
      style={[
        timeStyles.input,
        { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.card },
      ]}
      value={value}
      onChangeText={(text) => {
        const clean = text.replace(/[^0-9:]/g, '');
        onChange(clean);
      }}
      onEndEditing={() => {
        if (minTime && value.length === 5 && value < minTime) {
          onChange(minTime);
        }
        onCommit?.();
      }}
      placeholder="HH:MM"
      placeholderTextColor={colors.inkFaint}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
    />
  );
}

export function DisplayPreview({ colors, fontFamily, fontSize }: { colors: any; fontFamily: any; fontSize: any }) {
  return (
    <View style={[previewStyles.container, { backgroundColor: colors.bg, borderColor: colors.borderLight }]}>
      <Text style={[previewStyles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading * 0.75 }]}>
        La politique étrangère en débat
      </Text>
      <Text style={[previewStyles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body * 0.85 }]}>
        Les dirigeants mondiaux se sont réunis à Genève pour discuter des nouvelles mesures climatiques dans un contexte de tensions géopolitiques croissantes.
      </Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: 26 },
});

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13 },
});

const timeStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 15,
    width: 72,
    textAlign: 'center',
  },
});

const previewStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 3,
  },
  headline: {
    lineHeight: 28,
    marginBottom: Spacing.xs,
  },
  body: {
    lineHeight: 22,
  },
});

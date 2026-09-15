import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import { Spacing } from '../../theme';

function timeStringToDate(value: string): Date {
  const [h, m] = value.split(':').map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function dateToTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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
  const [visible, setVisible] = useState(false);
  const [pendingDate, setPendingDate] = useState(() => timeStringToDate(value));

  return (
    <>
      <TouchableOpacity
        style={[
          timeStyles.input,
          { borderColor: colors.borderMid, backgroundColor: colors.card },
        ]}
        onPress={() => {
          setPendingDate(timeStringToDate(value));
          setVisible(true);
        }}
      >
        <Text style={{ color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: 15 }}>{value}</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity
          style={timeStyles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />
        <View pointerEvents="box-none" style={timeStyles.glassCardWrap}>
          <View style={timeStyles.glassCard}>
            <BlurView
              intensity={70}
              tint={colors.inkDark === '#FFFFFF' || colors.inkDark === '#fff' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[timeStyles.pickerHeader, { borderBottomColor: colors.borderLight }]}>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Text style={{ color: colors.inkFaint, fontFamily: fontFamily.regular, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  let next = dateToTimeString(pendingDate);
                  if (minTime && next < minTime) next = minTime;
                  onChange(next);
                  setVisible(false);
                  onCommit?.();
                }}
              >
                <Text style={{ color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: 16 }}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={pendingDate}
              mode="time"
              display="spinner"
              themeVariant={colors.inkDark === '#FFFFFF' || colors.inkDark === '#fff' ? 'dark' : 'light'}
              onChange={(_event, selectedDate) => {
                if (selectedDate) setPendingDate(selectedDate);
              }}
              style={timeStyles.pickerWheel}
            />
          </View>
        </View>
      </Modal>
    </>
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
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.4 },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  glassCardWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  glassCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 32,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerWheel: {
    alignSelf: 'center',
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

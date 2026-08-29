import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlagCircle } from '../FlagCircle';
import { Spacing } from '../../theme';
import type { LanguageLevel } from '../../store/useSettingsStore';
import { NATIVE_WRITING_LEVEL } from '../../services/prompts';

const LENGTH_LABELS: Record<string, readonly [string, string]> = {
  fr: ['Concis',  'Long'],
  de: ['Kurz',    'Lang'],
  sv: ['Kort',    'Lång'],
  en: ['Concise', 'Long'],
  it: ['Conciso', 'Lungo'],
  es: ['Conciso', 'Extenso'],
  tr: ['Kısa',    'Uzun'],
  hu: ['Rövid',   'Hosszú'],
  ar: ['موجز',    'طويل'],
};

const NATIVE_WORD: Record<string, string> = {
  en: 'Native', fr: 'Natif', de: 'Muttersprachlich',
  es: 'Nativo', pt: 'Nativo', it: 'Madrelingua', sv: 'Modersmål',
  tr: 'Yerel', hu: 'Anyanyelvi',
};

export function nativeLabel(langCode: string, grade?: LanguageLevel): string {
  const g = grade ?? NATIVE_WRITING_LEVEL;
  return `${g} / ${NATIVE_WORD[langCode] ?? 'Native'}`;
}

export interface LangCardProps {
  lang: { code: string; nativeName: string; active: boolean; readLength?: string; level?: string };
  isAnyDragging: boolean;
  isDark: boolean;
  colors: any;
  fontFamily: any;
  fontSize: any;
  nativeGradeByLang: Record<string, any>;
  onToggle: () => void;
  onSetLength: (val: 'short' | 'longer') => void;
  onPressLevel: () => void;
  isDraggable?: boolean;
  comingSoon?: boolean;
}

export function LanguageCard({ lang, isAnyDragging, isDark, colors, fontFamily, fontSize, nativeGradeByLang, onToggle, onSetLength, onPressLevel, isDraggable = true, comingSoon = false }: LangCardProps) {
  const anim = useRef(new Animated.Value(lang.active ? 1 : 0)).current;
  const [expandedHeight, setExpandedHeight] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: lang.active ? 1 : 0,
      duration: 240,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [lang.active]);

  const langLabels = LENGTH_LABELS[lang.code] ?? LENGTH_LABELS.en;

  const cardOpacity   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const cardShadowOp  = anim.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.12] });
  const cardElevation = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 5] });

  return (
    <Animated.View style={[cardStyles.card, {
      backgroundColor: colors.card,
      borderColor: colors.borderLight,
      opacity: cardOpacity,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: cardShadowOp,
      shadowRadius: 8,
      elevation: cardElevation,
    }]}>
      <View style={cardStyles.mainRow}>
        <Ionicons
          name="reorder-three-outline"
          size={20}
          color={colors.inkFaint}
          style={{ marginRight: 4, opacity: isDraggable ? 1 : 0 }}
        />
        <FlagCircle code={lang.code} size={28} />
        <Text style={[cardStyles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
          {lang.nativeName}
        </Text>
        {comingSoon ? (
          <View style={cardStyles.comingSoonBadge}>
            <Text style={[cardStyles.comingSoonText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              Coming soon
            </Text>
          </View>
        ) : (
          <Switch
            value={lang.active}
            onValueChange={onToggle}
            trackColor={{ false: isDark ? 'rgba(255,255,255,0.20)' : colors.borderMid, true: colors.chrome }}
            thumbColor="#FFF"
          />
        )}
      </View>

      {!comingSoon && <Animated.View style={{
        height: expandedHeight > 0
          ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, expandedHeight] })
          : undefined,
        overflow: 'hidden',
      }}>
        <View onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) setExpandedHeight(prev => prev || h);
        }}>
          <View style={[cardStyles.expandRow, { borderTopColor: colors.borderLight }]}>
            <Text style={[cardStyles.expandLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Length</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['short', 'longer'] as const).map((val, i) => {
                const active = (lang.readLength ?? 'medium') === val;
                return (
                  <TouchableOpacity
                    key={val}
                    onPress={() => onSetLength(val)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active
                        ? (isDark ? colors.inkFaint : colors.inkDark)
                        : colors.borderMid,
                      backgroundColor: active
                        ? (isDark ? colors.borderMid : colors.inkDark)
                        : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12, color: active ? colors.bg : colors.inkLight, fontFamily: fontFamily.regular }}>
                      {langLabels[i]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity style={[cardStyles.expandRow, { borderTopColor: colors.borderLight }]} onPress={onPressLevel}>
            <Text style={[cardStyles.expandLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Level</Text>
            <Text style={{ fontSize: 14, color: colors.inkDark, fontFamily: fontFamily.bold }}>
              {lang.level === 'Native' ? nativeLabel(lang.code, nativeGradeByLang[lang.code]) : (lang.level ?? 'B1')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </TouchableOpacity>
        </View>
      </Animated.View>}
    </Animated.View>
  );
}

export const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.sm,
  },
  rowLabel: { flex: 1 },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  expandLabel: { flex: 1, fontSize: 13 },
  comingSoonBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: { fontSize: 11, letterSpacing: 0.3, opacity: 0.7 },
});

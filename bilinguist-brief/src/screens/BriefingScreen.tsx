import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View, Text, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useTheme } from '../hooks/useTheme';
import { WeatherStrip } from '../components/WeatherStrip';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import type { ArticleLength } from '../services/anthropic';
import type { LanguageLevel } from '../store/useSettingsStore';

const LOGOMARK = require('../../assets/logomark.png');
const LOGOTYPE = require('../../assets/logotype.png');

const SCREEN_WIDTH = Dimensions.get('window').width;
const LOGOMARK_W = 68;
const LOGOMARK_H = Math.round(LOGOMARK_W * (297 / 600)); // ≈ 34

// A1/A2 always use 'short'; B1+ use the user's chosen read length.
function resolveLength(level: LanguageLevel, readLength: 'medium' | 'longer'): ArticleLength {
  return level === 'A1' || level === 'A2' ? 'short' : readLength;
}

function mastheadDateStr(bundleReceivedAt: number | null): string {
  const d = bundleReceivedAt ? new Date(bundleReceivedAt) : new Date();
  const datePart = d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();
  if (!bundleReceivedAt) return datePart;
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

export function BriefingScreen() {
  const { colors, fontFamily, isNight } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const {
    briefings, generatingFor, errorsFor, weather, isLoadingWeather,
    syncFromServer, loadBriefing, loadWeather, clearError, bundleReceivedAt,
  } = useBriefingStore();

  const activeLanguages = settings.languages.filter((l) => l.active);

  const activeLangKey =
    activeLanguages.map((l) => `${l.code}:${l.level ?? 'B1'}`).join(',') +
    `:${settings.readLength}`;

  useEffect(() => {
    const langs = settings.languages.filter((l) => l.active);
    syncFromServer();
    langs.forEach((lang) => {
      const level = lang.level ?? 'B1';
      loadBriefing(lang.code, level, resolveLength(level, settings.readLength), false);
    });
    if (langs.length > 0) loadWeather(langs[0].code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  const imageStyle = isNight ? { opacity: 0.85 } : undefined;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
    >
      {/* ── Masthead (scrolls with content) ── */}
      <View style={[styles.ruleOuter, { backgroundColor: colors.inkDark }]} />
      <View style={[styles.ruleInner, { backgroundColor: colors.borderMid }]} />

      <View style={styles.logotypeRow}>
        <Image source={LOGOMARK} style={[styles.logomark, imageStyle]} resizeMode="contain" />
        <View style={styles.logotypeWrap}>
          <Image source={LOGOTYPE} style={[styles.logotype, imageStyle]} resizeMode="contain" />
        </View>
        <View style={styles.logomarkSpacer} />
      </View>

      <View style={[styles.ruleInner, { backgroundColor: colors.borderMid }]} />
      <View style={[styles.ruleOuter, { backgroundColor: colors.inkDark }]} />

      <Text style={[styles.mastheadDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
        {mastheadDateStr(bundleReceivedAt)}
      </Text>

      <View style={[styles.hairline, { backgroundColor: colors.borderLight }]} />

      {/* ── Weather ── */}
      <WeatherStrip weather={weather} isLoading={isLoadingWeather} />

      {/* ── Language sections ── */}
      {activeLanguages.map((lang, index) => {
        const level = lang.level ?? 'B1';
        const length = resolveLength(level, settings.readLength);
        return (
          <LanguageBriefingSection
            key={lang.code}
            langCode={lang.code}
            nativeName={lang.nativeName}
            level={level}
            briefing={briefings[lang.code]}
            isGenerating={generatingFor.includes(lang.code)}
            error={errorsFor[lang.code]}
            isFirst={index === 0}
            topics={settings.topics}
            onRetry={() => {
              clearError(lang.code);
              loadBriefing(lang.code, level, length, true);
            }}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },

  // Masthead
  ruleOuter: { height: 2, width: SCREEN_WIDTH },
  ruleInner: { height: 1, width: SCREEN_WIDTH, marginVertical: 1 },
  logotypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: SCREEN_WIDTH,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  logomark: { width: LOGOMARK_W, height: LOGOMARK_H },
  logomarkSpacer: { width: LOGOMARK_W },
  logotypeWrap: { flex: 1, alignItems: 'center' },
  logotype: { width: '100%', height: 48 },
  mastheadDate: {
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingVertical: 7,
  },
  hairline: { height: StyleSheet.hairlineWidth, width: SCREEN_WIDTH },
});

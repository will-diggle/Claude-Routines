import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, RefreshControl, StyleSheet, View, Text, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useTheme } from '../hooks/useTheme';
import { WeatherStrip } from '../components/WeatherStrip';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import type { ArticleLength } from '../services/anthropic';
import type { LanguageLevel } from '../store/useSettingsStore';

const LOGOTYPE = require('../../assets/logotype.png');

const SCREEN_WIDTH = Dimensions.get('window').width;

// ── Language → masthead city ──────────────────────────────────────────────────

const LANG_CITY: Record<string, string> = {
  en: 'London',
  fr: 'Paris',
  de: 'Berlin',
  es: 'Madrid',
  it: 'Rome',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// A1/A2 always use 'short'; B1+ use the user's chosen read length.
function resolveLength(level: LanguageLevel, readLength: 'medium' | 'longer'): ArticleLength {
  return level === 'A1' || level === 'A2' ? 'short' : readLength;
}

function mastheadDateStr(ts: number | null): string {
  const d = ts ? new Date(ts) : new Date();
  const datePart = d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();
  if (!ts) return datePart;
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function mastheadTagline(count: number): string {
  if (count >= 3) return 'The trilingual morning brief';
  if (count === 2) return 'The bilingual morning brief';
  return 'The morning brief';
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function BriefingScreen() {
  const { colors, fontFamily, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const {
    briefings, generatingFor, errorsFor, weather, isLoadingWeather,
    syncFromServer, loadBriefing, loadWeather, clearError, bundleReceivedAt,
    syncMessage,
  } = useBriefingStore();

  const activeLanguages = settings.languages.filter((l) => l.active);
  const [refreshing, setRefreshing] = useState(false);

  const activeLangKey =
    activeLanguages.map((l) => `${l.code}:${l.level ?? 'B1'}`).join(',') +
    `:${settings.readLength}`;

  const runSync = useCallback(async () => {
    const langs = settings.languages.filter((l) => l.active);
    await syncFromServer();
    await Promise.all(langs.map((lang) => {
      const level = lang.level ?? 'B1';
      return loadBriefing(lang.code, level, resolveLength(level, settings.readLength), true);
    }));
    if (langs.length > 0) loadWeather(langs[0].code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  useEffect(() => {
    runSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await runSync();
    setRefreshing(false);
  }, [runSync]);

  const firstBriefing = Object.values(briefings)[0];
  const publishedAt = firstBriefing?.generatedAt ?? bundleReceivedAt;
  const imageStyle = isDark ? { tintColor: '#F0EDE6' } : undefined;

  // Masthead strings
  const locationStr = activeLanguages
    .map((l) => LANG_CITY[l.code] ?? l.name)
    .join(' · ');
  const taglineText = mastheadTagline(activeLanguages.length);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.inkLight}
        />
      }
    >
      {/* ══ Masthead ══════════════════════════════════════════════════════ */}

      {/* Top double rules */}
      <View style={[styles.ruleOuter, { backgroundColor: colors.inkDark }]} />
      <View style={[styles.ruleInner, { backgroundColor: colors.borderMid }]} />

      {/* Three-column row: Vol. II  |  logotype  |  London · Paris */}
      <View style={styles.mastRow}>

        <View style={styles.mastLeft}>
          <Text style={[styles.volLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
            Vol. II
          </Text>
        </View>

        <View style={styles.mastCentre}>
          <Image
            source={LOGOTYPE}
            style={[styles.logotype, imageStyle]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.mastRight}>
          <Text
            style={[styles.locationLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}
            numberOfLines={3}
          >
            {locationStr}
          </Text>
        </View>

      </View>

      {/* Italic tagline: "The bilingual morning brief" */}
      <Text style={[styles.tagline, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>
        {taglineText}
      </Text>

      {/* Bottom double rules */}
      <View style={[styles.ruleInner, { backgroundColor: colors.borderMid }]} />
      <View style={[styles.ruleOuter, { backgroundColor: colors.inkDark }]} />

      {/* Published date */}
      <Text style={[styles.mastheadDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
        {mastheadDateStr(publishedAt)}
      </Text>

      <View style={[styles.hairline, { backgroundColor: colors.borderLight }]} />

      {/* ── Sync progress ─────────────────────────────────────────────── */}
      {syncMessage != null && (
        <View style={[styles.syncBanner, { borderBottomColor: colors.borderLight }]}>
          <Text style={[styles.syncText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {syncMessage}
          </Text>
        </View>
      )}

      {/* ── Weather strip ──────────────────────────────────────────────── */}
      <WeatherStrip weather={weather} isLoading={isLoadingWeather} />

      {/* ── Language sections ──────────────────────────────────────────── */}
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },

  // Rules
  ruleOuter: { height: 2, width: SCREEN_WIDTH },
  ruleInner: { height: 1, width: SCREEN_WIDTH, marginVertical: 1 },
  hairline:  { height: StyleSheet.hairlineWidth, width: SCREEN_WIDTH },

  // Three-column masthead row
  mastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: SCREEN_WIDTH,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
  mastLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  mastCentre: {
    flex: 3,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  mastRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  // Masthead text elements
  volLabel: {
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  locationLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'right',
    lineHeight: 14,
  },
  logotype: {
    width: '100%',
    height: 48,
  },
  tagline: {
    fontSize: 11,
    letterSpacing: 0.4,
    textAlign: 'center',
    paddingTop: 2,
    paddingBottom: 7,
    width: SCREEN_WIDTH,
  },
  mastheadDate: {
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingVertical: 7,
    width: SCREEN_WIDTH,
  },

  // Sync banner
  syncBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  syncText: { fontSize: 12, letterSpacing: 0.3 },
});

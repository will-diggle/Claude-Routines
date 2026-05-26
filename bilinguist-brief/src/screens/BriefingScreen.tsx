import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, RefreshControl, StyleSheet, View, Text, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';
import { WeatherStrip } from '../components/WeatherStrip';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import type { ArticleLength } from '../services/anthropic';
import type { LanguageLevel } from '../store/useSettingsStore';

// Pre-composed masthead lockups — one per background mode, colours baked in.
const MASTHEADS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};

const SCREEN_WIDTH = Dimensions.get('window').width;

// ── Language → masthead city ──────────────────────────────────────────────────

const LANG_CITY: Record<string, string> = {
  en: 'London',
  fr: 'Paris',
  de: 'Berlin',
  es: 'Madrid',
  it: 'Rome',
  sv: 'Stockholm',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// TODO: length-per-level policy — A1/A2 always Concise for now; revisit if we want user choice at beginner levels
function resolveLength(level: LanguageLevel, readLength: ArticleLength): ArticleLength {
  return level === 'A1' || level === 'A2' ? 'short' : readLength;
}

// Returns "Published at Monday, 26 May 2026 · 05:47"
function publishedDateStr(ts: number | null): string {
  const d = ts ? new Date(ts) : new Date();
  const datePart = d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  if (!ts) return datePart;
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Published at ${datePart} · ${timePart}`;
}

// Daily Roman numeral volume — increments by one each day.
// Vol. I = 25 May 2026 (launch day); today = days since epoch + 1.
const BRIEF_EPOCH_MS = new Date('2026-05-25T00:00:00Z').getTime();
function toRoman(n: number): string {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r;
}
function dailyVol(): string {
  const days = Math.floor((Date.now() - BRIEF_EPOCH_MS) / 86_400_000) + 1;
  return `Vol. ${toRoman(Math.max(1, days))}`;
}

// Brand chrome colour: each background has a matching ink for rules and the lockup tint.
// cream→navy, softGrey(navy)→cream, white→inkDark, night→cream
function chromeColor(background: string): string {
  if (background === 'cream')     return Colors.navyBg;
  if (background === 'softGrey')  return Colors.cream;
  if (background === 'white')     return Colors.inkDark;
  return Colors.cream; // night
}

// Hairline rule opacity — paired with the chrome so the double-rule reads as a unit
function hairlineColor(background: string): string {
  if (background === 'cream')    return 'rgba(22,32,50,0.32)';
  if (background === 'softGrey') return 'rgba(245,240,232,0.40)';
  if (background === 'white')    return 'rgba(26,26,26,0.30)';
  return 'rgba(245,240,232,0.40)'; // night
}

function mastheadTagline(count: number): string {
  if (count >= 4) return 'Your multilingual brief';
  if (count === 3) return 'Your trilingual brief';
  if (count === 2) return 'Your bilingual brief';
  return 'Your monolingual brief';
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function BriefingScreen() {
  const { colors, fontFamily, isDark, background } = useTheme();
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

  // Masthead strings
  const locationStr = activeLanguages
    .map((l) => LANG_CITY[l.code] ?? l.name)
    .join(' · ');
  const taglineText = mastheadTagline(activeLanguages.length);

  // Brand pairing: each background has a chrome ink and a hairline tint
  const chrome   = chromeColor(background);
  const hairline = hairlineColor(background);

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
      {/* ══ Masthead ══════════════════════════════════════════════════════
           2px rule (chrome)
           1px hairline rule
           Lockup PNG (full width)
           Cities (centred, 9px, tracked uppercase) — between lockup and meta
           [Published at date  ·  Vol. N]  (non-italic, same tracked style)
           1px hairline rule
           2px rule (chrome)
           Tagline (italic, "Your … brief")
          ═══════════════════════════════════════════════════════════════ */}

      {/* Top double rules */}
      <View style={[styles.ruleOuter, { backgroundColor: chrome }]} />
      <View style={[styles.ruleInner, { backgroundColor: hairline }]} />

      {/* Lockup — pre-composed masthead PNG, colours baked in per theme */}
      <View style={styles.lockupWrap}>
        <Image
          source={MASTHEADS[background] ?? MASTHEADS.cream}
          style={styles.lockup}
          resizeMode="contain"
        />
      </View>

      {/* Cities — below lockup, evenly spaced above and below */}
      <Text style={[styles.cities, { color: chrome, fontFamily: fontFamily.regular }]}>
        {locationStr}
      </Text>

      {/* Meta row: published date (left) · Vol. N (right), both non-italic */}
      <View style={styles.metaRow}>
        <Text
          style={[styles.metaDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}
          numberOfLines={2}
        >
          {publishedDateStr(publishedAt)}
        </Text>
        <Text style={[styles.metaVol, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {dailyVol()}
        </Text>
      </View>

      {/* Bottom double rules */}
      <View style={[styles.ruleInner, { backgroundColor: hairline }]} />
      <View style={[styles.ruleOuter, { backgroundColor: chrome }]} />

      {/* Tagline — italic, personalised to language count */}
      <Text style={[styles.tagline, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>
        {taglineText}
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

  // ── Rules ──────────────────────────────────────────────────────────
  ruleOuter: { height: 2, width: SCREEN_WIDTH },
  ruleInner: { height: 1, width: SCREEN_WIDTH, marginVertical: 2 },
  hairline:  { height: StyleSheet.hairlineWidth, width: SCREEN_WIDTH },

  // ── Masthead ───────────────────────────────────────────────────────
  // Cities line — centred, 9px, tracked uppercase, sits between lockup and meta row
  cities: {
    width: SCREEN_WIDTH,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    paddingTop: 6,
    paddingBottom: 6,
  },

  // Lockup image wrapper — full width, horizontal padding matches RevealMasthead
  lockupWrap: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 16,
    paddingTop: 5,
  },
  lockup: {
    width: '100%',
    height: 52,
  },

  // Meta row: [Published italic date …  |  Vol. II]
  metaRow: {
    width: SCREEN_WIDTH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 6,
  },
  metaDate: {
    flex: 1,
    fontSize: 10,
    opacity: 0.6,
    lineHeight: 14,
  },
  metaVol: {
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  // Tagline — italic, centred, below the bottom rule
  tagline: {
    width: SCREEN_WIDTH,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },

  // ── Sync banner ────────────────────────────────────────────────────
  syncBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  syncText: { fontSize: 12, letterSpacing: 0.3 },
});

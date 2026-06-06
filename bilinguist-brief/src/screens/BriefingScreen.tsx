import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, ScrollView, RefreshControl, StyleSheet, View, Text, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import { FLOAT_TAB_INSET } from '../components/FloatingTabBar';
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

// Masthead lockup dimensions — calculated from screen width so the full
// crest + wordmark always fills the available width at the correct height.
// The four masthead PNGs are all ~5.17:1 (3491×675 px baseline).
const LOCKUP_PADDING = 12; // matches lockupWrap.paddingHorizontal
const LOCKUP_W = SCREEN_WIDTH - LOCKUP_PADDING * 2;
const LOCKUP_H = Math.round(LOCKUP_W / 5.17);

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

function resolveLength(_level: LanguageLevel, readLength: ArticleLength): ArticleLength {
  return readLength;
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

// Roman numeral helper for the Vol. display
function toRoman(n: number): string {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r;
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
    briefings, generatingFor, errorsFor, weatherByLang,
    syncFromServer, loadBriefing, loadWeather, clearError, bundleReceivedAt,
    briefVolume, isSyncing,
  } = useBriefingStore();

  const activeLanguages = settings.languages.filter((l) => l.active);
  const [refreshing, setRefreshing] = useState(false);

  const activeLangKey =
    activeLanguages.map((l) => `${l.code}:${l.level ?? 'B1'}:${l.readLength ?? 'medium'}`).join(',');

  const lastSyncRef = useRef<number>(0);

  const runSync = useCallback(async () => {
    lastSyncRef.current = Date.now();
    const langs = settings.languages.filter((l) => l.active);
    await syncFromServer();
    await Promise.all(langs.map((lang) => {
      const level = lang.level ?? 'B1';
      return loadBriefing(lang.code, level, resolveLength(level, (lang.readLength ?? 'medium') as ArticleLength), true);
    }));
    await Promise.all(langs.map((lang) => loadWeather(lang.code)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  useEffect(() => {
    runSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLangKey]);

  useEffect(() => {
    const MIN_SYNC_INTERVAL = 30 * 60 * 1000; // 30 minutes
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      const today = new Date().toISOString().split('T')[0];
      // Always sync immediately if today's bundle isn't in the cache yet —
      // this ensures the morning brief appears the moment the app is opened,
      // regardless of how long the app was in the background.
      const contentIsStale = useBriefingStore.getState().lastBundleDate !== today;
      const intervalElapsed = Date.now() - lastSyncRef.current > MIN_SYNC_INTERVAL;
      if (contentIsStale || intervalElapsed) {
        lastSyncRef.current = Date.now();
        runSync();
      }
    });
    return () => sub.remove();
  }, [runSync]);

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
          refreshing={refreshing || isSyncing}
          onRefresh={onRefresh}
          tintColor={colors.inkLight}
        />
      }
    >
      {/* ══ Masthead ══════════════════════════════════════════════════════
           2px rule (chrome)
           Cities (centred, 9px, tracked uppercase) — between outer and inner rule
           1px hairline rule
           Lockup PNG (full width)
           [Published at date  ·  Vol. N]  (non-italic, same tracked style)
           1px hairline rule
           2px rule (chrome)
           Tagline (italic, "Your … brief")
          ═══════════════════════════════════════════════════════════════ */}

      {/* Top outer rule */}
      <View style={[styles.ruleOuter, { backgroundColor: chrome }]} />

      {/* Cities — between outer and inner rule */}
      <Text style={[styles.cities, { color: chrome, fontFamily: fontFamily.regular }]}>
        {locationStr}
      </Text>

      {/* Top inner hairline rule */}
      <View style={[styles.ruleInner, { backgroundColor: hairline }]} />

      {/* Lockup — pre-composed masthead PNG, colours baked in per theme */}
      <View style={styles.lockupWrap}>
        <Image
          source={MASTHEADS[background] ?? MASTHEADS.cream}
          style={styles.lockup}
          resizeMode="contain"
        />
      </View>

      {/* Meta row: published date (left) · Vol. N (right), both non-italic */}
      <View style={styles.metaRow}>
        <Text
          style={[styles.metaDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}
          numberOfLines={2}
        >
          {publishedDateStr(publishedAt)}
        </Text>
        <Text style={[styles.metaVol, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {briefVolume > 0 ? `Vol. ${toRoman(briefVolume)}` : ''}
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

      {/* ── Language sections ──────────────────────────────────────────── */}
      {activeLanguages.map((lang, index) => {
        const level = lang.level ?? 'B1';
        const length = resolveLength(level, (lang.readLength ?? 'medium') as ArticleLength);
        const stored = briefings[lang.code];
        const briefing = (stored?.level === level && stored?.length === length) ? stored : undefined;
        return (
          <LanguageBriefingSection
            key={lang.code}
            langCode={lang.code}
            nativeName={lang.nativeName}
            level={level}
            briefing={briefing}
            isGenerating={generatingFor.includes(lang.code)}
            error={errorsFor[lang.code]}
            isFirst={index === 0}
            topics={settings.topics}
            weather={weatherByLang[lang.code] ?? null}
            onRetry={() => {
              clearError(lang.code);
              loadBriefing(lang.code, level, length, true);
            }}
          />
        );
      })}

      {/* ── Article footer — once at the very end ─────────────────────── */}
      {activeLanguages.some((l) => briefings[l.code]) && (
        <View style={[styles.articleFooter, { borderTopColor: colors.borderLight }]}>
          <View style={[styles.ruleOuter, { backgroundColor: chrome }]} />
          <View style={[styles.ruleInner, { backgroundColor: hairline }]} />
          <Text style={[styles.footerDate, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {publishedDateStr(publishedAt)}
          </Text>
          <Text style={[styles.footerMessage, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {'Tune in tomorrow for your next daily briefing.\nTo read more today, add a language or open a topic in preferences.'}
          </Text>
          <View style={[styles.ruleInner, { backgroundColor: hairline }]} />
          <View style={[styles.ruleOuter, { backgroundColor: chrome }]} />
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: FLOAT_TAB_INSET },

  // ── Rules ──────────────────────────────────────────────────────────
  ruleOuter: { height: 2, width: SCREEN_WIDTH },
  ruleInner: { height: 1, width: SCREEN_WIDTH, marginVertical: 2 },
  hairline:  { height: StyleSheet.hairlineWidth, width: SCREEN_WIDTH },

  // ── Masthead ───────────────────────────────────────────────────────
  // Cities line — centred, 9px, tracked uppercase, sits between outer and inner rule
  cities: {
    width: SCREEN_WIDTH,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    paddingVertical: 6,
  },

  // Lockup image wrapper — padded to match LOCKUP_PADDING constant above
  lockupWrap: {
    width: SCREEN_WIDTH,
    paddingHorizontal: LOCKUP_PADDING,
    paddingTop: 4,
    paddingBottom: 2,
  },
  // Explicit pixel dimensions — avoids React Native quirks with percentage
  // widths + aspectRatio on Image components. Height is pre-computed from
  // the masthead PNG's 5.17:1 ratio so the full crest + wordmark fills the
  // available width at exactly the right height on every screen size.
  lockup: {
    width: LOCKUP_W,
    height: LOCKUP_H,
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
  articleFooter: {
    marginTop: 32,
    paddingHorizontal: 18,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 10,
  },
  footerDate: {
    fontSize: 11,
    opacity: 0.7,
    textAlign: 'center',
    paddingTop: 10,
  },
  footerMessage: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 19,
    opacity: 0.6,
    paddingBottom: 10,
  },

  syncBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  syncText: { fontSize: 12, letterSpacing: 0.3 },
});

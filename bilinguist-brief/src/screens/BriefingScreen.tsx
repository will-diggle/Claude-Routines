import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  AppState, AppStateStatus, ScrollView, RefreshControl, StyleSheet,
  View, Text, Image, Dimensions,
  NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';
import { useBriefingStore } from '../store/useBriefingStore';
import { useTheme } from '../hooks/useTheme';
import { Colors } from '../theme';
import { LanguageBriefingSection } from '../components/LanguageBriefingSection';
import { FLOAT_TAB_INSET } from '../components/FloatingTabBar';
import type { ArticleLength, GeneratedBriefing } from '../services/anthropic';
import type { LanguageLevel } from '../store/useSettingsStore';

const MASTHEADS: Record<string, ReturnType<typeof require>> = {
  cream:    require('../../assets/masthead-cream.png'),
  softGrey: require('../../assets/masthead-navy.png'),
  white:    require('../../assets/masthead-white.png'),
  night:    require('../../assets/masthead-black.png'),
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const LOCKUP_PADDING = 12;
const LOCKUP_W = SCREEN_WIDTH - LOCKUP_PADDING * 2;
const LOCKUP_H = Math.round(LOCKUP_W / 5.17);

// City names in each language's native form
const LANG_CITY_NATIVE: Record<string, string> = {
  en: 'London',
  fr: 'Paris',
  de: 'Berlin',
  es: 'Madrid',
  it: 'Roma',
  sv: 'Stockholm',
  tr: 'Ankara',
};

// BCP-47 locale for date/time formatting on each page
const LANG_LOCALE: Record<string, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  sv: 'sv-SE',
  tr: 'tr-TR',
};

// "Published" prefix in each language
const PUBLISHED_PREFIX: Record<string, string> = {
  en: 'Published',
  fr: 'Publié le',
  de: 'Veröffentlicht am',
  es: 'Publicado el',
  it: 'Pubblicato il',
  sv: 'Publicerad',
  tr: 'Yayınlandı',
};

// Taglines indexed by [mono=0, bi=1, tri=2, multi=3]
const TAGLINES: Record<string, [string, string, string, string]> = {
  en: ['Your daily brief',          'Your bilingual brief',        'Your trilingual brief',         'Your multilingual brief'],
  fr: ['Votre brief quotidien',      'Votre brief bilingue',        'Votre brief trilingue',         'Votre brief multilingue'],
  de: ['Ihr tägliches Briefing',     'Ihr zweisprachiges Briefing', 'Ihr dreisprachiges Briefing',   'Ihr mehrsprachiges Briefing'],
  es: ['Su brief diario',            'Su brief bilingüe',           'Su brief trilingüe',            'Su brief multilingüe'],
  it: ['Il tuo brief quotidiano',    'Il tuo brief bilingue',       'Il tuo brief trilingue',        'Il tuo brief multilingue'],
  sv: ['Din dagliga brief',          'Din tvåspråkiga brief',       'Din trespråkiga brief',         'Din flerspråkiga brief'],
  tr: ['Günlük brifinginiz',         'İki dilli brifinginiz',       'Üç dilli brifinginiz',          'Çok dilli brifinginiz'],
};

function getTagline(langCode: string, count: number): string {
  const t = TAGLINES[langCode] ?? TAGLINES.en;
  const idx = count <= 1 ? 0 : count === 2 ? 1 : count === 3 ? 2 : 3;
  return t[idx];
}

function publishedDateStr(ts: number | null, langCode: string): string {
  const d = ts ? new Date(ts) : new Date();
  const locale = LANG_LOCALE[langCode] ?? 'en-GB';
  const prefix = PUBLISHED_PREFIX[langCode] ?? 'Published';
  const datePart = d.toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  if (!ts) return `${prefix} ${datePart}`;
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${prefix} ${datePart} · ${timePart}`;
}

function toRoman(n: number): string {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r;
}

function chromeColor(background: string): string {
  if (background === 'cream')    return Colors.navyBg;
  if (background === 'softGrey') return Colors.cream;
  if (background === 'white')    return Colors.inkDark;
  return Colors.cream; // night
}

function hairlineColor(background: string): string {
  if (background === 'cream')    return 'rgba(22,32,50,0.32)';
  if (background === 'softGrey') return 'rgba(245,240,232,0.40)';
  if (background === 'white')    return 'rgba(26,26,26,0.30)';
  return 'rgba(245,240,232,0.40)';
}

function resolveLength(_level: LanguageLevel, readLength: ArticleLength): ArticleLength {
  return readLength;
}

export function BriefingScreen() {
  const { colors, fontFamily, background } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const {
    briefings, generatingFor, errorsFor, weatherByLang,
    syncFromServer, loadBriefing, loadWeather, clearError, bundleReceivedAt,
    briefVolume, isSyncing,
  } = useBriefingStore();

  const activeLanguages = settings.languages.filter((l) => l.active);
  const langCount = activeLanguages.length;

  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const lastValidBriefingsRef = useRef<Partial<Record<string, GeneratedBriefing>>>({});
  const lastSyncRef = useRef<number>(0);
  const pagerRef = useRef<ScrollView>(null);

  const activeLangKey =
    activeLanguages.map((l) => `${l.code}:${l.level ?? 'B1'}:${l.readLength ?? 'medium'}`).join(',');

  const runSync = useCallback(async (force = false) => {
    lastSyncRef.current = Date.now();
    const langs = settings.languages.filter((l) => l.active);
    await syncFromServer(force);
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

  // Clamp page index when active languages change (e.g. user removes current language)
  useEffect(() => {
    if (currentPage >= langCount) {
      const next = Math.max(0, langCount - 1);
      setCurrentPage(next);
      pagerRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: false });
    }
  }, [langCount]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (Date.now() - lastSyncRef.current < 30_000) return;
      runSync();
    });
    return () => sub.remove();
  }, [runSync]);

  useEffect(() => {
    const id = setInterval(() => runSync(), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [runSync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await runSync(true);
    setRefreshing(false);
  }, [runSync]);

  const handlePageScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  }, []);

  const chrome   = chromeColor(background);
  const hairline = hairlineColor(background);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onMomentumScrollEnd={handlePageScroll}
        style={styles.pager}
        overScrollMode="never"
      >
        {activeLanguages.map((lang) => {
          const level = lang.level ?? 'B1';
          const length = resolveLength(level, (lang.readLength ?? 'medium') as ArticleLength);
          const stored = briefings[lang.code];
          const today = new Date().toISOString().split('T')[0];
          const briefingMatches =
            !!stored && stored.date === today && stored.level === level && stored.length === length;
          if (briefingMatches && stored) {
            lastValidBriefingsRef.current[lang.code] = stored;
          }
          const displayBriefing = briefingMatches
            ? stored
            : (lastValidBriefingsRef.current[lang.code] ?? undefined);
          const isTransitioning = !briefingMatches && !!lastValidBriefingsRef.current[lang.code];

          const city    = LANG_CITY_NATIVE[lang.code] ?? lang.name;
          const tagline = getTagline(lang.code, langCount);

          return (
            <ScrollView
              key={lang.code}
              style={[styles.page, { backgroundColor: colors.bg }]}
              contentContainerStyle={[
                styles.pageContent,
                { paddingTop: insets.top + 8, paddingBottom: FLOAT_TAB_INSET },
              ]}
              showsVerticalScrollIndicator={false}
              directionalLockEnabled
              refreshControl={
                <RefreshControl
                  refreshing={refreshing || isSyncing}
                  onRefresh={onRefresh}
                  tintColor={colors.inkLight}
                />
              }
            >
              {/* ── Masthead — unique per language page ─────────────────── */}
              <View style={[styles.ruleOuter, { backgroundColor: chrome }]} />

              <Text style={[styles.cities, { color: chrome, fontFamily: fontFamily.regular }]}>
                {city}
              </Text>

              <View style={[styles.ruleInner, { backgroundColor: hairline }]} />

              <View style={styles.lockupWrap}>
                <Image
                  source={MASTHEADS[background] ?? MASTHEADS.cream}
                  style={styles.lockup}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.metaRow}>
                <Text
                  style={[styles.metaDate, { color: colors.inkMid, fontFamily: fontFamily.regular }]}
                  numberOfLines={2}
                >
                  {publishedDateStr(bundleReceivedAt, lang.code)}
                </Text>
                <Text style={[styles.metaVol, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                  {briefVolume > 0 ? `Vol. ${toRoman(briefVolume)}` : ''}
                </Text>
              </View>

              <View style={[styles.ruleInner, { backgroundColor: hairline }]} />

              <Text style={[styles.tagline, { color: colors.inkMid, fontFamily: fontFamily.italic }]}>
                {tagline}
              </Text>

              {/* Page dots — only rendered when there are multiple languages */}
              {langCount > 1 && (
                <View style={styles.dotsRow}>
                  {activeLanguages.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: i === currentPage ? colors.inkMid : colors.borderMid,
                          width: i === currentPage ? 16 : 5,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}

              <View style={[styles.hairline, { backgroundColor: colors.borderLight }]} />

              {/* ── Language content ────────────────────────────────────── */}
              <LanguageBriefingSection
                langCode={lang.code}
                nativeName={lang.nativeName}
                level={level}
                briefing={displayBriefing}
                isGenerating={generatingFor.includes(lang.code)}
                error={errorsFor[lang.code]}
                isFirst
                topics={settings.topics}
                weather={weatherByLang[lang.code] ?? null}
                isTransitioning={isTransitioning}
                onRetry={() => {
                  clearError(lang.code);
                  loadBriefing(lang.code, level, length, true);
                }}
              />

              {/* ── Page footer ─────────────────────────────────────────── */}
              {displayBriefing && (
                <View style={styles.articleFooter}>
                  <View style={[styles.ruleOuter, { backgroundColor: chrome }]} />
                  <View style={[styles.ruleInner, { backgroundColor: hairline }]} />
                  <Text style={[styles.footerDate, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                    {publishedDateStr(bundleReceivedAt, lang.code)}
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
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager:     { flex: 1 },

  page:        { width: SCREEN_WIDTH },
  pageContent: {},

  ruleOuter: { height: 2, width: SCREEN_WIDTH },
  ruleInner: { height: 1, width: SCREEN_WIDTH, marginVertical: 2 },
  hairline:  { height: StyleSheet.hairlineWidth, width: SCREEN_WIDTH },

  cities: {
    width: SCREEN_WIDTH,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    paddingVertical: 6,
  },
  lockupWrap: {
    width: SCREEN_WIDTH,
    paddingHorizontal: LOCKUP_PADDING,
    paddingTop: 4,
    paddingBottom: 2,
  },
  lockup: {
    width: LOCKUP_W,
    height: LOCKUP_H,
  },
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
  tagline: {
    width: SCREEN_WIDTH,
    fontSize: 14,
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },

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
});

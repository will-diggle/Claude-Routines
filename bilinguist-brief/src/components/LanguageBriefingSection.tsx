import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { BriefingArticle } from './BriefingArticle';
import { BriefingLoading } from './BriefingLoading';
import { TappableText } from './TappableText';
import { WordPopup } from './WordPopup';
import { Spacing } from '../theme';
import type { GeneratedBriefing, BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel, Topics } from '../store/useSettingsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { NATIVE_WRITING_LEVEL } from '../services/prompts';
import type { WeatherData } from '../services/weather';
import { WEATHER_IN } from '../services/weather';
import { codeToIoniconName } from './WeatherStrip';
import { useBriefingStore } from '../store/useBriefingStore';

// Maps the genre strings the API returns to settings topic keys
const GENRE_TO_TOPIC: Record<string, keyof Topics> = {
  'GLOBAL NEWS':          'worldNews',
  'UK POLITICS':          'ukPolitics',
  'POLITICS':             'politics',
  'BUSINESS & ECONOMY':  'business',
  'SCIENCE & TECHNOLOGY':'scienceTech',
  'ARTS & CULTURE':      'artsCulture',
  'ASIA':                'asia',
  'EUROPE':              'europe',
  'MIDDLE EAST':         'middleEast',
  'AFRICA':              'africa',
  'GOOD NEWS':           'goodNews',
};

// Genre labels translated into each supported language.
// The API always returns genre in English — we translate on the display side.
const GENRE_LABELS: Record<string, Partial<Record<LanguageCode, string>>> = {
  'GLOBAL NEWS':          { en: 'GLOBAL NEWS',        fr: 'ACTUALITÉS MONDIALES',    de: 'WELTNACHRICHTEN',         es: 'NOTICIAS MUNDIALES',    it: 'NOTIZIE MONDIALI',      sv: 'VÄRLDSNYHETER'       },
  'UK POLITICS':          { en: 'UK POLITICS',        fr: 'POLITIQUE BRITANNIQUE',   de: 'BRITISCHE POLITIK',       es: 'POLÍTICA BRITÁNICA',    it: 'POLITICA BRITANNICA',   sv: 'BRITTISK POLITIK'    },
  'POLITICS':             { en: 'POLITICS',            fr: 'POLITIQUE',               de: 'POLITIK',                 es: 'POLÍTICA',              it: 'POLITICA',              sv: 'POLITIK'             },
  'BUSINESS & ECONOMY':  { en: 'BUSINESS & ECONOMY',  fr: 'ÉCONOMIE',             de: 'WIRTSCHAFT',              es: 'ECONOMÍA',              it: 'ECONOMIA',              sv: 'EKONOMI'             },
  'SCIENCE & TECHNOLOGY':{ en: 'SCIENCES & TECH',     fr: 'SCIENCES & TECH',      de: 'WISSENSCHAFT & TECHNIK',  es: 'CIENCIA & TECNOLOGÍA',  it: 'SCIENZA & TECNICA',     sv: 'VETENSKAP & TEKNIK'  },
  'ARTS & CULTURE':      { en: 'ARTS & CULTURE',      fr: 'ARTS & CULTURE',       de: 'KUNST & KULTUR',          es: 'ARTES & CULTURA',       it: 'ARTI & CULTURA',        sv: 'KULTUR'              },
  'ASIA':                { en: 'ASIA',                fr: 'ASIE',                 de: 'ASIEN',                   es: 'ASIA',                  it: 'ASIA',                  sv: 'ASIEN'               },
  'EUROPE':              { en: 'EUROPE',              fr: 'EUROPE',               de: 'EUROPA',                  es: 'EUROPA',                it: 'EUROPA',                sv: 'EUROPA'              },
  'MIDDLE EAST':         { en: 'MIDDLE EAST',         fr: 'MOYEN-ORIENT',         de: 'NAHER OSTEN',             es: 'ORIENTE MEDIO',         it: 'MEDIO ORIENTE',         sv: 'MELLANÖSTERN'        },
  'AFRICA':              { en: 'AFRICA',              fr: 'AFRIQUE',              de: 'AFRIKA',                  es: 'ÁFRICA',                it: 'AFRICA',                sv: 'AFRIKA'              },
  'GOOD NEWS':           { en: 'GOOD NEWS',           fr: 'BONNES NOUVELLES',     de: 'GUTE NACHRICHTEN',        es: 'BUENAS NOTICIAS',       it: 'BUONE NOTIZIE',         sv: 'GODA NYHETER'        },
};

function translateGenre(genre: string, lang: LanguageCode): string {
  const key = genre.toUpperCase();
  return GENRE_LABELS[key]?.[lang] ?? genre.toUpperCase();
}

// Genre accent colour map
const GENRE_COLORS: Record<string, string> = {
  'GLOBAL NEWS':          '#4A6FA5',
  'UK POLITICS':          '#8B1A1A',
  'POLITICS':             '#8B1A1A',
  'BUSINESS & ECONOMY':  '#1E6B3A',
  'SCIENCE & TECHNOLOGY':'#005F73',
  'ARTS & CULTURE':      '#6A1B9A',
  'ASIA':                '#7B4F3A',
  'EUROPE':              '#3D5A80',
  'MIDDLE EAST':         '#8B5E3C',
  'AFRICA':              '#9B6B0C',
  'GOOD NEWS':           '#2E7D32',
};

function genreColor(genre: string): string {
  return GENRE_COLORS[genre.toUpperCase()] ?? '#3D3D3D';
}

// Localised word for "Native" — second half of the "B2 / Native" label.
const NATIVE_WORD: Partial<Record<LanguageCode, string>> = {
  en: 'Native', fr: 'Natif', de: 'Muttersprachlich',
  es: 'Nativo', it: 'Madrelingua', sv: 'Modersmål',
};

interface Props {
  langCode: LanguageCode;
  nativeName: string;
  level: LanguageLevel;
  briefing: GeneratedBriefing | undefined;
  isGenerating: boolean;
  error: string | undefined;
  isFirst: boolean;
  topics: Topics;
  weather?: WeatherData | null;
  isTransitioning?: boolean;
  hideEditionHeader?: boolean;
  onRetry: () => void;
}

function formatGeneratedAt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Build the masthead level label. For the 'Native' track, use today's Prompt 4
// graded CEFR level from the store (e.g. "B2 / Muttersprachlich"). Falls back
// to NATIVE_WRITING_LEVEL (C1) when grading hasn't run yet.
function levelLabel(level: LanguageLevel, langCode: LanguageCode, nativeGrade?: LanguageLevel): string {
  if (level === 'Native') {
    const grade = nativeGrade ?? NATIVE_WRITING_LEVEL;
    return `${grade} / ${NATIVE_WORD[langCode] ?? 'Native'}`;
  }
  return level;
}

// Group consecutive articles by genre
interface GenreGroup {
  genre: string;
  articles: Article[];
}

function groupByGenre(articles: Article[]): GenreGroup[] {
  const groups: GenreGroup[] = [];
  for (const article of articles) {
    const key = article.genre.toUpperCase();
    const last = groups[groups.length - 1];
    if (last && last.genre === key) {
      last.articles.push(article);
    } else {
      groups.push({ genre: key, articles: [article] });
    }
  }
  return groups;
}

// Sweeping progress line — 2 px rule that slides left → right on loop while
// a new level or length is loading. Mounts/unmounts with isTransitioning.
function SweepRule({ color }: { color: string }) {
  const { width } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <View style={{ height: 2, width, overflow: 'hidden' }}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: 2,
          width,
          backgroundColor: color,
          transform: [{ translateX }],
        }}
      />
    </View>
  );
}

function SectionHeader({
  label, accent, language, level,
}: { label: string; accent: string; language: LanguageCode; level: LanguageLevel }) {
  const { colors, fontFamily } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  return (
    <>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
        <View style={[styles.sectionColorBar, { backgroundColor: accent }]} />
        <TappableText
          text={label}
          style={[styles.sectionLabel, { color: accent, fontFamily: fontFamily.bold }]}
          activeWord={activeWord}
          onWordPress={(word) => setActiveWord(word)}
        />
      </View>
      {activeWord && (
        <WordPopup
          word={activeWord}
          sentence={label}
          language={language}
          level={level}
          onClose={() => setActiveWord(null)}
        />
      )}
    </>
  );
}

export function LanguageBriefingSection({
  langCode,
  nativeName,
  level,
  briefing,
  isGenerating,
  error,
  isFirst,
  topics,
  weather,
  isTransitioning = false,
  hideEditionHeader = false,
  onRetry,
}: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const setDeveloperMode = useSettingsStore((s) => s.setDeveloperMode);
  const nativeGradeByLang = useBriefingStore((s) => s.nativeGradeByLang);

  // Filter articles by enabled topics (client-side — no extra API call needed)
  const visibleArticles = briefing?.articles.filter((a) => {
    const topicKey = GENRE_TO_TOPIC[a.genre.toUpperCase()];
    if (!topicKey) return true;
    return topics[topicKey] !== false;
  }) ?? [];

  const hasContent = visibleArticles.length > 0;
  const genreGroups = groupByGenre(visibleArticles);

  return (
    <View>
      {/* Edition header — hidden when BriefingScreen renders it inline */}
      {!hideEditionHeader && (
        <View style={[styles.mastHead, { marginHorizontal: Spacing.md, marginTop: Spacing.sm }]}>
          <Text style={[styles.editionText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
            {nativeName.toUpperCase()} · {levelLabel(level, langCode, nativeGradeByLang[langCode])}
          </Text>
        </View>
      )}

      {/* Sweep progress line — slides left→right while loading a new level/length */}
      {isTransitioning && <SweepRule color={colors.inkDark} />}

      {/* Inline weather strip — centred, per-language */}
      {weather && (
        <View style={styles.weatherLine}>
          <Ionicons
            name={codeToIoniconName(weather.code ?? 0)}
            size={16}
            color={colors.inkFaint}
          />
          <Text style={[styles.weatherText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {`${weather.greeting} — ${weather.temp}°C, ${weather.description} ${WEATHER_IN[langCode] ?? 'in'} ${weather.city}`}
          </Text>
        </View>
      )}

      {(isGenerating || (!error && !briefing)) && <BriefingLoading />}

      {!isGenerating && error && (
        <View style={styles.centerBlock}>
          <Text style={[styles.emptyNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.demoBtn, { borderColor: colors.borderMid }]}
            onPress={() => { setDeveloperMode(true); onRetry(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.demoBtnText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
              Load demo content
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isGenerating && !error && briefing && !hasContent && (
        <View style={styles.centerBlock}>
          <Text style={[styles.emptyNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            All topics are hidden — turn some on in Settings to read the briefing.
          </Text>
        </View>
      )}

      {hasContent && (
        <>
          {genreGroups.map((group, groupIndex) => {
            const accent = genreColor(group.genre);
            const label = translateGenre(group.genre, langCode);
            return (
              <View key={`${group.genre}-${groupIndex}`}>
                {/* Section header — words are tappable */}
                <SectionHeader label={label} accent={accent} language={langCode} level={level} />

                {/* Articles in this genre group */}
                {group.articles.map((article, articleIndex) => (
                  <BriefingArticle
                    key={`${article.genre}-${groupIndex}-${articleIndex}`}
                    article={article}
                    isLast={articleIndex === group.articles.length - 1}
                    language={langCode}
                    level={level}
                    genre={article.genre}
                    date={briefing?.date ?? new Date().toISOString().split('T')[0]}
                    locked={false}
                    onLockedWordPress={() => {}}
                  />
                ))}
              </View>
            );
          })}

        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: 2,
    marginTop: Spacing.xl,
  },
  mastHead: {
    paddingBottom: Spacing.xs,
  },
  mastLineThick: { height: 2 },
  mastLineThin:  { height: 1, marginTop: 4 },
  editionText: { fontSize: 14, letterSpacing: 1.5, marginTop: 8, textAlign: 'center' },
  weatherLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 7,
  },
  weatherText: {
    fontSize: 14,
  },
  centerBlock: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  errorText: { textAlign: 'center', lineHeight: 24 },
  button: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  buttonText: { fontSize: 15 },
  emptyNote: { fontSize: 13, textAlign: 'center' },
  demoBtn: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  demoBtnText: { fontSize: 13 },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.md,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionColorBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
    marginRight: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  sectionFooter: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  footerText: { fontSize: 12 },
});

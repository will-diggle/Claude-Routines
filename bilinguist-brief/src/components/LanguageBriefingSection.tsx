import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { BriefingArticle } from './BriefingArticle';
import { BriefingLoading } from './BriefingLoading';
import { Spacing } from '../theme';
import type { GeneratedBriefing, BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel, Topics } from '../store/useSettingsStore';
import { NATIVE_WRITING_LEVEL } from '../services/prompts';
import type { WeatherData } from '../services/weather';
import { codeToIoniconName } from './WeatherStrip';

// Maps the genre strings the API returns to settings topic keys
const GENRE_TO_TOPIC: Record<string, keyof Topics> = {
  'GLOBAL NEWS':          'worldNews',
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
  'GLOBAL NEWS':          { en: 'GLOBAL NEWS',        fr: 'ACTUALITÉS MONDIALES', de: 'WELTNACHRICHTEN',         es: 'NOTICIAS MUNDIALES',    it: 'NOTIZIE MONDIALI',      sv: 'VÄRLDSNYHETER'       },
  'POLITICS':             { en: 'POLITICS',            fr: 'POLITIQUE',            de: 'POLITIK',                 es: 'POLÍTICA',              it: 'POLITICA',              sv: 'POLITIK'             },
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

// The native/journalistic tier label — driven by NATIVE_WRITING_LEVEL in prompts.ts
// so it stays in sync if the writing system ever defines a higher tier.
const NATIVE_LEVEL_LABEL: Record<LanguageCode, string> = {
  en: `${NATIVE_WRITING_LEVEL} / Native`,
  fr: `${NATIVE_WRITING_LEVEL} / Natif`,
  de: `${NATIVE_WRITING_LEVEL} / Muttersprachlich`,
  es: `${NATIVE_WRITING_LEVEL} / Nativo`,
  it: `${NATIVE_WRITING_LEVEL} / Madrelingua`,
  sv: `${NATIVE_WRITING_LEVEL} / Modersmål`,
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
  onRetry: () => void;
}

function formatGeneratedAt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function levelLabel(level: LanguageLevel, langCode: LanguageCode): string {
  if (level === NATIVE_WRITING_LEVEL || level === 'Native') {
    return NATIVE_LEVEL_LABEL[langCode] ?? `${NATIVE_WRITING_LEVEL} / Native`;
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
  onRetry,
}: Props) {
  const { colors, fontFamily, fontSize } = useTheme();

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
      {!isFirst && <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />}

      {/* Edition header — newspaper style */}
      <View style={[styles.editionRow, { borderTopColor: colors.inkDark, borderBottomColor: colors.inkDark }]}>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
        <Text style={[styles.editionText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
          {nativeName.toUpperCase()} · {levelLabel(level, langCode)}
        </Text>
        <View style={[styles.editionRule, { backgroundColor: colors.inkDark }]} />
      </View>
      <View style={[styles.mastRule, { backgroundColor: colors.inkDark }]} />

      {/* Inline weather strip — compact, per-language */}
      {weather && (
        <View style={styles.weatherLine}>
          <Ionicons
            name={codeToIoniconName(weather.code ?? 0)}
            size={12}
            color={colors.inkFaint}
            style={styles.weatherIcon}
          />
          <Text style={[styles.weatherText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {`${weather.greeting} — ${weather.temp}°C, ${weather.description} in ${weather.city}`}
          </Text>
        </View>
      )}

      {(isGenerating || (!error && !briefing)) && <BriefingLoading />}

      {!isGenerating && error && (
        <View style={styles.centerBlock}>
          <Text style={[styles.emptyNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            {error}
          </Text>
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
                {/* Section header */}
                <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
                  <View style={[styles.sectionColorBar, { backgroundColor: accent }]} />
                  <Text style={[styles.sectionLabel, { color: accent, fontFamily: fontFamily.regular }]}>
                    {label}
                  </Text>
                </View>

                {/* Articles in this genre group */}
                {group.articles.map((article, articleIndex) => (
                  <BriefingArticle
                    key={`${article.genre}-${groupIndex}-${articleIndex}`}
                    article={article}
                    isLast={articleIndex === group.articles.length - 1}
                    language={langCode}
                    level={level}
                    locked={false}
                    onLockedWordPress={() => {}}
                  />
                ))}
              </View>
            );
          })}

          <View style={[styles.sectionFooter, { borderTopColor: colors.borderLight }]}>
            <Text style={[styles.footerText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
              {briefing?.generatedAt
                ? `Published ${formatGeneratedAt(briefing.generatedAt)}`
                : 'Published by Claude with live web search'}
            </Text>
          </View>
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
  editionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    marginTop: Spacing.sm,
  },
  editionRule: { flex: 1, height: 1 },
  editionText: { fontSize: 11, letterSpacing: 1.5, paddingHorizontal: Spacing.sm },
  mastRule: { height: 1, marginHorizontal: Spacing.md, marginBottom: Spacing.xs },
  weatherLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 4,
  },
  weatherIcon: {
    marginTop: 1,
  },
  weatherText: {
    fontSize: 12,
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
    height: 14,
    borderRadius: 2,
    marginRight: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
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

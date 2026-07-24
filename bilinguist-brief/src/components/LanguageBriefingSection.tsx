import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { BriefingArticle } from './BriefingArticle';
import { BriefingLoading } from './BriefingLoading';
import { TappableText } from './TappableText';
import { WordPopup } from './WordPopup';
import { Spacing } from '../theme';
import type { GeneratedBriefing, BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel, Topics } from '../store/useSettingsStore';
import type { ArticleLength } from '../services/anthropic';
import { useSettingsStore } from '../store/useSettingsStore';
import { NATIVE_WRITING_LEVEL } from '../services/prompts';
import type { WeatherData } from '../services/weather';
import { WeatherCard } from './WeatherCard';
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
// The API should return genre in English, but some language pipelines (e.g. Native
// journalism) may translate it. translateGenre handles both directions.
const GENRE_LABELS: Record<string, Partial<Record<LanguageCode, string>>> = {
  'GLOBAL NEWS':          { en: 'GLOBAL NEWS',        fr: 'ACTUALITÉS MONDIALES',    de: 'WELTNACHRICHTEN',         es: 'NOTICIAS MUNDIALES',    it: 'NOTIZIE MONDIALI',      sv: 'VÄRLDSNYHETER',        hu: 'VILÁGHÍREK',          ar: 'أخبار عالمية'      },
  'UK POLITICS':          { en: 'UK POLITICS',        fr: 'POLITIQUE BRITANNIQUE',   de: 'BRITISCHE POLITIK',       es: 'POLÍTICA BRITÁNICA',    it: 'POLITICA BRITANNICA',   sv: 'BRITTISK POLITIK',     hu: 'BRIT POLITIKA',       ar: 'السياسة البريطانية' },
  'POLITICS':             { en: 'POLITICS',            fr: 'POLITIQUE',               de: 'POLITIK',                 es: 'POLÍTICA',              it: 'POLITICA',              sv: 'POLITIK',              hu: 'POLITIKA',            ar: 'السياسة'           },
  'BUSINESS & ECONOMY':  { en: 'BUSINESS & ECONOMY',  fr: 'ÉCONOMIE',             de: 'WIRTSCHAFT',              es: 'ECONOMÍA',              it: 'ECONOMIA',              sv: 'EKONOMI',              hu: 'GAZDASÁG',            ar: 'الاقتصاد'          },
  'SCIENCE & TECHNOLOGY':{ en: 'SCIENCES & TECH',     fr: 'SCIENCES & TECH',      de: 'WISSENSCHAFT & TECHNIK',  es: 'CIENCIA & TECNOLOGÍA',  it: 'SCIENZA & TECNICA',     sv: 'VETENSKAP & TEKNIK',   hu: 'TUDOMÁNY & TECH',     ar: 'العلوم والتكنولوجيا' },
  'ARTS & CULTURE':      { en: 'ARTS & CULTURE',      fr: 'ARTS & CULTURE',       de: 'KUNST & KULTUR',          es: 'ARTES & CULTURA',       it: 'ARTI & CULTURA',        sv: 'KULTUR',               hu: 'KULTÚRA',             ar: 'الفنون والثقافة'   },
  'ASIA':                { en: 'ASIA',                fr: 'ASIE',                 de: 'ASIEN',                   es: 'ASIA',                  it: 'ASIA',                  sv: 'ASIEN',                hu: 'ÁZSIA',               ar: 'آسيا'              },
  'EUROPE':              { en: 'EUROPE',              fr: 'EUROPE',               de: 'EUROPA',                  es: 'EUROPA',                it: 'EUROPA',                sv: 'EUROPA',               hu: 'EURÓPA',              ar: 'أوروبا'            },
  'MIDDLE EAST':         { en: 'MIDDLE EAST',         fr: 'MOYEN-ORIENT',         de: 'NAHER OSTEN',             es: 'ORIENTE MEDIO',         it: 'MEDIO ORIENTE',         sv: 'MELLANÖSTERN',         hu: 'KÖZEL-KELET',         ar: 'الشرق الأوسط'     },
  'AFRICA':              { en: 'AFRICA',              fr: 'AFRIQUE',              de: 'AFRIKA',                  es: 'ÁFRICA',                it: 'AFRICA',                sv: 'AFRIKA',               hu: 'AFRIKA',              ar: 'أفريقيا'           },
  'GOOD NEWS':           { en: 'GOOD NEWS',           fr: 'BONNES NOUVELLES',     de: 'GUTE NACHRICHTEN',        es: 'BUENAS NOTICIAS',       it: 'BUONE NOTIZIE',         sv: 'GODA NYHETER',         hu: 'JÓ HÍREK',            ar: 'أخبار سارة'        },
};

// Reverse map: any translated label (any language) → canonical English key.
// Used when the API returns a genre already translated into the target language.
const GENRE_REVERSE: Record<string, string> = {};
for (const [englishKey, langs] of Object.entries(GENRE_LABELS)) {
  for (const translated of Object.values(langs)) {
    if (translated) GENRE_REVERSE[translated.toUpperCase()] = englishKey;
  }
}

function translateGenre(genre: string, lang: LanguageCode): string {
  const upper = genre.toUpperCase();
  // Direct lookup: genre is already an English canonical key
  const direct = GENRE_LABELS[upper]?.[lang];
  if (direct) return direct;
  // Reverse lookup: genre may be a translated label — map back to the English key first
  const canonicalKey = GENRE_REVERSE[upper];
  if (canonicalKey) return GENRE_LABELS[canonicalKey]?.[lang] ?? upper;
  return upper;
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
  tr: 'Yerel', hu: 'Anyanyelvi', ar: 'متقدم',
};

interface Props {
  langCode: LanguageCode;
  nativeName: string;
  level: LanguageLevel;
  length?: ArticleLength;
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

const SHARE_WORD: Partial<Record<LanguageCode, string>> = {
  en: 'Share', fr: 'Partager', de: 'Teilen', es: 'Compartir',
  it: 'Condividi', sv: 'Dela', tr: 'Paylaş', hu: 'Megosztás', ar: 'مشاركة',
};

const SHARE_INTRO: Partial<Record<LanguageCode, string>> = {
  en: 'The Bilinguist Brief reported:',
  fr: 'Le Bilinguist Brief a rapporté :',
  de: 'Das Bilinguist Brief berichtete:',
  es: 'El Bilinguist Brief informó:',
  it: 'Il Bilinguist Brief ha riportato:',
  sv: 'Bilinguist Brief rapporterade:',
  tr: "Bilinguist Brief'te bildirildi:",
  hu: 'A Bilinguist Brief közölte:',
  ar: ':أفادت نشرة Bilinguist Brief',
};

const LANG_NAME_EN: Partial<Record<LanguageCode, string>> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish',
  it: 'Italian', sv: 'Swedish', tr: 'Turkish', hu: 'Hungarian', ar: 'Arabic',
};

const GENRE_BRIEF_DISCLAIMER: Record<string, string> = {
  'GLOBAL NEWS':         'may contain technical words beyond A1',
  'UK POLITICS':         'may contain political words beyond A1',
  'POLITICS':            'may contain political words beyond A1',
  'BUSINESS & ECONOMY':  'may contain financial words beyond A1',
  'EUROPE':              'may contain geopolitical words beyond A1',
  'MIDDLE EAST':         'may contain geopolitical words beyond A1',
  'AFRICA':              'may contain geopolitical words beyond A1',
  'ASIA':                'may contain geopolitical words beyond A1',
};

function SectionHeader({
  label, accent, language, level, genre, articles,
}: { label: string; accent: string; language: LanguageCode; level: LanguageLevel; genre: string; articles: Article[] }) {
  const { colors, fontFamily } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const briefDisclaimer = level === 'A1' ? GENRE_BRIEF_DISCLAIMER[genre.toUpperCase()] : undefined;

  function handleShare() {
    const intro = SHARE_INTRO[language] ?? SHARE_INTRO.en!;
    const langName = LANG_NAME_EN[language] ?? language.toUpperCase();
    const footer = `For more ${level} ${langName} stories, download the Bilinguist Brief.`;
    const body = articles
      .map(a => `${a.headline}\n\n${a.body}`)
      .join('\n\n─\n\n');
    const message = `${intro}\n\n${label}\n\n${body}\n\n─\n\n${footer}`;
    Share.share({ message });
  }

  return (
    <>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
        <View style={[styles.sectionColorBar, { backgroundColor: accent }]} />
        <View style={{ flex: 1 }}>
          <TappableText
            text={label}
            style={[styles.sectionLabel, { color: accent, fontFamily: fontFamily.bold }]}
            activeWord={activeWord}
            onWordPress={(_pos, word) => setActiveWord(word)}
          />
          {briefDisclaimer && (
            <Text style={[styles.vocabDisclaimer, { color: colors.inkFaint, fontFamily: fontFamily.italic ?? fontFamily.regular }]}>
              {briefDisclaimer}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.sectionShareBtn}
        >
          <Ionicons name="share-social-outline" size={14} color={colors.inkFaint} />
          <Text style={[styles.sectionShareLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            {SHARE_WORD[language] ?? 'Share'}
          </Text>
        </TouchableOpacity>
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
  length,
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

      {/* Weather card — phrase + interactive radar map */}
      {weather && (
        <WeatherCard
          weather={weather}
          language={langCode}
          level={level}
        />
      )}

      {(isTransitioning || isGenerating || (!error && !briefing)) && <BriefingLoading long={length === 'longer'} />}

      {!isTransitioning && !isGenerating && error && (
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

      {!isTransitioning && !isGenerating && !error && briefing && !hasContent && (
        <View style={styles.centerBlock}>
          <Text style={[styles.emptyNote, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            All topics are hidden — turn some on in Settings to read the briefing.
          </Text>
        </View>
      )}

      {!isTransitioning && hasContent && (
        <>
          {genreGroups.map((group, groupIndex) => {
            const accent = genreColor(group.genre);
            const label = translateGenre(group.genre, langCode);
            return (
              <View key={`${group.genre}-${groupIndex}`}>
                {/* Section header — words are tappable, share button right */}
                <SectionHeader label={label} accent={accent} language={langCode} level={level} genre={group.genre} articles={group.articles} />

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
  vocabDisclaimer: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
    marginLeft: Spacing.sm,
  },
  sectionShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
  },
  sectionShareLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
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

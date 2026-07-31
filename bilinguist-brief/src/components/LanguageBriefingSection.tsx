import React, { useRef, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, useWindowDimensions } from 'react-native';
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
import { WeatherCard, WeatherCardHandle, codeToIcon, codeToColor, codeToNightIcon, codeToNightColor } from './WeatherCard';
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
  'WEATHER':             { en: 'WEATHER',             fr: 'MÉTÉO',                de: 'WETTER',                  es: 'TIEMPO',                it: 'METEO',                 sv: 'VÄDER',                hu: 'IDŐJÁRÁS',            ar: 'الطقس'             },
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
  'WEATHER':             '#B45309',
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
  weatherModalY?: number;
  isTransitioning?: boolean;
  hideEditionHeader?: boolean;
  bundleReceivedAt?: number | null;
  onRetry: () => void;
}

const LANG_LOCALE: Partial<Record<LanguageCode, string>> = {
  en: 'en-GB', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
  es: 'es-ES', sv: 'sv-SE', tr: 'tr-TR', hu: 'hu-HU', ar: 'ar-SA',
};

const BRIEF_PUBLISHED: Partial<Record<LanguageCode, string>> = {
  en: 'Brief published',
  fr: 'Brief publié',
  de: 'Brief veröffentlicht',
  it: 'Brief pubblicato',
  es: 'Brief publicado',
  sv: 'Brief publicerat',
  tr: 'Brief yayınlandı',
  hu: 'Brief közzétéve',
  ar: 'نُشر البريف',
};

function briefPublishedLabel(language: LanguageCode, ts: number): string {
  const locale = LANG_LOCALE[language] ?? 'en-GB';
  const d = new Date(ts);
  const day = d.getDate();
  const month = d.toLocaleDateString(locale, { month: 'short' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const prefix = BRIEF_PUBLISHED[language] ?? 'Brief published';
  return `${prefix} ${day} ${month} · ${time}`;
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

function WeatherSectionHeader({ language, level, weatherCode, utcOffsetSeconds, onOpenModal, publishedTs, iPadLayout }: { language: LanguageCode; level: LanguageLevel; weatherCode?: number; utcOffsetSeconds?: number; onOpenModal?: () => void; publishedTs?: number | null; iPadLayout?: boolean }) {
  const { colors, fontFamily, isDark } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const accent = GENRE_COLORS['WEATHER'];
  const label = translateGenre('WEATHER', language);
  const currentHour = Math.floor(((Date.now() / 1000) + (utcOffsetSeconds ?? 0)) / 3600) % 24;
  const isLocationNight = currentHour < 5 || currentHour >= 20;
  return (
    <>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
        <View style={[styles.sectionColorBar, { backgroundColor: accent }]} />
        <TappableText
          text={label}
          style={[styles.sectionLabel, { color: accent, fontFamily: fontFamily.bold }]}
          activeWord={activeWord}
          onWordPress={(_pos, word) => setActiveWord(word)}
        />
        {weatherCode !== undefined && !iPadLayout && (
          <TouchableOpacity
            onPress={onOpenModal}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isLocationNight ? codeToNightIcon(weatherCode) : codeToIcon(weatherCode)}
              size={18}
              color={isLocationNight ? codeToNightColor(weatherCode, isDark) : codeToColor(weatherCode)}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
        )}
        {publishedTs ? (
          <Text style={[styles.sectionDate, { color: colors.inkFaint, fontFamily: fontFamily.regular, marginLeft: 'auto' }]}>
            {briefPublishedLabel(language, publishedTs)}
          </Text>
        ) : null}
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

function SectionHeader({
  label, accent, language, level, genre, isFirst, publishedTs,
}: { label: string; accent: string; language: LanguageCode; level: LanguageLevel; genre: string; isFirst?: boolean; publishedTs?: number | null }) {
  const { colors, fontFamily } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const briefDisclaimer = level === 'A1' ? GENRE_BRIEF_DISCLAIMER[genre.toUpperCase()] : undefined;

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
        {isFirst && publishedTs ? (
          <Text style={[styles.sectionDate, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            {briefPublishedLabel(language, publishedTs)}
          </Text>
        ) : null}
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
  weatherModalY,
  isTransitioning = false,
  hideEditionHeader = false,
  bundleReceivedAt,
  onRetry,
}: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const setDeveloperMode = useSettingsStore((s) => s.setDeveloperMode);
  const nativeGradeByLang = useBriefingStore((s) => s.nativeGradeByLang);
  const topicOrder = useSettingsStore((s) => s.topicOrder);

  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isIPad = winWidth >= 768;
  const isLandscape = winWidth > winHeight;

  // Filter articles by enabled topics (client-side — no extra API call needed)
  const visibleArticles = useMemo(() => (briefing?.articles.filter((a) => {
    const topicKey = GENRE_TO_TOPIC[a.genre.toUpperCase()];
    if (!topicKey) return true;
    return topics[topicKey] !== false;
  }) ?? []), [briefing?.articles, topics]);

  const hasContent = visibleArticles.length > 0;

  // Build a unified sorted render list — weather and article genre groups ordered by topicOrder
  type RenderItem = { type: 'weather' } | { type: 'group'; group: GenreGroup };
  const sortedItems = useMemo((): RenderItem[] => {
    const groups = groupByGenre(visibleArticles);
    const items: RenderItem[] = groups.map((group) => ({ type: 'group' as const, group }));
    if (weather) items.push({ type: 'weather' as const });
    return items.sort((a, b) => {
      const aIdx = a.type === 'weather'
        ? topicOrder.indexOf('weather')
        : (() => { const k = GENRE_TO_TOPIC[a.group.genre] as string | undefined; return k ? topicOrder.indexOf(k) : 999; })();
      const bIdx = b.type === 'weather'
        ? topicOrder.indexOf('weather')
        : (() => { const k = GENRE_TO_TOPIC[b.group.genre] as string | undefined; return k ? topicOrder.indexOf(k) : 999; })();
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [visibleArticles, weather, topicOrder]);

  // Keep genreGroups for hasContent check
  const genreGroups = useMemo(() => sortedItems.filter((i) => i.type === 'group').map((i) => (i as { type: 'group'; group: GenreGroup }).group), [sortedItems]);

  const weatherCardRef = useRef<WeatherCardHandle>(null);

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

      {/* Weather and article genre groups — rendered in topicOrder sequence */}

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
          {sortedItems.map((item, itemIndex) => {
            if (item.type === 'weather') {
              return (
                <React.Fragment key="weather">
                  <WeatherSectionHeader
                    language={langCode} level={level} weatherCode={weather!.code}
                    utcOffsetSeconds={weather!.utcOffsetSeconds}
                    onOpenModal={() => weatherCardRef.current?.openModal()}
                    publishedTs={bundleReceivedAt}
                    iPadLayout={isIPad}
                  />
                  <WeatherCard
                    ref={weatherCardRef}
                    weather={weather!}
                    language={langCode}
                    level={level}
                    modalY={weatherModalY}
                    iPadLayout={isIPad}
                  />
                </React.Fragment>
              );
            }

            const { group } = item;
            const groupIndex = itemIndex;
            const accent = genreColor(group.genre);
            const label = translateGenre(group.genre, langCode);
            const intro = SHARE_INTRO[langCode] ?? SHARE_INTRO.en!;
            const langName = LANG_NAME_EN[langCode] ?? langCode.toUpperCase();
            const shareFooter = `For more ${level} ${langName} stories, download the Bilinguist Brief.`;
            const shareBody = group.articles.map(a => `${a.headline}\n\n${a.body}`).join('\n\n─\n\n');
            const shareMsg = `${intro}\n\n${label}\n\n${shareBody}\n\n─\n\n${shareFooter}`;
            const isFirstItem = itemIndex === 0;

            // iPad column count: 3 for Global News in landscape, 2 otherwise
            const isGlobalNews = group.genre === 'GLOBAL NEWS';
            const colCount = isIPad ? (isGlobalNews && isLandscape ? 3 : 2) : 1;
            const colPct = `${Math.floor(100 / colCount)}%` as `${number}%`;

            return (
              <View key={`${group.genre}-${groupIndex}`}>
                <SectionHeader
                  label={label}
                  accent={accent}
                  language={langCode}
                  level={level}
                  genre={group.genre}
                  isFirst={isFirstItem}
                  publishedTs={bundleReceivedAt}
                />

                <View style={isIPad ? { flexDirection: 'row', flexWrap: 'wrap' } : undefined}>
                  {group.articles.map((article, articleIndex) => (
                    <View key={`${article.genre}-${groupIndex}-${articleIndex}`} style={isIPad ? { width: colPct } : undefined}>
                      <BriefingArticle
                        article={article}
                        isLast={!isIPad && articleIndex === group.articles.length - 1}
                        language={langCode}
                        level={level}
                        genre={article.genre}
                        date={briefing?.date ?? new Date().toISOString().split('T')[0]}
                        locked={false}
                        onLockedWordPress={() => {}}
                      />
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={() => Share.share({ message: shareMsg })}
                  activeOpacity={0.6}
                  style={styles.groupShareBtn}
                >
                  <Ionicons name="share-social-outline" size={13} color={colors.inkFaint} />
                  <Text style={[styles.sectionShareLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {SHARE_WORD[langCode] ?? 'Share'}
                  </Text>
                </TouchableOpacity>
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
  sectionDate: {
    fontSize: 11,
    opacity: 0.6,
    paddingLeft: 8,
  },
  sectionShareLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  groupShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignSelf: 'flex-end',
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

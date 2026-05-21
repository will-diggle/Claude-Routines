import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText } from './TappableText';
import { WordPopup } from './WordPopup';
import type { BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

// Genre labels translated into each supported language.
// The API always returns genre in English — we translate on the display side.
const GENRE_LABELS: Record<string, Partial<Record<LanguageCode, string>>> = {
  'GLOBAL NEWS':          { en: 'GLOBAL NEWS',       fr: 'ACTUALITÉS MONDIALES', de: 'WELTNACHRICHTEN',         es: 'NOTICIAS MUNDIALES',    it: 'NOTIZIE MONDIALI'     },
  'POLITICS':             { en: 'POLITICS',           fr: 'POLITIQUE',            de: 'POLITIK',                 es: 'POLÍTICA',              it: 'POLITICA'             },
  'BUSINESS & ECONOMY':   { en: 'BUSINESS & ECONOMY', fr: 'ÉCONOMIE',             de: 'WIRTSCHAFT',              es: 'ECONOMÍA',              it: 'ECONOMIA'             },
  'SCIENCE & TECHNOLOGY': { en: 'SCIENCES & TECH',    fr: 'SCIENCES & TECH',      de: 'WISSENSCHAFT & TECHNIK',  es: 'CIENCIA & TECNOLOGÍA',  it: 'SCIENZA & TECNICA'    },
  'ARTS & CULTURE':       { en: 'ARTS & CULTURE',     fr: 'ARTS & CULTURE',       de: 'KUNST & KULTUR',          es: 'ARTES & CULTURA',       it: 'ARTI & CULTURA'       },
  'GOOD NEWS':            { en: 'GOOD NEWS',          fr: 'BONNES NOUVELLES',     de: 'GUTE NACHRICHTEN',        es: 'BUENAS NOTICIAS',       it: 'BUONE NOTIZIE'        },
};

function translateGenre(genre: string, lang: LanguageCode): string {
  const key = genre.toUpperCase();
  return GENRE_LABELS[key]?.[lang] ?? genre.toUpperCase();
}

interface Props {
  article: Article;
  isLast: boolean;
  language: LanguageCode;
  level: LanguageLevel;
  locked?: boolean;
  onLockedWordPress?: () => void;
}

export function BriefingArticle({ article, isLast, language, level, locked, onLockedWordPress }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [activeSentence, setActiveSentence] = useState('');

  function handleWordPress(word: string, sentence: string) {
    if (locked) { onLockedWordPress?.(); return; }
    setActiveWord(word);
    setActiveSentence(sentence);
  }

  function handleClose() {
    setActiveWord(null);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.section, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
        {translateGenre(article.genre, language)}
      </Text>

      <Text
        style={[
          styles.headline,
          { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading },
        ]}
      >
        {article.headline}
      </Text>

      <TappableText
        text={article.body}
        style={[styles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
        activeWord={activeWord}
        onWordPress={handleWordPress}
      />

      {!isLast && <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />}

      {activeWord && (
        <WordPopup
          word={activeWord}
          sentence={activeSentence}
          language={language}
          level={level}
          onClose={handleClose}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  section: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  headline: {
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  body: {
    lineHeight: 28,
    marginBottom: Spacing.lg,
    textAlign: 'justify',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
});

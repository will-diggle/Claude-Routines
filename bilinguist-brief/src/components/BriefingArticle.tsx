import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText } from './TappableText';
import { WordPopup } from './WordPopup';
import type { BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

interface Props {
  article: Article;
  isLast: boolean;
  language: LanguageCode;
  level: LanguageLevel;
}

export function BriefingArticle({ article, isLast, language, level }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [activeSentence, setActiveSentence] = useState('');

  function handleWordPress(word: string, sentence: string) {
    setActiveWord(word);
    setActiveSentence(sentence);
  }

  function handleClose() {
    setActiveWord(null);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.section, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
        {article.section.toUpperCase()}
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
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
});

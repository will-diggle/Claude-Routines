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
  genre?: string;
  locked?: boolean;
  onLockedWordPress?: () => void;
}

export function BriefingArticle({ article, isLast, language, level, genre, locked, onLockedWordPress }: Props) {
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
          genre={genre}
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

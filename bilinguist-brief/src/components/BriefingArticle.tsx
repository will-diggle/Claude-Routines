import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as analytics from '../services/analytics';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText } from './TappableText';
import { WordPopup } from './WordPopup';
import type { BriefingArticle as Article } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  article: Article;
  isLast: boolean;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;
  date: string;
  locked?: boolean;
  onLockedWordPress?: () => void;
}

export function BriefingArticle({ article, isLast, language, level, genre, date, locked, onLockedWordPress }: Props) {
  const { colors, fontFamily, fontSize } = useTheme();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [activeSentence, setActiveSentence] = useState('');
  const articleTappedRef = useRef(false);

  function handleWordPress(word: string, sentence: string) {
    if (locked) { onLockedWordPress?.(); return; }
    if (!articleTappedRef.current) {
      articleTappedRef.current = true;
      analytics.trackArticleTapped(language);
    }
    analytics.trackWordTapped(language, word);
    setActiveWord(word);
    setActiveSentence(sentence);
  }

  function handleClose() {
    setActiveWord(null);
  }

  return (
    <View style={styles.container}>

      {/* Headline */}
      <View style={styles.headlineRow}>
        <TappableText
          text={article.headline}
          style={[
            styles.headline,
            { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading },
          ]}
          activeWord={activeWord}
          onWordPress={handleWordPress}
        />
      </View>

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

  // Headline sits in a row so the audio button can float to the right
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    gap: 10,
  },
  headline: {
    lineHeight: 36,
    // flex: 1 set inline so headline wraps and button stays pinned right
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

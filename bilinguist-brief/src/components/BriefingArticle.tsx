import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText, countWordTokens, findWordPosition } from './TappableText';
import { lookupSeparableInfo } from '../services/dictionaryService';
import { WordPopup } from './WordPopup';
import type { BriefingArticle as Article, TokenMapEntry } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import * as analytics from '../services/analytics';

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

  // Word position of the first body word (= number of words in headline)
  const headlineWordCount = useMemo(
    () => countWordTokens(article.headline),
    [article.headline],
  );

  // Build a position-indexed lookup map from the token map for O(1) access
  const tokenByPosition = useMemo<Map<number, TokenMapEntry>>(() => {
    const map = new Map<number, TokenMapEntry>();
    for (const t of article.tokenMap ?? []) {
      map.set(t.position, t);
    }
    return map;
  }, [article.tokenMap]);

  // Highlighted word positions (article-global) — supports non-adjacent tokens
  const [activePositions, setActivePositions] = useState<Set<number>>(new Set());
  // The surface word shown in the popup header
  const [activeWord, setActiveWord] = useState<string | null>(null);
  // The lemma to look up (may differ from surface, e.g. "sehe" → "ansehen")
  const [activeLemma, setActiveLemma] = useState<string | null>(null);
  const [activeSentence, setActiveSentence] = useState('');

  const articleTappedRef = React.useRef(false);

  const handleWordPress = useCallback((
    wordPosition: number,
    word: string,
    sentence: string,
  ) => {
    if (locked) { onLockedWordPress?.(); return; }

    if (!articleTappedRef.current) {
      articleTappedRef.current = true;
      analytics.trackArticleTapped(language);
    }

    // Resolve lemma and linked positions from token map (if available)
    const tokenEntry = tokenByPosition.get(wordPosition);
    const lemma = tokenEntry?.lemma ?? word;
    const linked = tokenEntry?.linked_positions ?? [];
    const allPositions = new Set([wordPosition, ...linked]);

    setActivePositions(allPositions);
    setActiveWord(word);
    setActiveLemma(lemma);
    setActiveSentence(sentence);

    // Separable verb detection — de and sv only, fails silently
    if (language === 'de' || language === 'sv') {
      lookupSeparableInfo(lemma, language).then((sep) => {
        if (!sep?.separablePrefix) return;
        const partnerPos =
          findWordPosition(article.headline, sep.separablePrefix, 0) ??
          findWordPosition(article.body, sep.separablePrefix, headlineWordCount);
        if (partnerPos !== null) {
          setActivePositions((prev) => new Set([...prev, partnerPos]));
        }
      }).catch(() => {});
    }
  }, [locked, onLockedWordPress, tokenByPosition, language, article, headlineWordCount]);

  const handleClose = useCallback(() => {
    setActivePositions(new Set());
    setActiveWord(null);
    setActiveLemma(null);
  }, []);

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
          activePositions={activePositions}
          wordPositionOffset={0}
          onWordPress={handleWordPress}
        />
      </View>

      {/* Body */}
      <TappableText
        text={article.body}
        style={[styles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
        activePositions={activePositions}
        wordPositionOffset={headlineWordCount}
        onWordPress={handleWordPress}
      />

      {!isLast && <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />}

      {activeWord && (
        <WordPopup
          word={activeWord}
          lemma={activeLemma ?? activeWord}
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
  headlineRow: {
    marginBottom: Spacing.sm,
  },
  headline: {
    lineHeight: 28,
  },
  body: {
    lineHeight: 26,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: Spacing.lg,
  },
});

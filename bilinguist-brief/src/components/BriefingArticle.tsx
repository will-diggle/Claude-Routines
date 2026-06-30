import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
      (async () => {
        // 1. Direct lookup — works when lemma is already the full separable verb (e.g. "andauern")
        let sep = await lookupSeparableInfo(lemma, language).catch(() => null);

        // 2. Fallback: lemma is just the stem (e.g. "dauern"). Scan the sentence for
        //    known German separable prefixes; test prefix+stem against the dictionary.
        //    This fires only once at most — we stop at the first hit.
        if (!sep?.separablePrefix && language === 'de') {
          const DE_PREFIXES = [
            'an','ab','auf','aus','bei','durch','ein','los','mit',
            'nach','um','vor','weg','zu','zurück',
          ];
          // Strip punctuation from sentence words so "an," matches "an"
          const sentenceWords = sentence
            .split(/\s+/)
            .map((w) => w.toLowerCase().replace(/[^a-zäöüß]/gi, ''));
          const found = DE_PREFIXES.filter((p) => sentenceWords.includes(p));
          for (const prefix of found) {
            const candidate = await lookupSeparableInfo(prefix + lemma, language).catch(() => null);
            if (candidate?.separablePrefix) { sep = candidate; break; }
          }
        }

        if (!sep?.separablePrefix) return;
        const partnerPos =
          findWordPosition(article.headline, sep.separablePrefix, 0) ??
          findWordPosition(article.body, sep.separablePrefix, headlineWordCount);
        if (partnerPos !== null) {
          setActivePositions((prev) => new Set([...prev, partnerPos]));
        }
      })().catch(() => {});
    }
  }, [locked, onLockedWordPress, tokenByPosition, language, article, headlineWordCount]);

  const handleClose = useCallback(() => {
    setActivePositions(new Set());
    setActiveWord(null);
    setActiveLemma(null);
  }, []);

  const isRTL = language === 'ar';
  const arabicFontRegular = 'NotoNaskhArabic_400Regular';
  const arabicFontBold = 'NotoNaskhArabic_700Bold';

  return (
    <View style={[styles.container, isRTL && styles.containerRTL]}>

      {/* Headline */}
      <View style={styles.headlineRow}>
        <TappableText
          text={article.headline}
          style={[
            styles.headline,
            { color: colors.inkDark, fontFamily: isRTL ? arabicFontBold : fontFamily.bold, fontSize: fontSize.heading },
            isRTL && styles.rtlText,
          ]}
          activePositions={activePositions}
          wordPositionOffset={0}
          onWordPress={handleWordPress}
        />
      </View>

      {/* Body — split on double newlines to render proper paragraphs (RTL stays as one block) */}
      {isRTL ? (
        <TappableText
          text={article.body}
          style={[styles.body, { color: colors.inkMid, fontFamily: arabicFontRegular, fontSize: fontSize.body }, styles.rtlText]}
          activePositions={activePositions}
          wordPositionOffset={headlineWordCount}
          onWordPress={handleWordPress}
        />
      ) : (
        article.body.split(/\n\n+/).map((para, i, arr) => {
          const offset = headlineWordCount + arr.slice(0, i).reduce((sum, p) => sum + countWordTokens(p), 0);
          return (
            <TappableText
              key={i}
              text={para.trim()}
              style={[styles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }, i < arr.length - 1 && styles.paragraphGap]}
              activePositions={activePositions}
              wordPositionOffset={offset}
              onWordPress={handleWordPress}
            />
          );
        })
      )}

      {/* Share row */}
      <TouchableOpacity
        style={styles.shareRow}
        onPress={() => Share.share({ message: `${article.headline}\n\n${article.body}` })}
        activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="share-social-outline" size={15} color={colors.inkFaint} />
        <Text style={[styles.shareLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Share</Text>
      </TouchableOpacity>

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
  containerRTL: {
    alignItems: 'flex-end',
  },
  headlineRow: {
    marginBottom: Spacing.sm,
  },
  headline: {
    lineHeight: 28,
  },
  body: {
    lineHeight: 26,
    textAlign: 'justify',
  },
  paragraphGap: {
    marginBottom: Spacing.xl,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.md,
    alignSelf: 'flex-start',
  },
  shareLabel: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: Spacing.md,
  },
});

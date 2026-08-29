import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText, countWordTokens, findWordPositionNear } from './TappableText';
import { lookupSeparableInfo } from '../services/dictionaryService';
import { WordPopup } from './WordPopup';
import type { BriefingArticle as Article, TokenMapEntry } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import * as analytics from '../services/analytics';
import SEPARABLE_DE from '../data/separable_de.json';

// Unique prefixes present in the lookup table — used to scan sentences.
const SEPARABLE_DE_PREFIXES = [...new Set(Object.values(SEPARABLE_DE))] as string[];

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
  // Set only when the tapped token is half of a split lexical unit (separable
  // verb) — the popup must then look up the compound, since the surface form on
  // its own means something else ("lief" = to run, "lief … über" = to overflow).
  const [activeCompound, setActiveCompound] = useState<string | null>(null);
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
    setActiveCompound(linked.length > 0 ? lemma : null);
    setActiveSentence(sentence);

    // Separable verb detection — de and sv only, fails silently.
    // Skipped when the token map already linked this token: the pipeline's parse
    // is authoritative, whereas this heuristic picks the *nearest* matching
    // particle, which can be a different (unrelated) one in the same article.
    if (linked.length === 0 && (language === 'de' || language === 'sv')) {
      (async () => {
        let separablePrefix: string | null = null;

        let compoundLemma: string | null = null;

        if (language === 'de') {
          // 1. Static lookup — instant, offline, covers 1,500+ German separable verbs.
          //    Check if the lemma itself is a known separable verb (e.g. "aufstehen").
          const directPrefix = (SEPARABLE_DE as Record<string, string>)[lemma.toLowerCase()];
          if (directPrefix) {
            separablePrefix = directPrefix;
            compoundLemma = lemma.toLowerCase();
          } else {
            // 2. Lemma is the base verb (e.g. "stehen"). Scan the sentence for any prefix
            //    that forms a known compound (e.g. "auf" + "stehen" = "aufstehen").
            const sentenceWords = sentence
              .split(/\s+/)
              .map((w) => w.toLowerCase().replace(/[^a-zäöüß]/gi, ''));
            for (const prefix of SEPARABLE_DE_PREFIXES) {
              if (!sentenceWords.includes(prefix)) continue;
              const compound = prefix + lemma.toLowerCase();
              if ((SEPARABLE_DE as Record<string, string>)[compound]) {
                separablePrefix = prefix;
                compoundLemma = compound;
                break;
              }
            }
          }

          // 3. Fallback to Supabase for rare verbs not in the static table.
          if (!separablePrefix) {
            const dbResult = await lookupSeparableInfo(lemma, language).catch(() => null);
            if (dbResult?.separablePrefix) {
              separablePrefix = dbResult.separablePrefix;
              compoundLemma = dbResult.separablePrefix + lemma.toLowerCase();
            }
          }
        } else {
          // Swedish: DB-only (no static table yet)
          const dbResult = await lookupSeparableInfo(lemma, language).catch(() => null);
          if (dbResult?.separablePrefix) separablePrefix = dbResult.separablePrefix;
        }

        if (!separablePrefix) return;

        // Find the particle occurrence CLOSEST to the tapped word — not the first in
        // the article, which is often an unrelated preposition or article (e.g. "ein").
        const partnerPos = findWordPositionNear(
          article.headline,
          article.body,
          separablePrefix,
          headlineWordCount,
          wordPosition,
        );
        if (partnerPos !== null) {
          setActivePositions((prev) => new Set([...prev, partnerPos]));
        }

        // Update the lemma to the full compound form so the popup looks up
        // "einsteigen" rather than just "steigen".
        if (compoundLemma) {
          setActiveLemma(compoundLemma);
          setActiveCompound(compoundLemma);
        }
      })().catch(() => {});
    }
  }, [locked, onLockedWordPress, tokenByPosition, language, article, headlineWordCount]);

  const handleClose = useCallback(() => {
    setActivePositions(new Set());
    setActiveWord(null);
    setActiveLemma(null);
    setActiveCompound(null);
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
            { color: colors.inkDark, fontFamily: isRTL ? arabicFontBold : fontFamily.bold, fontSize: fontSize.heading, lineHeight: Math.round(fontSize.heading * 1.25) },
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


      {activeWord && (
        <WordPopup
          word={activeWord}
          lemma={activeLemma ?? activeWord}
          compoundLemma={activeCompound}
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
  headline: {},
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: Spacing.md,
  },
});

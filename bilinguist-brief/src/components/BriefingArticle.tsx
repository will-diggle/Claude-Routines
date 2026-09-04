import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { TappableText, countWordTokens, findWordPositionNear } from './TappableText';
import { lookupSeparableInfo } from '../services/dictionaryService';
import { WordPopup } from './WordPopup';
import type { BriefingArticle as Article, TokenMapEntry } from '../services/anthropic';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import * as analytics from '../services/analytics';
import SEPARABLE_DE from '../data/separable_de.json';
import { useAudioStore } from '../store/useAudioStore';
import { playArticleAudio, pauseAudio, resumeAudio } from '../services/audioPlayer';

// Unique prefixes present in the lookup table — used to scan sentences.
const SEPARABLE_DE_PREFIXES = [...new Set(Object.values(SEPARABLE_DE))] as string[];

const stripDE = (w: string) => w.toLowerCase().replace(/[^a-zäöüß]/g, '');

// The pipeline already lemmatises every token, so when a token map exists there
// is no need to infer the verb from spelling: read "brachte" → "bringen" off the
// parse and test the compound directly. This is what catches irregulars that
// change consonants as well as vowels, which no stem or skeleton match can reach.
function resolveParticleViaTokenMap(
  particle: string,
  particlePos: number,
  tokens: Map<number, TokenMapEntry>,
): { compound: string; verbPos: number } | null {
  // Every separable prefix is also an ordinary preposition — "an der Grenze" is
  // not half of a verb. Without this the search happily pairs a preposition with
  // any nearby verb that could form a compound, and invents one that isn't there.
  if (tokens.get(particlePos)?.pos !== 'PART') return null;

  // Positions are article-global, so bound the search near the tapped particle —
  // a separable pair is only ever a clause apart.
  const WINDOW = 15;
  let best: { compound: string; verbPos: number; distance: number } | null = null;

  for (let d = 1; d <= WINDOW; d++) {
    for (const pos of [particlePos - d, particlePos + d]) {
      const t = tokens.get(pos);
      if (!t?.lemma) continue;
      const compound = particle + t.lemma.toLowerCase();
      if (!(compound in (SEPARABLE_DE as Record<string, string>))) continue;
      if (!best || d < best.distance) best = { compound, verbPos: pos, distance: d };
    }
    if (best) break; // nearest wins; no closer match can appear at a larger d
  }
  return best ? { compound: best.compound, verbPos: best.verbPos } : null;
}

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
  // The detached prefix's own surface form (e.g. "ab", "über") — used to split
  // the popup title as "ab·sperren" regardless of which half was tapped.
  const [activeSeparablePrefix, setActiveSeparablePrefix] = useState<string | null>(null);
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

    // The linked pair's PART entry (if any) is the detached prefix — used to
    // split the popup title as "ab·sperren". Article-noun links never carry a
    // PART tag, so this naturally stays null for those.
    if (linked.length > 0) {
      const partEntry = [wordPosition, ...linked]
        .map((p) => tokenByPosition.get(p))
        .find((e) => e?.pos === 'PART');
      setActiveSeparablePrefix(partEntry?.surface ?? null);
    } else {
      setActiveSeparablePrefix(null);
    }

    // Tapped the detached particle rather than the verb. The lookup below runs
    // verb-first (lemma "dauern" → find "an"), so it can't answer this: the lemma
    // is "an" and no compound is built from it. Resolve the other direction and
    // stop, otherwise the popup defines the bare preposition.
    if (linked.length === 0 && language === 'de') {
      const particle = stripDE(word);

      // Exact route first: the pipeline's own lemmas.
      const viaMap = resolveParticleViaTokenMap(particle, wordPosition, tokenByPosition);
      if (viaMap) {
        setActiveLemma(viaMap.compound);
        setActiveCompound(viaMap.compound);
        setActiveSeparablePrefix(particle);
        setActivePositions((prev) => new Set([...prev, viaMap.verbPos]));
        return;
      }

      // Deliberately no spelling fallback here. The verb-first direction can lean
      // on the tapped word already being a verb; this direction cannot tell a
      // particle from the identical preposition, and guessing wrong doesn't
      // degrade to a plain lookup — it teaches a verb the sentence never used.
      // Without a parse saying PART, the plain word is the honest answer.
    }

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
          setActiveSeparablePrefix(separablePrefix);
        }
      })().catch(() => {});
    }
  }, [locked, onLockedWordPress, tokenByPosition, language, article, headlineWordCount]);

  const handleClose = useCallback(() => {
    setActivePositions(new Set());
    setActiveWord(null);
    setActiveLemma(null);
    setActiveCompound(null);
    setActiveSeparablePrefix(null);
  }, []);

  const isRTL = language === 'ar';
  const arabicFontRegular = 'NotoNaskhArabic_400Regular';
  const arabicFontBold = 'NotoNaskhArabic_700Bold';

  // Listen button — only for Global News articles the pipeline actually
  // generated audio for. Tracked by headline against the shared audio store,
  // same convention playAudioHeadline already used, since there's no other
  // stable per-article key available in that store.
  const canPlayAudio = article.genre === 'GLOBAL NEWS' && !!article.audioKey;
  const { audioHeadline, audioIsPlaying, audioIsLoading } = useAudioStore(
    useShallow((s) => ({ audioHeadline: s.headline, audioIsPlaying: s.isPlaying, audioIsLoading: s.isLoading }))
  );
  const isThisArticle = canPlayAudio && audioHeadline === article.headline;
  const isThisPlaying = isThisArticle && audioIsPlaying;
  const isThisLoading = isThisArticle && audioIsLoading;

  const handleAudioPress = useCallback(() => {
    if (!article.audioKey) return;
    if (isThisPlaying) {
      pauseAudio();
    } else if (isThisArticle && !audioIsPlaying && !audioIsLoading) {
      // Paused mid-way on this same article — resume rather than restart.
      resumeAudio();
    } else {
      playArticleAudio(language, article.headline, article.audioKey);
    }
  }, [article.audioKey, article.headline, isThisArticle, isThisPlaying, audioIsPlaying, audioIsLoading, language]);

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

      {canPlayAudio && (
        <TouchableOpacity
          onPress={handleAudioPress}
          activeOpacity={0.7}
          style={[styles.listenBtn, { borderColor: colors.borderMid }]}
          disabled={isThisLoading}
        >
          <Ionicons
            name={isThisLoading ? 'ellipsis-horizontal' : isThisPlaying ? 'pause' : 'play'}
            size={13}
            color={colors.accentRed}
          />
          <Text style={[styles.listenBtnText, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
            {isThisLoading ? 'Loading…' : isThisPlaying ? 'Playing' : 'Listen'}
          </Text>
        </TouchableOpacity>
      )}

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
            // marginBottom used to sit directly on the TappableText's own Text
            // element (which can hold 100+ nested word/punctuation children) —
            // on iOS that combination can clip the text's own tail instead of
            // just adding space after it. Margin now lives on a plain wrapping
            // View instead, so the text-content element itself never carries it.
            <View key={i} style={i < arr.length - 1 ? styles.paragraphGap : undefined}>
              <TappableText
                text={para.trim()}
                style={[styles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}
                activePositions={activePositions}
                wordPositionOffset={offset}
                onWordPress={handleWordPress}
              />
            </View>
          );
        })
      )}


      {activeWord && (
        <WordPopup
          word={activeWord}
          lemma={activeLemma ?? activeWord}
          compoundLemma={activeCompound}
          separablePrefix={activeSeparablePrefix}
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
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  listenBtnText: {
    fontSize: 12,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: Spacing.md,
  },
});

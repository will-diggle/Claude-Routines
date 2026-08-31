import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useWordBankStore } from '../store/useWordBankStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { lookupWord } from '../services/wordService';
import type { WordEntry, TenseTable } from '../services/wordService';
import { verifyTenses } from '../services/wordLookup';
import { translateWord } from '../services/deepl';
import { writeBackDictionary } from '../services/dictionaryService';
import { Spacing } from '../theme';
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import * as analytics from '../services/analytics';
import * as Haptics from 'expo-haptics';
import { GlassButton } from './GlassButton';
import { GlassSurface } from './GlassSurface';
import { WordAudioButton } from './WordAudioButton';

// Expand abbreviated case labels to full words
const CASE_EXPAND: Record<string, string> = {
  NOM: 'Nominative', AKK: 'Accusative', DAT: 'Dative', GEN: 'Genitive',
  ACC: 'Accusative', LOC: 'Locative', ABL: 'Ablative',
};
function expandKey(raw: string): string {
  const u = raw.toUpperCase().trim();
  return CASE_EXPAND[u] ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
}

// If a declension table has "X sg" / "X pl" keys, split into two sub-tables
type SplitDecl =
  | { mode: 'split'; singular: Record<string, string>; plural: Record<string, string> }
  | { mode: 'flat';  table: Record<string, string> };

function splitDeclTable(table: Record<string, string>): SplitDecl {
  const hasSg = Object.keys(table).some((k) => / sg$/i.test(k));
  const hasPl = Object.keys(table).some((k) => / pl$/i.test(k));
  if (hasSg && hasPl) {
    const singular: Record<string, string> = {};
    const plural: Record<string, string> = {};
    for (const [k, v] of Object.entries(table)) {
      if (/ sg$/i.test(k)) singular[expandKey(k.replace(/ sg$/i, '').trim())] = v;
      else if (/ pl$/i.test(k)) plural[expandKey(k.replace(/ pl$/i, '').trim())] = v;
    }
    return { mode: 'split', singular, plural };
  }
  const expanded: Record<string, string> = {};
  for (const [k, v] of Object.entries(table)) expanded[expandKey(k)] = v;
  return { mode: 'flat', table: expanded };
}

const PAST_TENSE_LABEL: Partial<Record<LanguageCode, string>> = {
  fr: 'PASSÉ COMPOSÉ',
  de: 'PRÄTERITUM',
  es: 'PRETÉRITO',
  it: 'PASSATO PROSSIMO',
  sv: 'PRETERITUM',
  en: 'SIMPLE PAST',
  tr: 'GEÇMİŞ ZAMAN',
};

interface Props {
  word: string | null;
  /** Lemma resolved from token map (e.g. "ansehen" for tapped "sehe"). Falls back to word. */
  lemma?: string;
  /**
   * Set when the token map linked this token to others as one lexical unit —
   * a separable verb split across the clause ("lief … über" → "überlaufen").
   * The surface form alone means something different ("lief" → "to run"), so the
   * dictionary must be queried with the compound rather than the tapped word.
   * Left undefined for ordinary words, where looking up the surface is correct
   * (it lets the card explain "lief is the past tense of laufen").
   */
  compoundLemma?: string | null;
  /**
   * Surface form of the detached prefix (e.g. "ab", "über") when compoundLemma
   * is a separable verb. Splits the title into the dictionary convention
   * "ab·sperren" so it reads correctly whichever half was tapped — the surface
   * alone ("ab") doesn't tell the learner what verb it belongs to.
   */
  separablePrefix?: string | null;
  sentence: string;
  language: LanguageCode;
  level: LanguageLevel;
  genre?: string;
  onClose: () => void;
  /** Called the instant this sheet starts dismissing — used by parent to dismiss simultaneously */
  onDismissStart?: () => void;
  /** When true, shows a back arrow (←) instead of close (✕) — used for nested infinitive popup */
  isNested?: boolean;
}

export function WordPopup({ word, lemma, compoundLemma, separablePrefix, sentence, language, level, genre, onClose, onDismissStart, isNested = false }: Props) {
  const lookupLemma = lemma ?? word ?? '';
  // What the dictionary is actually queried with — the compound when this token
  // is half of a split lexical unit, otherwise the tapped surface form.
  const lookupTarget = compoundLemma ?? word ?? '';

  const { colors, fontFamily, fontSize, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { saveWord, isWordSaved, backfillWord } = useWordBankStore();
  const { isFullAccess } = useSubscriptionStore();
  const fullAccess = isFullAccess();

  const [entry, setEntry] = useState<WordEntry | null>(null);
  const [quickTranslation, setQuickTranslation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTenseIdx, setActiveTenseIdx] = useState(0);
  const [verifiedTenses, setVerifiedTenses] = useState<TenseTable[] | null>(null);
  const [activeDeclIdx, setActiveDeclIdx] = useState(0);
  const [declNumber, setDeclNumber] = useState<'sg' | 'pl'>('sg');
  const [nestedWord, setNestedWord] = useState<string | null>(null);
  const [exampleTranslation, setExampleTranslation] = useState<string | null>(null);
  const [wordFormTranslation, setWordFormTranslation] = useState<string | null>(null);

  const alreadySaved = word ? isWordSaved(word, language) : false;

  // Sheet slides in from bottom; dragY drives both position and backdrop opacity.
  const dragY = useRef(new Animated.Value(700)).current;
  const overlayOpacity = dragY.interpolate({ inputRange: [0, 300], outputRange: [0.45, 0], extrapolate: 'clamp' });

  // Track whether the inner ScrollView is at its top so we know when to
  // let the parent sheet capture the drag gesture instead.
  const scrollAtTop = useRef(true);

  useEffect(() => {
    Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, []);

  const dismissSheet = useCallback(() => {
    onDismissStart?.();
    Animated.timing(dragY, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => onClose());
  }, [onClose, onDismissStart]);

  // Keep a stable ref so the panResponder closure never goes stale.
  const dismissRef = useRef(dismissSheet);
  useEffect(() => { dismissRef.current = dismissSheet; }, [dismissSheet]);

  const panResponder = useRef(
    PanResponder.create({
      // Don't claim on touch-start — let child ScrollViews handle taps/scroll.
      onStartShouldSetPanResponder: () => false,
      // Claim when the scroll content is at top AND the gesture is a deliberate downward pull.
      onMoveShouldSetPanResponder: (_, g) =>
        scrollAtTop.current && g.dy > 18 && g.vy > 0.15 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.5) {
          dismissRef.current();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!entry?.example) { setExampleTranslation(null); return; }
    translateWord(entry.example, language).then(r => {
      if (r?.translation) setExampleTranslation(r.translation);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.example]);

  useEffect(() => {
    if (!word) return;
    setEntry(null);
    setQuickTranslation(null);
    setExampleTranslation(null);
    setWordFormTranslation(null);
    setIsLoading(true);
    setSaved(false);
    setActiveTenseIdx(0);
    setActiveDeclIdx(0);
    setDeclNumber('sg');
    setVerifiedTenses(null);

    const currentWord = lookupTarget;
    const currentLemma = lookupLemma;
    const currentLang = language;

    (async () => {
      analytics.trackWordTapped(currentWord, currentLang, level, false);

      translateWord(currentLemma, currentLang).then((result) => {
        if (result?.translation) setQuickTranslation(result.translation);
      }).catch(() => {});


      lookupWord(currentWord, currentLang, level, { sentence }).then(async (result) => {
        // If we got a verb back with only legacy 2-tense data, force-refresh to hit the worker backfill
        let finalResult = result;
        if (result?.wordType === 'verb' && (!result.tenses || result.tenses.length < 3)) {
          finalResult = await lookupWord(currentWord, currentLang, level, { forceRefresh: true, sentence }).catch(() => result);
        }
        setEntry(finalResult);
        setIsLoading(false);
        if (finalResult) {
          writeBackDictionary(currentLemma, currentLang, finalResult).catch(() => {});
          const stored = useWordBankStore.getState().words.find(
            w => w.word.toLowerCase() === currentWord.toLowerCase() && w.language === currentLang
          );
          if (stored) {
            backfillWord(currentWord, currentLang, {
              translation:   finalResult.translation ?? undefined,
              explanation:   finalResult.explanation ?? undefined,
              lemma:         finalResult.lemma,
              pronunciation: finalResult.pronunciation,
              tenses:        finalResult.tenses,
              verbTable:     finalResult.verbTable,
              verbTablePast: finalResult.verbTablePast,
              forms:         finalResult.forms,
              wordType:      finalResult.wordType,
              tip:           finalResult.tip,
              meta:          finalResult.meta,
            });
          }
          // Background verification — show tenses immediately, silently correct if needed
          if (finalResult.wordType === 'verb' && finalResult.tenses?.length && finalResult.lemma) {
            verifyTenses(finalResult.tenses, finalResult.lemma, currentLang).then((verified) => {
              if (verified) setVerifiedTenses(verified);
            }).catch(() => {});
          }
        }
      }).catch(() => { setIsLoading(false); });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, lookupLemma, lookupTarget, language]);

  // Build ordered tense list — verified > rich array > legacy two-field fallback
  const tenses = useMemo(() => {
    if (!entry) return [];
    if (verifiedTenses && verifiedTenses.length > 0) return verifiedTenses;
    if (entry.tenses && entry.tenses.length > 0) return entry.tenses;
    const list: Array<{ label: string; table: Record<string, string> }> = [];
    if (entry.verbTable && Object.keys(entry.verbTable).length > 0) {
      list.push({ label: 'PRESENT', table: entry.verbTable });
    }
    if (entry.verbTablePast && Object.keys(entry.verbTablePast).length > 0) {
      list.push({ label: PAST_TENSE_LABEL[language] ?? 'PAST', table: entry.verbTablePast });
    }
    return list;
  }, [entry, verifiedTenses, language]);

  function handleSave() {
    if (!word || alreadySaved || saved) return;
    analytics.trackWordSaved(word, language, level);
    saveWord({
      word,
      language,
      translation: entry?.translation ?? quickTranslation ?? '',
      explanation: entry?.explanation ?? '',
      exampleSentence: entry?.example ?? '',
      originalSentence: sentence,
      lemma: entry?.lemma ?? null,
      pronunciation: entry?.pronunciation ?? null,
      tenses: verifiedTenses ?? entry?.tenses ?? null,
      declensions: entry?.declensions ?? null,
      verbTable: entry?.verbTable ?? null,
      verbTablePast: entry?.verbTablePast ?? null,
      forms: entry?.forms ?? null,
      wordType: entry?.wordType ?? null,
      tip: entry?.tip ?? null,
      meta: entry?.meta ?? null,
    });
    setSaved(true);
  }

  if (!word) return null;

  const isSaved = saved || alreadySaved;
  const displayTranslation = entry?.translation ?? quickTranslation;
  const activeTense = tenses[activeTenseIdx] ?? null;

  // Title as the dictionary convention "ab·sperren" when this is a separable
  // verb, so it reads the same whichever half of the pair was tapped. Falls
  // back to the plain tapped word for everything else, including the
  // article-noun link (which never carries a separablePrefix).
  // The compound we asked about is a guess made from the article; the lemma that
  // comes back is what the dictionary actually resolved, with the sentence in
  // hand. When they disagree the server is right — it corrected "anreden" to
  // "angeben" off the context — so the header must follow it rather than keep
  // asserting the guess over the top of the body's own answer.
  const resolvedCompound = entry?.lemma ?? compoundLemma;

  const splitTitle = (() => {
    if (!separablePrefix || !resolvedCompound) return null;
    const prefixLower = separablePrefix.toLowerCase();
    // A resolved lemma that doesn't start with the prefix means this wasn't the
    // separable verb we assumed. Show the plain word rather than force a split.
    if (!resolvedCompound.toLowerCase().startsWith(prefixLower)) return null;
    const stem = resolvedCompound.slice(separablePrefix.length);
    if (!stem) return null;
    return `${separablePrefix}·${stem}`; // U+00B7 MIDDLE DOT
  })();
  const displayWord = splitTitle ?? word;
  // "andauern" tells you the compound, but not what the verb means on its own.
  // Offer the bare verb alongside it so "dauern" stays reachable.
  const baseVerb = (() => {
    if (!separablePrefix || !resolvedCompound) return null;
    if (!resolvedCompound.toLowerCase().startsWith(separablePrefix.toLowerCase())) return null;
    const stem = resolvedCompound.slice(separablePrefix.length);
    return stem.length >= 3 ? stem : null;
  })();
  // Pronounce the whole verb, not just the tapped half — "ab" alone mispronounces.
  const audioWord = resolvedCompound ?? word;

  // Subtitle: lemma part (article+lemma for nouns, lemma/infinitive for all others)
  const subtitleLemma = (() => {
    if (!entry) return lookupLemma && lookupLemma.toLowerCase() !== word.toLowerCase() ? lookupLemma : null;
    const wt = entry.wordType;
    const f = entry.forms;
    if (wt === 'noun' && f) {
      if (f.article && entry.lemma) return `${f.article} ${entry.lemma}`;
    }
    const lemma = entry.lemma ?? lookupLemma;
    if (lemma && lemma.toLowerCase() !== word.toLowerCase()) return lemma;
    return null;
  })();
  const pillLabel = (() => {
    const wt = entry?.wordType;
    if (wt === 'verb') return 'Infinitive';
    if (wt === 'noun') return 'Noun';
    if (wt === 'adjective') return 'Adjective';
    if (wt === 'adverb') return 'Adverb';
    return 'Root';
  })();

  // subtitle kept as fallback only — new render splits pill + IPA separately
  const subtitle = subtitleLemma
    ? (entry?.pronunciation ? `${subtitleLemma}  ·  ${entry.pronunciation}` : subtitleLemma)
    : (entry?.pronunciation ? entry.pronunciation : null);


  return (
    <Modal visible animationType="none" transparent onRequestClose={dismissSheet}>
      {/* Dimming overlay — only on the root popup, not the nested one */}
      {!isNested && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: overlayOpacity }]} pointerEvents="none" />
      )}
      <View style={styles.modalContainer}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismissSheet} />

        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.sheet,
            { backgroundColor: colors.bg },
            { transform: [{ translateY: dragY }] },
          ]}
        >
          {/* Word row: [← back (nested only)] · [mirror·word·🔊 centred] · [✕ close] */}
          <View style={styles.wordRow}>
            {isNested ? (
              <GlassButton onPress={onClose} size={36} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="arrow-back" size={20} color={isDark ? colors.bg : colors.inkMid} />
              </GlassButton>
            ) : (
              <View style={styles.wordStub} />
            )}
            <View style={styles.wordCenterZone}>
              <View style={styles.wordSpeakerMirror} />
              <Text
                style={[styles.wordText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {displayWord}
              </Text>
              <WordAudioButton word={audioWord} language={language} size="md" />
            </View>
            <GlassButton onPress={dismissSheet} size={36} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={isDark ? colors.bg : colors.inkMid} />
            </GlassButton>
          </View>

        <ScrollView
          style={styles.scrollArea}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={e => { scrollAtTop.current = e.nativeEvent.contentOffset.y <= 0; }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Translation — centered, large */}
          <View style={styles.translationBlock}>
            {displayTranslation ? (
              <Text style={[styles.translationLarge, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                {displayTranslation}
              </Text>
            ) : isLoading ? (
              <ActivityIndicator size="small" color={colors.inkFaint} style={{ marginVertical: 8 }} />
            ) : (
              <Text style={[styles.translationError, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                Translation unavailable
              </Text>
            )}
          </View>

          {/* Infinitive pill — below translation, tappable to open nested popup */}
          {subtitleLemma && !isNested && (
            <View style={styles.infinitivePillRow}>
              <Text style={[styles.infinitivePillLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                {pillLabel}:
              </Text>
              <TouchableOpacity
                onPress={() => setNestedWord(subtitleLemma)}
                activeOpacity={0.8}
                style={[styles.infinitivePill, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
              >
                <Text style={[styles.infinitivePillText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                  {subtitleLemma}
                </Text>
                <Ionicons name="chevron-forward" size={11} color={colors.inkMid} />
              </TouchableOpacity>
              {baseVerb && baseVerb.toLowerCase() !== subtitleLemma.toLowerCase() && (
                <>
                  <Text style={[styles.infinitivePillLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    without {separablePrefix}-:
                  </Text>
                  <TouchableOpacity
                    onPress={() => setNestedWord(baseVerb)}
                    activeOpacity={0.8}
                    style={[styles.infinitivePill, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
                  >
                    <Text style={[styles.infinitivePillText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                      {baseVerb}
                    </Text>
                    <Ionicons name="chevron-forward" size={11} color={colors.inkMid} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
          {/* Nested context: show lemma plain (no tap) */}
          {subtitleLemma && isNested && (
            <Text style={[styles.subtitleIPA, { color: colors.inkFaint, fontFamily: fontFamily.italic, textAlign: 'center', marginBottom: 4 }]}>
              {subtitleLemma}
            </Text>
          )}

          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

          {/* Grammar tags — dot-separated: word type in red, rest in inkFaint */}
          {entry?.wordType && (
            <View style={styles.chipsRow}>
              <Text style={[styles.grammarTags, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                {[
                  entry.wordType.charAt(0).toUpperCase() + entry.wordType.slice(1),
                  entry.wordType === 'noun' && entry.forms?.gender
                    ? entry.forms.gender.charAt(0).toUpperCase() + entry.forms.gender.slice(1)
                    : null,
                  entry.wordType === 'verb' && entry.meta?.isRegular === true  ? 'Regular'   : null,
                  entry.wordType === 'verb' && entry.meta?.isRegular === false ? 'Irregular' : null,
                  entry.wordType === 'verb' && entry.meta?.auxiliary ? entry.meta.auxiliary as string : null,
                  entry.wordType === 'verb' && entry.meta?.isSeparable ? 'Separable' : null,
                  entry.meta?.verbClass ? entry.meta.verbClass as string : null,
                  entry.level ?? null,
                ].filter(Boolean).join('  ·  ')}
              </Text>
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

          {/* Loading spinner */}
          {isLoading && !entry && (
            <View style={styles.loadingBody}>
              <ActivityIndicator size="small" color={colors.inkFaint} />
            </View>
          )}

          {/* Explanation */}
          {entry?.explanation && (
            <Text style={[styles.explanationCentered, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
              {entry.explanation}
            </Text>
          )}

          {/* Example sentence + translation */}
          {entry?.example && (() => {
            const sentence = entry.example;
            // Mark every part of the unit the card is about, not just the tapped
            // half — for a separable verb the reader needs to see both pieces and
            // how far apart they sit. Matched whole-word so "an" doesn't light up
            // inside "dann".
            const marks = [word, separablePrefix, resolvedCompound, baseVerb]
              .filter((t): t is string => !!t && t.length > 1)
              .map((t) => t.toLowerCase());
            const targets = new Set(marks);
            // The verb appears inflected in the example ("sperrte", not
            // "sperren"), so an exact match misses the half that matters most.
            // Marking anything built on its stem catches the regular forms.
            // Deliberately kept to stems of 4+ characters: unlike the lookup
            // guessing this replaced, a loose match here only over-emphasises a
            // word — it can never change what the card teaches.
            const verbStem = baseVerb && baseVerb.length >= 6
              ? baseVerb.toLowerCase().replace(/e?n$/, '')
              : null;
            const stem = verbStem && verbStem.length >= 4 ? verbStem : null;
            // Leading/trailing punctuation is kept out of the mark so the
            // underline doesn't run under a comma.
            const splitAffixes = (chunk: string) => {
              const m = chunk.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u);
              return m ? { pre: m[1], core: m[2], post: m[3] } : { pre: '', core: chunk, post: '' };
            };
            return (
              <View style={[styles.blockquote, { borderLeftColor: colors.accentRed }]}>
                <Text style={[styles.blockquoteText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: 13 }]}>
                  {'„'}
                  {sentence.split(/(\s+)/).map((chunk, i) => {
                    const { pre, core, post } = splitAffixes(chunk);
                    const lower = core.toLowerCase();
                    const isMark = targets.has(lower) || (stem !== null && lower.startsWith(stem));
                    if (!core || !isMark) return chunk;
                    return (
                      <Text key={i}>
                        {pre}
                        <Text style={{
                          // No bold-italic face in the set, so the mark goes
                          // upright bold — which reads as deliberate next to the
                          // italic rather than as a rendering slip.
                          fontFamily: fontFamily.bold,
                          textDecorationLine: 'underline',
                          color: colors.inkDark,
                        }}>
                          {core}
                        </Text>
                        {post}
                      </Text>
                    );
                  })}
                  {'"'}
                </Text>
                {exampleTranslation && (() => {
                  // Primary: positional alignment — find which index the tapped word
                  // sits at in the German sentence, highlight that same index in English.
                  // Works for inflected forms ("hat" at pos 1 → "has" at pos 1) with no extra API call.
                  const stripEdges = (w: string) => w.replace(/^[„"«]+|["».,!?;:]+$/g, '');
                  const gWords = sentence.split(/\s+/);
                  const gWordIdx = gWords.findIndex(
                    w => stripEdges(w).toLowerCase() === (word ?? '').toLowerCase()
                  );
                  let engIdx = -1;
                  let engLen = 0;
                  if (gWordIdx !== -1) {
                    const eWords = exampleTranslation.split(/\s+/);
                    const eWord = gWordIdx < eWords.length ? stripEdges(eWords[gWordIdx]) : '';
                    if (eWord) {
                      const fi = exampleTranslation.indexOf(eWord);
                      if (fi !== -1) { engIdx = fi; engLen = eWord.length; }
                    }
                  }
                  // Fallback: match via display translation ("to have" → "have")
                  if (engIdx === -1) {
                    const fb = (displayTranslation ?? '').replace(/^to\s+/i, '').split(/[,;(]/)[0].trim();
                    if (fb) {
                      const fi = exampleTranslation.toLowerCase().indexOf(fb.toLowerCase());
                      if (fi !== -1) { engIdx = fi; engLen = fb.length; }
                    }
                  }
                  return (
                    <Text style={[styles.blockquoteTranslation, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      {engIdx === -1 ? exampleTranslation : (
                        <>
                          {exampleTranslation.slice(0, engIdx)}
                          <Text style={{ textDecorationLine: 'underline' }}>
                            {exampleTranslation.slice(engIdx, engIdx + engLen)}
                          </Text>
                          {exampleTranslation.slice(engIdx + engLen)}
                        </>
                      )}
                    </Text>
                  );
                })()}
              </View>
            );
          })()}

          {/* Forms — plain rows with centered header */}
          {entry?.forms && Object.keys(entry.forms).length > 0 && (
            <View style={styles.formsList}>
              <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, textAlign: 'center', marginBottom: 4 }]}>
                FORMS
              </Text>
              {Object.entries(entry.forms).map(([key, value]) => (
                <View key={key} style={[styles.formsRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[styles.formsRowLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {key.replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.formsRowValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                    {String(value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Declension / inflection table — nouns, adjectives, adverbs */}
          {entry?.declensions && entry.declensions.length > 0 && (() => {
            const allDecl = entry.declensions;
            const activeDecl = allDecl[activeDeclIdx];
            if (!activeDecl) return null;
            const split = splitDeclTable(activeDecl.table);

            // Three-column layout when sg+pl fit — fall back to arrow nav if any value > 13 chars
            const INLINE_THRESHOLD = 13;
            const useInline = split.mode === 'split' && [
              ...Object.values(split.singular),
              ...Object.values(split.plural),
            ].every(v => v.length <= INLINE_THRESHOLD);

            const sectionLabel = split.mode === 'split' ? activeDecl.label : 'FORMS';

            if (useInline) {
              const caseKeys = Object.keys(split.singular);
              return (
                <>
                  <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: Spacing.sm, marginBottom: 4 }]}>
                    {sectionLabel}
                  </Text>
                  {/* Header row */}
                  <View style={[styles.declRow, { borderTopColor: colors.borderLight }]}>
                    <View style={styles.declCaseCol} />
                    <Text style={[styles.declColHeader, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>SG</Text>
                    <Text style={[styles.declColHeader, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>PL</Text>
                  </View>
                  {caseKeys.map((caseKey) => (
                    <View key={caseKey} style={[styles.declRow, { borderTopColor: colors.borderLight }]}>
                      <Text style={[styles.declCaseLabel, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{caseKey}</Text>
                      <Text style={[styles.declValue, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{split.singular[caseKey] ?? '—'}</Text>
                      <Text style={[styles.declValue, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{split.plural[caseKey] ?? '—'}</Text>
                    </View>
                  ))}
                </>
              );
            }

            // Arrow nav fallback for long words
            const rows = split.mode === 'split'
              ? (declNumber === 'sg' ? split.singular : split.plural)
              : split.table;
            const navLabel = split.mode === 'split'
              ? (declNumber === 'sg' ? 'SINGULAR' : 'PLURAL')
              : activeDecl.label;
            return (
              <>
                <View style={styles.tenseSectionCenter}>
                  <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {sectionLabel}
                  </Text>
                  <View style={styles.tenseNav}>
                    <TouchableOpacity
                      onPress={() => {
                        if (split.mode === 'split' && declNumber === 'pl') { setDeclNumber('sg'); }
                        else { setActiveDeclIdx((i) => Math.max(0, i - 1)); setDeclNumber('sg'); }
                      }}
                      disabled={activeDeclIdx === 0 && (split.mode !== 'split' || declNumber === 'sg')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.borderLight, opacity: (activeDeclIdx === 0 && (split.mode !== 'split' || declNumber === 'sg')) ? 0.3 : 1 }]}
                    >
                      <Ionicons name="chevron-back" size={16} color={colors.inkMid} />
                    </TouchableOpacity>
                    <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                      {navLabel}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (split.mode === 'split' && declNumber === 'sg') { setDeclNumber('pl'); }
                        else { setActiveDeclIdx((i) => Math.min(allDecl.length - 1, i + 1)); setDeclNumber('sg'); }
                      }}
                      disabled={activeDeclIdx === allDecl.length - 1 && (split.mode !== 'split' || declNumber === 'pl')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.borderLight, opacity: (activeDeclIdx === allDecl.length - 1 && (split.mode !== 'split' || declNumber === 'pl')) ? 0.3 : 1 }]}
                    >
                      <Ionicons name="chevron-forward" size={16} color={colors.inkMid} />
                    </TouchableOpacity>
                  </View>
                </View>
                {Object.entries(rows).map(([key, value]) => (
                  <View key={key} style={[styles.conjRow, { borderTopColor: colors.borderLight }]}>
                    <Text style={[styles.conjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{key}</Text>
                    <Text style={[styles.conjForm, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{value}</Text>
                  </View>
                ))}
              </>
            );
          })()}

          {/* Verb tenses — circular nav with CENTERED tense title */}
          {tenses.length > 0 && activeTense && (
            <>
              <View style={styles.tenseSectionCenter}>
                <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  VERB TENSES
                </Text>
                {tenses.length > 1 ? (
                  <View style={styles.tenseNav}>
                    <TouchableOpacity
                      onPress={() => setActiveTenseIdx((i) => Math.max(0, i - 1))}
                      disabled={activeTenseIdx === 0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.borderLight, opacity: activeTenseIdx === 0 ? 0.3 : 1 }]}
                    >
                      <Ionicons name="chevron-back" size={16} color={colors.inkMid} />
                    </TouchableOpacity>
                    <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                      {activeTense.label}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setActiveTenseIdx((i) => Math.min(tenses.length - 1, i + 1))}
                      disabled={activeTenseIdx === tenses.length - 1}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.borderLight, opacity: activeTenseIdx === tenses.length - 1 ? 0.3 : 1 }]}
                    >
                      <Ionicons name="chevron-forward" size={16} color={colors.inkMid} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                    {activeTense.label}
                  </Text>
                )}
              </View>
              {Object.entries(activeTense.table).map(([pronoun, form]) => (
                <View key={pronoun} style={[styles.conjRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[styles.conjPronoun, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>{pronoun}</Text>
                  <Text style={[styles.conjForm, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>{form}</Text>
                </View>
              ))}
            </>
          )}

          {/* Tip */}
          {entry?.tip && (
            <View style={[styles.tipBox, { borderColor: colors.borderMid }]}>
              <View style={styles.tipHeader}>
                <Ionicons name="bulb-outline" size={14} color={colors.accentRed} />
                <Text style={[styles.tipLabel, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>TIP</Text>
              </View>
              <Text style={[styles.tipText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{entry.tip}</Text>
            </View>
          )}

          {!fullAccess && entry && !entry.explanation && !entry.verbTable && !entry.tenses?.length && (
            <View style={[styles.upgradeRow, { borderColor: colors.borderLight }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.inkFaint} />
              <Text style={[styles.upgradeText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                Upgrade to unlock full grammar details
              </Text>
            </View>
          )}

          {/* Spacer so the spring-back never pulls the tip behind the save pill */}
          <View style={{ height: 100 }} />

        </ScrollView>

        </Animated.View>
      </View>

      {/* Save pill — floats outside the sheet so no white box below it */}
      <Animated.View
        style={[styles.savePillWrap, { bottom: insets.bottom + 4 }, { transform: [{ translateY: dragY }] }]}
        pointerEvents="box-none"
      >
        <View style={styles.saveShadow}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              handleSave();
            }}
            disabled={isSaved || isLoading}
            activeOpacity={0.8}
            style={[styles.saveButton, {
              opacity: isLoading && !isSaved ? 0.5 : 1,
              backgroundColor: isDark ? 'rgba(40,40,40,0.88)' : 'rgba(255,255,255,0.88)',
            }]}
          >
            <GlassSurface cornerRadius={99} colorScheme={isDark ? 'dark' : 'light'} intensity={100} />
            <Text style={[styles.saveText, { color: isSaved ? colors.inkFaint : colors.inkDark, fontFamily: fontFamily.regular }]}>
              {isSaved ? 'Saved to word bank' : 'Save word'}
            </Text>
            <Ionicons
              name={isSaved ? 'checkmark' : 'bookmark-outline'}
              size={16}
              color={isSaved ? '#43A047' : colors.accentRed}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Nested popup for the infinitive/lemma — X on nested closes both */}
      {nestedWord && !isNested && (
        <WordPopup
          word={nestedWord}
          lemma={nestedWord}
          sentence={word ?? ''}
          language={language}
          level={level}
          genre={genre}
          isNested
          onDismissStart={dismissSheet}
          onClose={() => setNestedWord(null)}
        />
      )}
    </Modal>
  );
}


const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '96%', minHeight: '90%', paddingTop: 18 },

  // Word header: word · /IPA/ · 🔊 · ✕
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
    gap: 8,
  },
  wordStub: { width: 36 },
  wordCenterZone: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  wordSpeakerMirror: { width: 34 },
  wordText: { fontSize: 42, flexShrink: 1 },

  // Subtitle area — pill + IPA side by side
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  infinitivePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Two pills (compound + bare verb) don't always fit one line on narrow phones.
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  infinitivePillLabel: { fontSize: 13 },
  infinitivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  infinitivePillText: { fontSize: 14 },
  subtitleIPA: { fontSize: 14, fontStyle: 'italic' },

  // Dividers
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.lg, marginVertical: 7 },

  // Translation block (above chips)
  translationBlock: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 5 },
  translationLarge: { fontSize: 26, textAlign: 'center' },
  translationError: { fontSize: 14, textAlign: 'center' },

  // Grammar tags — dot-separated plain text row
  chipsRow: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 5,
  },
  grammarTags: { fontSize: 13, textAlign: 'center', letterSpacing: 0.2 },

  // Scroll body
  scrollArea: { flex: 1, paddingHorizontal: Spacing.lg, minHeight: 80 },
  loadingBody: { paddingVertical: Spacing.xl, alignItems: 'center' },
  explanationCentered: { lineHeight: 23, textAlign: 'center', paddingVertical: Spacing.sm },

  // Forms plain list
  formsList: { marginBottom: 2 },
  formsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  formsRowLabel: { fontSize: 13, fontStyle: 'italic' },
  formsRowValue: { fontSize: 15 },

  // Blockquote example
  blockquote: { borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 9, marginTop: Spacing.sm, marginBottom: 4 },
  blockquoteText: { lineHeight: 20 },
  blockquoteTranslation: { fontSize: 12, lineHeight: 17, marginTop: 4, opacity: 0.75 },

  // Verb tenses — centered layout
  tenseSectionCenter: {
    alignItems: 'center',
    marginTop: Spacing.sm, marginBottom: 4,
  },
  tenseSectionLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 5 },
  tenseNav: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  navBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  tenseLabel: { fontSize: 11, letterSpacing: 1, width: 160, textAlign: 'center' },
  conjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  conjPronoun: { fontSize: 13, flex: 1, fontStyle: 'italic' },
  conjForm: { fontSize: 13, flex: 1, textAlign: 'right' },
  // Three-column declension layout
  declRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  declCaseCol: { flex: 1.2 },
  declCaseLabel: { flex: 1.2, fontSize: 12 },
  declColHeader: { flex: 1, fontSize: 10, letterSpacing: 1, textAlign: 'right' },
  declValue: { flex: 1, fontSize: 13, textAlign: 'right' },

  // Tip box
  tipBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, marginTop: Spacing.sm, marginBottom: Spacing.md },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  tipLabel: { fontSize: 11, letterSpacing: 1.5 },
  tipText: { fontSize: 13, lineHeight: 19 },

  // Upgrade nudge
  upgradeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: Spacing.md, marginBottom: Spacing.md, opacity: 0.6,
  },
  upgradeText: { fontSize: 13 },

  // Save pill — floats outside the sheet
  savePillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  saveShadow: {
    borderRadius: 99,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, paddingHorizontal: 28,
    borderRadius: 99, overflow: 'hidden',
    gap: 8,
  },
  saveText: { fontSize: 15 },
});

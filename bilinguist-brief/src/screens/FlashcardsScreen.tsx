import { SpringButton } from '../components/SpringButton';
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Animated, PanResponder, Dimensions,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useShallow } from 'zustand/react/shallow';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { lookupWord } from '../services/wordService';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getCongratsLines } from '../utils/congrats';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { WordAudioButton } from '../components/WordAudioButton';
import { Spacing } from '../theme';
import { useNavPillStore } from '../store/useNavPillStore';
import { GlassButton } from '../components/GlassButton';
import { GameSettingsSheet, DEFAULT_GAME_SETTINGS, type GameSettings } from '../components/GameSettingsSheet';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';

const { width: SW, height: SH } = Dimensions.get('window');
const MAX_CARDS = 15;
const CARD_W = SW - 48;
const CARD_H = Math.min(Math.round(CARD_W * 1.55), Math.round(SH * 0.68));
const SWIPE_THRESHOLD = 80;
const STACK_STRIP = 9;  // visible px of each stacked card below the one in front
const STACK_SCALE = 0.04;

const PAST_TENSE_LABEL: Partial<Record<LanguageCode, string>> = {
  fr: 'PASSÉ COMPOSÉ', de: 'PRÄTERITUM', es: 'PRETÉRITO',
  it: 'PASSATO PROSSIMO', sv: 'PRETERITUM', en: 'SIMPLE PAST', tr: 'GEÇMİŞ ZAMAN',
};

const CASE_EXPAND_FC: Record<string, string> = {
  NOM: 'Nominative', AKK: 'Accusative', DAT: 'Dative', GEN: 'Genitive',
  ACC: 'Accusative', LOC: 'Locative', ABL: 'Ablative',
};
function expandKeyFC(raw: string): string {
  const u = raw.toUpperCase().trim();
  return CASE_EXPAND_FC[u] ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
}
type SplitDeclFC =
  | { mode: 'split'; singular: Record<string, string>; plural: Record<string, string> }
  | { mode: 'flat';  table: Record<string, string> };
function splitDeclFC(table: Record<string, string>): SplitDeclFC {
  const hasSg = Object.keys(table).some((k) => / sg$/i.test(k));
  const hasPl = Object.keys(table).some((k) => / pl$/i.test(k));
  if (hasSg && hasPl) {
    const singular: Record<string, string> = {};
    const plural: Record<string, string> = {};
    for (const [k, v] of Object.entries(table)) {
      if (/ sg$/i.test(k)) singular[expandKeyFC(k.replace(/ sg$/i, '').trim())] = v;
      else if (/ pl$/i.test(k)) plural[expandKeyFC(k.replace(/ pl$/i, '').trim())] = v;
    }
    return { mode: 'split', singular, plural };
  }
  const expanded: Record<string, string> = {};
  for (const [k, v] of Object.entries(table)) expanded[expandKeyFC(k)] = v;
  return { mode: 'flat', table: expanded };
}

const FLAG_COLORS: Record<string, string[]> = {
  de: ['#000000', '#DD0000', '#FFCE00'],
  fr: ['#002395', '#FFFFFF', '#ED2939'],
  es: ['#AA151B', '#F1BF00'],
  it: ['#009246', '#FFFFFF', '#CE2B37'],
  sv: ['#006AA7', '#FECC02'],
  tr: ['#E30A17', '#FFFFFF'],
  hu: ['#CE2939', '#FFFFFF', '#477050'],
  ar: ['#007A3D', '#FFFFFF', '#000000', '#CE1126'],
  en: ['#012169', '#FFFFFF', '#C8102E'],
};

function levelColor(level?: string | null): string {
  if (!level) return '#888';
  if (level === 'A1' || level === 'A2') return '#2E7D32';
  if (level === 'B1' || level === 'B2') return '#E65100';
  return '#6A1B9A';
}

function getSessionWords(words: SavedWord[]): SavedWord[] {
  const revisit  = words.filter((w) => w.pile === 'revisit');
  const newW     = words.filter((w) => w.pile === 'new');
  const learning = words.filter((w) => w.pile === 'learning');
  const active   = [...revisit, ...newW, ...learning];
  // Fall back to mastered words if nothing else is left to practise
  if (active.length === 0) {
    return words.filter((w) => w.pile === 'mastered').slice(0, MAX_CARDS);
  }
  return active.slice(0, MAX_CARDS);
}

export function FlashcardsScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const setGameActive = useNavPillStore((s) => s.setGameActive);
  useFocusEffect(useCallback(() => {
    setGameActive(true);
    return () => setGameActive(false);
  }, [setGameActive]));
  const route = useRoute<RouteProp<PracticeStackParamList, 'Flashcards'>>();
  const langFilter = route.params?.language;
  useFocusEffect(useCallback(() => {
    analytics.trackGameOpened('flashcards', langFilter ?? 'all');
  }, [langFilter]));
  const { words, recordPractice, backfillWord } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const congratsLines = useMemo(() => getCongratsLines(activeLanguages), []);
  const activeCodes = new Set(activeLanguages);

  const sessionWords = useMemo(() => {
    const pool = words.filter((w) =>
      langFilter && langFilter !== 'all'
        ? w.language === langFilter
        : activeCodes.has(w.language),
    );
    return getSessionWords(pool);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refreshed tenses keyed by word id — backfill updates the store but sessionWords is frozen,
  // so we keep a local map that the render path can read immediately.
  const [refreshedTenses, setRefreshedTenses] = useState<Record<string, import('../services/wordService').TenseTable[]>>({});

  useEffect(() => {
    const verbs = sessionWords.filter(
      (w) => w.wordType === 'verb' && (!w.tenses || w.tenses.length < 3),
    );
    verbs.forEach((w) => {
      lookupWord(w.word, w.language, (w.level as any) ?? 'B1', { forceRefresh: true })
        .then((result) => {
          if (result?.tenses && result.tenses.length > 0) {
            backfillWord(w.word, w.language, { tenses: result.tenses });
            setRefreshedTenses((prev) => ({ ...prev, [w.id]: result.tenses! }));
          }
        })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex]   = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone]     = useState<{ correct: number; missed: number } | null>(null);
  const [tally, setTally]   = useState({ correct: 0, missed: 0 });
  const [activeTenseIdx, setActiveTenseIdx] = useState(0);
  const [activeDeclIdx, setActiveDeclIdx] = useState(0);
  const [declNumber, setDeclNumber] = useState<'sg' | 'pl'>('sg');
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const flipAnim    = useRef(new Animated.Value(0)).current;
  const pan         = useRef(new Animated.ValueXY()).current;
  const flippedRef  = useRef(false);
  const lockRef     = useRef(false); // prevents double-triggers during animation

  function resetCard() {
    flipAnim.setValue(0);
    pan.setValue({ x: 0, y: 0 });
    flippedRef.current = false;
    lockRef.current    = false;
    setFlipped(false);
    setActiveTenseIdx(0);
    setActiveDeclIdx(0);
    setDeclNumber('sg');
  }

  function handleFlip() {
    if (lockRef.current) return;
    lockRef.current = true;
    const nowFlipped = flippedRef.current;
    Animated.spring(flipAnim, {
      toValue: nowFlipped ? 0 : 180,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start(() => {
      flippedRef.current = !nowFlipped;
      lockRef.current    = false;
      setFlipped(!nowFlipped);
    });
  }

  function handleMark(mark: 'got' | 'no') {
    const card = sessionWords[index];
    if (!card) return;
    const newTally = {
      correct: tally.correct + (mark === 'got' ? 1 : 0),
      missed:  tally.missed  + (mark === 'no'  ? 1 : 0),
    };
    if (mark === 'got') recordPractice(card.id, true);
    if (mark === 'no')  recordPractice(card.id, false);
    if (index + 1 >= sessionWords.length) {
      recordSession();
      analytics.trackGameCompleted('flashcards', langFilter ?? 'all', newTally.correct);
      setDone(newTally);
    } else {
      setTally(newTally);
      setIndex((i) => i + 1);
      resetCard();
    }
  }

  // Keep a live ref so the panResponder (created once via useRef) always calls
  // the latest handleMark and sees current index/tally rather than stale closure values.
  const handleMarkRef = useRef(handleMark);
  handleMarkRef.current = handleMark;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !lockRef.current && Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 10,
      onPanResponderMove: (_, gs) => {
        pan.setValue({ x: gs.dx, y: gs.dy * 0.15 });
      },
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) > SWIPE_THRESHOLD) {
          lockRef.current = true;
          const dir = gs.dx > 0 ? 1 : -1;
          Animated.timing(pan, {
            toValue: { x: dir * (SW + 100), y: gs.dy },
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            handleMarkRef.current(dir > 0 ? 'got' : 'no');
            pan.setValue({ x: 0, y: 0 });
            flipAnim.setValue(0);
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  // Flip transforms
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] });
  const backRotate  = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] });

  // Swipe tints — subtle, so they don't obscure card text
  const rightTint = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 0.12], extrapolate: 'clamp' });
  const leftTint  = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [0.12, 0], extrapolate: 'clamp' });
  const cardRot   = pan.x.interpolate({ inputRange: [-SW, SW], outputRange: ['-12deg', '12deg'] });

  // Dynamic shadow — fades in as card is lifted/tilted during a swipe
  const dynamicShadowOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });

  // ── Empty state ───────────────────────────────────────────────────────────────

  if (sessionWords.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Flashcards" current={0} total={0} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            No words to practise yet. Save words from your briefing first.
          </Text>
        </View>
      </View>
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────────

  if (done) {
    const isPerfect = done.missed === 0 && sessionWords.length > 0;
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Flashcards" current={sessionWords.length} total={sessionWords.length} />
        {isPerfect && (
          <ConfettiCannon
            count={180}
            origin={{ x: SW / 2, y: -20 }}
            autoStart fadeOut fallSpeed={2800}
            colors={(() => {
              // Derive colours from the actual session words — more reliable than langFilter
              const sessionLangs = [...new Set(sessionWords.map((w) => w.language))];
              if (sessionLangs.length === 1 && FLAG_COLORS[sessionLangs[0]]) {
                return FLAG_COLORS[sessionLangs[0]];
              }
              const mixed = [...new Set(sessionLangs.flatMap((l) => FLAG_COLORS[l] ?? []))];
              return mixed.length > 0 ? mixed : ['#E53935', '#43A047', '#1E88E5', '#FFB300'];
            })()}
          />
        )}
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={colors.accentRed} />
          {isPerfect && congratsLines.map((line, i) => (
            <Text key={i} style={[styles.congratsLine, { color: colors.accentRed, fontFamily: i === 0 ? fontFamily.bold : fontFamily.italic }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            Session complete
          </Text>
          <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={{ borderRadius: 12, overflow: 'hidden' }}>
              <StatRow label="Got it"  icon="checkmark-circle-outline" tint="#43A047" value={done.correct} colors={colors} fontFamily={fontFamily} />
              <StatRow label="No idea" icon="close-circle-outline"     tint="#E53935" value={done.missed}  colors={colors} fontFamily={fontFamily} />
            </View>
          </View>
          <Text style={[styles.streakText, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>
            {streak} day streak
          </Text>
          <SpringButton style={[styles.doneBtn, { backgroundColor: colors.accentRed }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.doneBtnText, { fontFamily: fontFamily.regular }]}>Back to practise</Text>
          </SpringButton>
        </View>
      </View>
    );
  }

  // ── Game ──────────────────────────────────────────────────────────────────────

  const card = sessionWords[index];
  const remaining = sessionWords.length - index;
  const reversed = gameSettings.direction === 'translation-to-word';
  const frontText = reversed ? (card?.translation || '—') : (card?.word || '—');
  const backText  = reversed ? (card?.word || '—') : (card?.translation || '—');

  // Build tense list for the active card — prefer full tenses array, fall back to legacy fields
  const cardTenses: Array<{ label: string; table: Record<string, string> }> = [];
  const liveTenses = card?.id ? (refreshedTenses[card.id] ?? card?.tenses) : card?.tenses;
  if (liveTenses && liveTenses.length > 0) {
    cardTenses.push(...liveTenses);
  } else {
    if (card?.verbTable && Object.keys(card.verbTable).length > 0) {
      cardTenses.push({ label: 'PRESENT', table: card.verbTable });
    }
    if (card?.verbTablePast && Object.keys(card.verbTablePast).length > 0) {
      cardTenses.push({ label: PAST_TENSE_LABEL[card.language as LanguageCode] ?? 'PAST', table: card.verbTablePast });
    }
  }
  const activeTense = cardTenses[activeTenseIdx] ?? null;

  const flashPillLemma = (() => {
    if (!card) return null;
    const wt = card.wordType;
    const f = card.forms;
    if (wt === 'noun' && f?.article && card.lemma) return `${f.article} ${card.lemma}`;
    if (card.lemma && card.lemma !== card.word.toLowerCase()) return card.lemma;
    return null;
  })();
  const flashPillLabel = (() => {
    const wt = card?.wordType;
    if (wt === 'verb') return 'Infinitive';
    if (wt === 'noun') return 'Noun';
    if (wt === 'adjective') return 'Adjective';
    if (wt === 'adverb') return 'Adverb';
    return 'Root';
  })();

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader
        title="Flashcards"
        current={index + 1}
        total={sessionWords.length}
        onSettingsPress={() => setSettingsVisible(true)}
      />

      <View style={styles.deckArea}>
        {/* Background stack cards — computed translateY gives equal visible strips between cards */}
        {Array.from({ length: Math.min(3, remaining - 1) }, (_, i) => {
          const depth = i + 1;
          const s = 1 - depth * STACK_SCALE;
          // To get a uniform STACK_STRIP px visible per depth level:
          // bottom_depth = layout_center + s*(T + CARD_H/2) = layout_center + CARD_H/2 + depth*STACK_STRIP
          // => T = (CARD_H/2 + depth*STACK_STRIP) / s - CARD_H/2
          const translateY = (CARD_H / 2 + depth * STACK_STRIP) / s - CARD_H / 2;
          return (
            <View
              key={`stack-${index + depth}`}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.borderLight,
                  position: 'absolute',
                  zIndex: 10 - depth,
                  transform: [{ scale: s }, { translateY }],
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.10,
                  shadowRadius: 8,
                  elevation: 4,
                },
              ]}
            />
          );
        })}

        {/* Active card — flip + swipe container */}
        <Animated.View
          style={[
            styles.cardContainer,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { rotate: cardRot },
              ],
              zIndex: 20,
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Dynamic shadow — body hidden behind faces, shadow extends outward */}
          <Animated.View
            pointerEvents="none"
            style={[styles.cardShadowLayer, { backgroundColor: colors.card, opacity: dynamicShadowOpacity }]}
          />

          {/* ── Front face ──────────────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.card,
              styles.face,
              {
                backgroundColor: colors.card,
                borderColor: colors.borderLight,
                transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
              },
            ]}
            pointerEvents={flipped ? 'none' : 'auto'}
          >
            <SpringButton style={styles.faceTouchable} onPress={handleFlip}>
              <View style={[styles.cardMeta, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.cardLang, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                  {card.language.toUpperCase()}
                </Text>
                <View style={[styles.pileBadge, { borderColor: colors.borderMid }]}>
                  <Text style={[styles.pileBadgeText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                    {card.pile}
                  </Text>
                </View>
              </View>

              <View style={styles.frontBody}>
                <Text style={[styles.frontWord, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  {frontText}
                </Text>
                {!reversed && <WordAudioButton word={card.word} language={card.language as LanguageCode} size="md" />}
              </View>

              <View style={[styles.tapHint, { borderTopColor: colors.borderLight }]}>
                <Text style={[styles.tapHintText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Tap to reveal
                </Text>
              </View>
            </SpringButton>

            <Animated.View style={[styles.tintOverlay, { backgroundColor: '#43A047', opacity: rightTint }]} />
            <Animated.View style={[styles.tintOverlay, { backgroundColor: '#E53935', opacity: leftTint }]} />
          </Animated.View>

          {/* ── Back face ───────────────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.card,
              styles.face,
              {
                backgroundColor: colors.card,
                borderColor: colors.borderLight,
                transform: [{ perspective: 1200 }, { rotateY: backRotate }],
              },
            ]}
            pointerEvents={flipped ? 'auto' : 'none'}
          >
            <ScrollView
              contentContainerStyle={styles.backContent}
              showsVerticalScrollIndicator={false}
              directionalLockEnabled
            >
              {/* Translation / answer — large centered */}
              <Text style={[styles.backTranslation, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
                {backText}
              </Text>
              {reversed && <WordAudioButton word={card.word} language={card.language as LanguageCode} size="md" />}

              {/* Infinitive/noun pill — informational only, not tappable in game context */}
              {flashPillLemma && (
                <View style={[
                  styles.flashPill,
                  {
                    backgroundColor: colors.card,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.borderLight,
                  },
                ]}>
                  <Text style={[styles.flashPillText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                    {flashPillLabel}: {flashPillLemma}
                  </Text>
                </View>
              )}

              <View style={[styles.backDivider, { backgroundColor: colors.borderLight }]} />

              {/* Grammar tags — dot-separated plain text, all red */}
              {(card.wordType || card.level || card.meta || card.forms?.gender) ? (
                <Text style={[styles.grammarTags, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                  {[
                    card.wordType ? card.wordType.charAt(0).toUpperCase() + card.wordType.slice(1) : null,
                    card.forms?.gender ? (card.forms.gender as string).charAt(0).toUpperCase() + (card.forms.gender as string).slice(1) : null,
                    card.meta?.isRegular === true  ? 'Regular'   : null,
                    card.meta?.isRegular === false ? 'Irregular' : null,
                    card.meta?.auxiliary   ? card.meta.auxiliary   as string : null,
                    card.meta?.isSeparable ? 'Separable'                    : null,
                    card.meta?.verbClass   ? card.meta.verbClass   as string : null,
                    card.level ?? null,
                  ].filter(Boolean).join('  ·  ')}
                </Text>
              ) : null}

              <View style={[styles.backDivider, { backgroundColor: colors.borderLight }]} />

              {card.explanation ? (
                <Text style={[styles.backExplanation, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  {card.explanation}
                </Text>
              ) : null}

              {/* Example sentence — directly under explanation */}
              {card.exampleSentence ? (
                <View style={[styles.backBlockquote, { borderLeftColor: colors.accentRed }]}>
                  <Text style={[styles.backBlockquoteText, { color: colors.inkMid, fontFamily: fontFamily.italic, fontSize: 13 }]}>
                    „{card.exampleSentence}"
                  </Text>
                </View>
              ) : null}

              {/* Pronunciation — no slashes, grey italic */}
              {card.pronunciation ? (
                <Text style={[styles.pronunciation, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                  {card.pronunciation}
                </Text>
              ) : null}

              {/* Forms — plain rows with centered FORMS header */}
              {card.forms && Object.keys(card.forms).length > 0 ? (
                <View style={styles.formsList}>
                  <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular, textAlign: 'center', marginBottom: 4 }]}>
                    FORMS
                  </Text>
                  {Object.entries(card.forms).map(([key, value]) => (
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
              ) : null}

              {/* Declension / inflection table — three-column with 13-char arrow fallback */}
              {card.declensions && card.declensions.length > 0 && (() => {
                const allDecl = card.declensions!;
                const activeDecl = allDecl[activeDeclIdx];
                if (!activeDecl) return null;
                const split = splitDeclFC(activeDecl.table);
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
                        <GlassButton
                          size={34}
                          onPress={() => {
                            if (split.mode === 'split' && declNumber === 'pl') { setDeclNumber('sg'); }
                            else { setActiveDeclIdx((i) => Math.max(0, i - 1)); setDeclNumber('sg'); }
                          }}
                          disabled={activeDeclIdx === 0 && (split.mode !== 'split' || declNumber === 'sg')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="chevron-back" size={16} color={colors.inkDark} />
                        </GlassButton>
                        <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                          {navLabel}
                        </Text>
                        <GlassButton
                          size={34}
                          onPress={() => {
                            if (split.mode === 'split' && declNumber === 'sg') { setDeclNumber('pl'); }
                            else { setActiveDeclIdx((i) => Math.min(allDecl.length - 1, i + 1)); setDeclNumber('sg'); }
                          }}
                          disabled={activeDeclIdx === allDecl.length - 1 && (split.mode !== 'split' || declNumber === 'pl')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="chevron-forward" size={16} color={colors.inkDark} />
                        </GlassButton>
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

              {/* Verb tenses with circular nav arrows — arrows captured by inner Touchable, don't flip card */}
              {cardTenses.length > 0 && activeTense ? (
                <>
                  <View style={[styles.backDivider, { backgroundColor: colors.borderLight }]} />
                  <View style={styles.tenseSectionCenter}>
                    <Text style={[styles.tenseSectionLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                      VERB TENSES
                    </Text>
                    {cardTenses.length > 1 ? (
                      <View style={styles.tenseNav}>
                        <GlassButton
                          size={34}
                          onPress={() => setActiveTenseIdx((i) => Math.max(0, i - 1))}
                          disabled={activeTenseIdx === 0}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="chevron-back" size={16} color={colors.inkDark} />
                        </GlassButton>
                        <Text style={[styles.tenseLabel, { color: colors.accentRed, fontFamily: fontFamily.regular }]}>
                          {activeTense.label}
                        </Text>
                        <GlassButton
                          size={34}
                          onPress={() => setActiveTenseIdx((i) => Math.min(cardTenses.length - 1, i + 1))}
                          disabled={activeTenseIdx === cardTenses.length - 1}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="chevron-forward" size={16} color={colors.inkDark} />
                        </GlassButton>
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
              ) : null}

              {card.tip ? (
                <View style={[styles.tipBox, { backgroundColor: colors.accentRed + '15', borderColor: colors.accentRed + '44' }]}>
                  <Ionicons name="bulb-outline" size={13} color={colors.accentRed} />
                  <Text style={[styles.tipText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                    {card.tip}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {/* Swipe hints */}
            <View style={[styles.swipeHints, { borderTopColor: colors.borderLight, backgroundColor: colors.card }]}>
              <View style={styles.swipeHintSide}>
                <Ionicons name="close-circle" size={18} color="#E53935" />
                <Text style={[styles.swipeHintText, { color: '#E53935', fontFamily: fontFamily.regular }]}>No idea</Text>
              </View>
              <SpringButton
                onPress={handleFlip}
                hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                glass
                cornerRadius={20}
              >
                <Ionicons name="sync-outline" size={18} color={colors.inkFaint} />
              </SpringButton>
              <View style={styles.swipeHintSide}>
                <Text style={[styles.swipeHintText, { color: '#43A047', fontFamily: fontFamily.regular }]}>Got it</Text>
                <Ionicons name="checkmark-circle" size={18} color="#43A047" />
              </View>
            </View>

            <Animated.View style={[styles.tintOverlay, { backgroundColor: '#43A047', opacity: rightTint }]} />
            <Animated.View style={[styles.tintOverlay, { backgroundColor: '#E53935', opacity: leftTint }]} />
          </Animated.View>
        </Animated.View>
      </View>

      {/* Remaining pill */}
      <View style={[styles.remainingRow, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Text style={[styles.remainingText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          {remaining} {remaining === 1 ? 'card' : 'cards'} remaining
        </Text>
      </View>

      <GameSettingsSheet
        visible={settingsVisible}
        settings={gameSettings}
        onClose={() => setSettingsVisible(false)}
        onChange={setGameSettings}
      />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatRow({ label, icon, tint, value, colors, fontFamily }: any) {
  return (
    <View style={[styles.statRow, { borderBottomColor: colors.borderLight }]}>
      <Ionicons name={icon} size={20} color={tint} style={{ width: 28 }} />
      <Text style={[styles.statLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill:    { flex: 1 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },

  deckArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: STACK_STRIP * 6,
  },

  cardContainer: {
    width: CARD_W,
    height: CARD_H,
    // Shadow lives here (not on card) so overflow:hidden on face views doesn't clip it
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },

  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardShadowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 20,
  },

  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
  },

  faceTouchable: { flex: 1 },

  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardLang: { fontSize: 11, letterSpacing: 1.5 },
  pileBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pileBadgeText: { fontSize: 10, letterSpacing: 0.5 },

  frontBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  frontWord: {
    fontSize: 30,
    textAlign: 'center',
    lineHeight: 38,
  },

  tapHint: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tapHintText: { fontSize: 11, letterSpacing: 0.8 },

  // Back face content
  backContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    flexGrow: 1,
  },
  backTranslation: { textAlign: 'center', marginBottom: 2 },
  backDivider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.sm },
  flashPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    gap: 3, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 99,
    marginTop: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  flashPillText: { fontSize: 13 },
  backExplanation: { lineHeight: 22, textAlign: 'center' },
  pronunciation: { fontSize: 12, textAlign: 'center', letterSpacing: 0.5, opacity: 0.7, marginTop: 4 },
  backBlockquote: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8, marginTop: Spacing.sm },
  backBlockquoteText: { lineHeight: 20 },
  tipBox: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm, borderRadius: 8, borderWidth: 1, alignItems: 'flex-start', marginTop: Spacing.xs },
  tipText: { flex: 1, fontSize: 11, lineHeight: 17 },

  // Grammar tags — dot-separated plain text
  grammarTags: { fontSize: 13, textAlign: 'center', letterSpacing: 0.2, paddingVertical: Spacing.xs },

  // Forms plain list
  formsList: { marginBottom: 4 },
  formsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  formsRowLabel: { fontSize: 13, fontStyle: 'italic' },
  formsRowValue: { fontSize: 15 },

  // Three-column declension layout
  declRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  declCaseCol: { flex: 1.2 },
  declCaseLabel: { flex: 1.2, fontSize: 12 },
  declColHeader: { flex: 1, fontSize: 10, letterSpacing: 1, textAlign: 'right' },
  declValue: { flex: 1, fontSize: 13, textAlign: 'right' },

  // Verb tense nav (matches WordPopup design)
  tenseSectionCenter: { alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.xs },
  tenseSectionLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  tenseNav: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  tenseNavBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tenseLabel: { fontSize: 11, letterSpacing: 1, minWidth: 110, textAlign: 'center' },
  conjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  conjPronoun: { fontSize: 13, flex: 1, fontStyle: 'italic' },
  conjForm: { fontSize: 13, flex: 1, textAlign: 'right' },

  swipeHints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  swipeHintSide: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swipeHintText: { fontSize: 12 },
  swipeHintMiddle: { fontSize: 10, letterSpacing: 0.5, opacity: 0.5 },

  tintOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 16,
    pointerEvents: 'none',
  },

  remainingRow: { alignItems: 'center', paddingTop: Spacing.sm },
  remainingText: { fontSize: 11, letterSpacing: 0.5 },

  // Done screen
  doneTitle: { textAlign: 'center' },
  statsBox: {
    width: '100%', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  statLabel: { flex: 1, fontSize: 15 },
  statValue: { fontSize: 20 },
  streakText: { fontSize: 20 },
  doneBtn: {
    borderRadius: 12, paddingHorizontal: Spacing.xxl, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
  },
  doneBtnText: { color: '#FFF', fontSize: 16 },
  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
});


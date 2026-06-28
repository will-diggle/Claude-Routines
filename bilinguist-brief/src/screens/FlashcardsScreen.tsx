import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Animated, PanResponder, Dimensions,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useShallow } from 'zustand/react/shallow';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getCongratsLines } from '../utils/congrats';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { WordAudioButton } from '../components/WordAudioButton';
import { Spacing } from '../theme';
import { useNavPillStore } from '../store/useNavPillStore';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';

const { width: SW, height: SH } = Dimensions.get('window');
const MAX_CARDS = 15;
const CARD_W = SW - 48;
const CARD_H = Math.min(Math.round(CARD_W * 1.42), Math.round(SH * 0.60));
const SWIPE_THRESHOLD = 80;
const STACK_OFFSET = 20;
const STACK_SCALE = 0.04;

function levelColor(level?: string | null): string {
  if (!level) return '#888';
  if (level === 'A1' || level === 'A2') return '#2E7D32';
  if (level === 'B1' || level === 'B2') return '#E65100';
  return '#6A1B9A';
}

function getSessionWords(words: SavedWord[]): SavedWord[] {
  const revisit = words.filter((w) => w.pile === 'revisit');
  const newW    = words.filter((w) => w.pile === 'new');
  const learning = words.filter((w) => w.pile === 'learning');
  return [...revisit, ...newW, ...learning].slice(0, MAX_CARDS);
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
  const { words, recordPractice } = useWordBankStore();
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

  const [index, setIndex]   = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone]     = useState<{ correct: number; missed: number } | null>(null);
  const [tally, setTally]   = useState({ correct: 0, missed: 0 });

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
        flippedRef.current && !lockRef.current && Math.abs(gs.dx) > 8,
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

  // Swipe tints
  const rightTint = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 0.28], extrapolate: 'clamp' });
  const leftTint  = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [0.28, 0], extrapolate: 'clamp' });
  const cardRot   = pan.x.interpolate({ inputRange: [-SW, SW], outputRange: ['-12deg', '12deg'] });

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
          <ConfettiCannon count={180} origin={{ x: SW / 2, y: -20 }} autoStart fadeOut fallSpeed={2800} />
        )}
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={colors.accentGold} />
          {isPerfect && congratsLines.map((line, i) => (
            <Text key={i} style={[styles.congratsLine, { color: colors.accentGold, fontFamily: i === 0 ? fontFamily.bold : fontFamily.italic }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
            Session complete
          </Text>
          <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <StatRow label="Got it"  icon="checkmark-circle-outline" tint="#43A047" value={done.correct} colors={colors} fontFamily={fontFamily} />
            <StatRow label="No idea" icon="close-circle-outline"     tint="#E53935" value={done.missed}  colors={colors} fontFamily={fontFamily} />
          </View>
          <Text style={[styles.streakText, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
            {streak} day streak
          </Text>
          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.accentGold }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.doneBtnText, { fontFamily: fontFamily.regular }]}>Back to practice</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Game ──────────────────────────────────────────────────────────────────────

  const card = sessionWords[index];
  const remaining = sessionWords.length - index;

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Flashcards" current={index + 1} total={sessionWords.length} />

      <View style={styles.deckArea}>
        {/* Background stack cards */}
        {Array.from({ length: Math.min(3, remaining - 1) }, (_, i) => {
          const depth = i + 1;
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
                  transform: [
                    { scale: 1 - depth * STACK_SCALE },
                    { translateY: depth * STACK_OFFSET },
                  ],
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
            <TouchableOpacity style={styles.faceTouchable} onPress={handleFlip} activeOpacity={0.95}>
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
                  {card.word}
                </Text>
                <WordAudioButton word={card.word} language={card.language as LanguageCode} size="md" />
              </View>

              <View style={[styles.tapHint, { borderTopColor: colors.borderLight }]}>
                <Text style={[styles.tapHintText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  Tap to reveal
                </Text>
              </View>
            </TouchableOpacity>

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
            >
              {/* Translation */}
              <Text style={[styles.backTranslation, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading }]}>
                {card.translation || '—'}
              </Text>

              {/* Badges */}
              <View style={styles.badgeRow}>
                {card.level ? (
                  <View style={[styles.levelCircle, { backgroundColor: levelColor(card.level) }]}>
                    <Text style={[styles.levelCircleText, { fontFamily: fontFamily.bold }]}>
                      {card.level}
                    </Text>
                  </View>
                ) : null}
                {card.wordType ? (
                  <View style={[styles.badge, { backgroundColor: colors.chrome }]}>
                    <Text style={[styles.badgeText, { color: colors.bg, fontFamily: fontFamily.regular }]}>
                      {card.wordType}
                    </Text>
                  </View>
                ) : null}
              </View>

              {card.explanation ? (
                <Text style={[styles.backExplanation, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                  {card.explanation}
                </Text>
              ) : null}

              {card.pronunciation ? (
                <Text style={[styles.pronunciation, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
                  /{card.pronunciation}/
                </Text>
              ) : null}

              {card.verbTable ? (
                <VerbTable title="Present" table={card.verbTable} colors={colors} fontFamily={fontFamily} />
              ) : null}
              {card.verbTablePast ? (
                <VerbTable title="Past" table={card.verbTablePast} colors={colors} fontFamily={fontFamily} />
              ) : null}

              {card.forms ? (
                <FormsView forms={card.forms} colors={colors} fontFamily={fontFamily} />
              ) : null}

              {card.exampleSentence ? (
                <Text style={[styles.backExample, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
                  "{card.exampleSentence}"
                </Text>
              ) : null}

              {card.tip ? (
                <View style={[styles.tipBox, { backgroundColor: colors.accentGold + '15', borderColor: colors.accentGold + '44' }]}>
                  <Ionicons name="bulb-outline" size={13} color={colors.accentGold} />
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
              <TouchableOpacity
                onPress={handleFlip}
                hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
                activeOpacity={0.6}
              >
                <Ionicons name="sync-outline" size={18} color={colors.inkFaint} />
              </TouchableOpacity>
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
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerbTable({ title, table, colors, fontFamily }: { title: string; table: Record<string, string>; colors: any; fontFamily: any }) {
  return (
    <View style={vStyles.wrap}>
      <Text style={[vStyles.title, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>{title}</Text>
      {Object.entries(table).map(([pronoun, form]) => (
        <View key={pronoun} style={[vStyles.row, { borderBottomColor: colors.borderLight }]}>
          <Text style={[vStyles.pronoun, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>{pronoun}</Text>
          <Text style={[vStyles.form, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{form}</Text>
        </View>
      ))}
    </View>
  );
}

function FormsView({ forms, colors, fontFamily }: { forms: Record<string, string>; colors: any; fontFamily: any }) {
  return (
    <View style={vStyles.wrap}>
      {Object.entries(forms).map(([key, val]) => (
        <View key={key} style={[vStyles.row, { borderBottomColor: colors.borderLight }]}>
          <Text style={[vStyles.pronoun, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>{key}</Text>
          <Text style={[vStyles.form, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{val}</Text>
        </View>
      ))}
    </View>
  );
}

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
    paddingBottom: STACK_OFFSET * 3,
  },

  cardContainer: {
    width: CARD_W,
    height: CARD_H,
  },

  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },

  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CARD_W,
    height: CARD_H,
    backfaceVisibility: 'hidden',
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
  badgeRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, letterSpacing: 0.5 },
  levelCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  levelCircleText: { fontSize: 10, color: '#FFF', letterSpacing: 0.3 },
  backExplanation: { lineHeight: 22, textAlign: 'center' },
  pronunciation: { fontSize: 12, textAlign: 'center', letterSpacing: 0.5, opacity: 0.7 },
  backExample: { fontSize: 12, lineHeight: 19, textAlign: 'center' },
  tipBox: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm, borderRadius: 8, borderWidth: 1, alignItems: 'flex-start' },
  tipText: { flex: 1, fontSize: 11, lineHeight: 17 },

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
  statsBox: { width: '100%', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  statLabel: { flex: 1, fontSize: 15 },
  statValue: { fontSize: 20 },
  streakText: { fontSize: 20 },
  doneBtn: { borderRadius: 8, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneBtnText: { color: '#FFF', fontSize: 16 },
  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
});

const vStyles = StyleSheet.create({
  wrap: { marginTop: Spacing.xs },
  title: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth },
  pronoun: { fontSize: 12 },
  form: { fontSize: 12 },
});

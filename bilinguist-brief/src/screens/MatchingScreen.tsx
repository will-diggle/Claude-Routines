import { SpringButton } from '../components/SpringButton';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Dimensions, TouchableOpacity,
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
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { useNavPillStore } from '../store/useNavPillStore';
import { getCongratsLines } from '../utils/congrats';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';
import { GlassButton } from '../components/GlassButton';

const SCREEN_W = Dimensions.get('window').width;

const TIME_LIMIT       = 60;
const PAIRS_PER_SCREEN = 6;
const MIN_WORDS        = PAIRS_PER_SCREEN;
const EXIT_DURATION    = 320;
const SHAKE_THRESHOLD  = 10;

interface Tile {
  id: string;
  pairId: string;
  text: string;
  isNative: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeTiles(words: SavedWord[]): Tile[] {
  return words.flatMap((w) => [
    { id: `${w.id}-native`, pairId: w.id, text: w.word        || '—', isNative: true },
    { id: `${w.id}-trans`,  pairId: w.id, text: w.translation || w.word || '—', isNative: false },
  ]);
}

export function MatchingScreen() {
  const { colors, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'Matching'>>();
  const langFilter = route.params?.language;
  const { words } = useWordBankStore();
  const { recordSession, streak, speedSnapHighScore, setSpeedSnapHighScore } = useStreakStore();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)));
  const setGameActive = useNavPillStore((s) => s.setGameActive);
  const scoreRef = useRef(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const congratsLines = useMemo(() => getCongratsLines(activeLanguages), [isNewBest]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => {
    setGameActive(true);
    return () => setGameActive(false);
  }, [setGameActive]));
  useFocusEffect(useCallback(() => {
    analytics.trackGameOpened('matching', langFilter ?? 'all');
  }, [langFilter]));

  const eligibleWords = useMemo(() => {
    const pool = words.filter((w) =>
      (langFilter && langFilter !== 'all' ? w.language === langFilter : true)
      && !!w.translation,
    );
    return shuffle(pool);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [wordPool, setWordPool] = useState<SavedWord[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'done'>('playing');

  const tilesRef    = useRef<Tile[]>([]);
  const wordPoolRef = useRef<SavedWord[]>([]);
  const timeLeftRef = useRef(TIME_LIMIT);

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongAnim      = useRef(new Animated.Value(0)).current;
  const timerAnim      = useRef(new Animated.Value(TIME_LIMIT)).current;
  const shakeAnim      = useRef(new Animated.Value(0)).current;
  const shakeLoopRef   = useRef<Animated.CompositeAnimation | null>(null);
  const congratsFadeAnim = useRef(new Animated.Value(1)).current;
  const [congratsIdx, setCongratsIdx] = useState(0);
  const congratsCycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exitAnims = useRef(new Map<string, { y: Animated.Value; op: Animated.Value }>());

  function getExitAnim(id: string) {
    if (!exitAnims.current.has(id)) {
      exitAnims.current.set(id, { y: new Animated.Value(0), op: new Animated.Value(1) });
    }
    return exitAnims.current.get(id)!;
  }

  function animateMatchOut(idA: string, idB: string, pairId: string) {
    const a = getExitAnim(idA);
    const b = getExitAnim(idB);
    Animated.parallel([
      Animated.timing(a.y,  { toValue: 600, duration: EXIT_DURATION, useNativeDriver: true, easing: Easing.in(Easing.cubic) }),
      Animated.timing(a.op, { toValue: 0,   duration: EXIT_DURATION - 40, useNativeDriver: true }),
      Animated.timing(b.y,  { toValue: 600, duration: EXIT_DURATION, useNativeDriver: true, easing: Easing.in(Easing.cubic) }),
      Animated.timing(b.op, { toValue: 0,   duration: EXIT_DURATION - 40, useNativeDriver: true }),
    ]).start(() => {
      exitAnims.current.delete(idA);
      exitAnims.current.delete(idB);
      replacePairs(pairId);
    });
  }

  const finishGame = useCallback((finalScore: number) => {
    recordSession();
    if (finalScore > speedSnapHighScore) {
      setSpeedSnapHighScore(finalScore);
      setIsNewBest(true);
    } else {
      setIsNewBest(false);
    }
    analytics.trackGameCompleted('matching', langFilter ?? 'all', finalScore);
    setPhase('done');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedSnapHighScore]);

  const stopShake = useCallback(() => {
    if (shakeLoopRef.current) {
      shakeLoopRef.current.stop();
      shakeLoopRef.current = null;
    }
    shakeAnim.setValue(0);
  }, [shakeAnim]);

  const initGame = useCallback((pool: SavedWord[]) => {
    stopShake();
    const first = pool.slice(0, PAIRS_PER_SCREEN);
    const initialTiles = shuffle(makeTiles(first));
    const restPool = pool.slice(PAIRS_PER_SCREEN);
    tilesRef.current = initialTiles;
    wordPoolRef.current = restPool;
    timeLeftRef.current = TIME_LIMIT;
    timerAnim.setValue(TIME_LIMIT);
    setTiles(initialTiles);
    setWordPool(restPool);
    setMatched(new Set());
    setSelected(null);
    setWrong(null);
    scoreRef.current = 0;
    setScore(0);
    setIsNewBest(false);
    setTimeLeft(TIME_LIMIT);
    setPhase('playing');
  }, [stopShake, timerAnim]);

  useEffect(() => {
    if (eligibleWords.length >= 2) {
      initGame(eligibleWords);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'done' || !isNewBest || congratsLines.length === 0) return;
    let cancelled = false;
    let idx = 0;
    congratsFadeAnim.setValue(1);
    setCongratsIdx(0);

    function cycle() {
      if (cancelled) return;
      congratsCycleRef.current = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(congratsFadeAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
          if (cancelled) return;
          idx = (idx + 1) % congratsLines.length;
          setCongratsIdx(idx);
          Animated.timing(congratsFadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start(() => cycle());
        });
      }, 1500);
    }
    cycle();

    return () => {
      cancelled = true;
      if (congratsCycleRef.current) clearTimeout(congratsCycleRef.current);
      congratsFadeAnim.stopAnimation();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isNewBest]);

  // Main countdown — smooth-animates the bar each tick
  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      const next = timeLeftRef.current;
      Animated.timing(timerAnim, {
        toValue: next,
        duration: 950,
        useNativeDriver: false,
        easing: Easing.linear,
      }).start();
      if (next <= 0) {
        clearInterval(timerRef.current!);
        finishGame(scoreRef.current);
      }
      setTimeLeft(next);
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Shake when time is almost up
  useEffect(() => {
    if (timeLeft <= SHAKE_THRESHOLD && timeLeft > 0 && phase === 'playing') {
      if (!shakeLoopRef.current) {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 3, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
          ])
        );
        shakeLoopRef.current = loop;
        loop.start();
      }
    } else if (timeLeft > SHAKE_THRESHOLD || phase !== 'playing') {
      stopShake();
    }
  }, [timeLeft, phase, shakeAnim, stopShake]);

  function replacePairs(pairId: string) {
    const pool = wordPoolRef.current;
    const currentTiles = tilesRef.current;
    const cycling = pool.length === 0;

    if (cycling) setMatched(new Set());

    const activePool = cycling
      ? shuffle(eligibleWords.filter((w) => !currentTiles.some((t) => t.pairId === w.id && t.pairId !== pairId)))
      : pool;

    if (activePool.length < 1) {
      const remaining = currentTiles.filter((t) => t.pairId !== pairId);
      tilesRef.current = remaining;
      setTiles(remaining);
      if (remaining.length === 0) finishGame(scoreRef.current);
      return;
    }

    const [next, ...rest] = activePool;
    const withoutMatched = currentTiles.filter((t) => t.pairId !== pairId);
    const newTiles = shuffle([...withoutMatched, ...makeTiles([next])]);
    tilesRef.current = newTiles;
    wordPoolRef.current = rest;
    setTiles(newTiles);
    setWordPool(rest);
  }

  function handleTile(tile: Tile) {
    if (matched.has(tile.pairId)) return;
    if (wrong) return;
    if (selected === tile.id) { setSelected(null); return; }

    if (!selected) { setSelected(tile.id); return; }

    const first = tiles.find((t) => t.id === selected);
    if (!first) { setSelected(tile.id); return; }

    // Same column tapped — just switch selection, don't penalise
    if (first.isNative === tile.isNative) { setSelected(tile.id); return; }

    if (first.pairId === tile.pairId && first.id !== tile.id) {
      const newMatched = new Set(matched).add(tile.pairId);
      setMatched(newMatched);
      const firstId = selected;
      setSelected(null);
      setScore((n) => { scoreRef.current = n + 1; return n + 1; });
      animateMatchOut(firstId, tile.id, tile.pairId);
    } else {
      setWrong([selected, tile.id]);
      Animated.sequence([
        Animated.timing(wrongAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => { setWrong(null); setSelected(null); });
    }
  }

  // Animated bar colour: green → orange → red
  const barColor = timerAnim.interpolate({
    inputRange: [0, TIME_LIMIT * 0.25, TIME_LIMIT * 0.5, TIME_LIMIT],
    outputRange: ['#E53935', '#E53935', '#E65100', '#43A047'],
    extrapolate: 'clamp',
  });
  const barWidth = timerAnim.interpolate({
    inputRange: [0, TIME_LIMIT],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const timerFrac = timeLeft / TIME_LIMIT;
  const timerTextColor = timerFrac > 0.5 ? '#43A047' : timerFrac > 0.25 ? '#E65100' : '#E53935';

  // ── Empty state ────────────────────────────────────────────────────────────
  if (eligibleWords.length < MIN_WORDS) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <GlassButton size={40} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
          </GlassButton>
          <Text style={[styles.titleText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            SPEED SNAP
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Save at least {MIN_WORDS} words with translations from your briefing to unlock this game.
          </Text>
        </View>
      </View>
    );
  }

  // ── Done screen ────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const accentColor = isNewBest ? colors.accentGold : colors.accentRed;
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <GlassButton size={40} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
          </GlassButton>
          <Text style={[styles.titleText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            SPEED SNAP
          </Text>
          <View style={{ width: 40 }} />
        </View>
        {isNewBest && (
          <ConfettiCannon count={180} origin={{ x: SCREEN_W / 2, y: -20 }} autoStart fadeOut fallSpeed={2800} />
        )}
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={accentColor} />
          {isNewBest && (
            <>
              <Animated.Text style={[styles.congratsLine, { color: colors.accentGold, fontFamily: fontFamily.bold, opacity: congratsFadeAnim }]}>
                {congratsLines[congratsIdx] ?? ''}
              </Animated.Text>
              <Text style={[styles.newBestBadge, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
                NEW BEST!
              </Text>
            </>
          )}
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            Session complete
          </Text>

          <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={{ borderRadius: 12, overflow: 'hidden' }}>
              <View style={[styles.statRow, { borderBottomColor: colors.borderLight }]}>
                <Ionicons name="flash-outline" size={20} color={accentColor} style={{ width: 28 }} />
                <Text style={[styles.statLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>Score</Text>
                <Text style={[styles.statValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{score}</Text>
              </View>
              {speedSnapHighScore > 0 && (
                <View style={[styles.statRow, { borderBottomColor: colors.borderLight }]}>
                  <Ionicons name="trophy-outline" size={20} color={colors.accentGold} style={{ width: 28 }} />
                  <Text style={[styles.statLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>Best</Text>
                  <Text style={[styles.statValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>{speedSnapHighScore}</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={[styles.streakText, { color: colors.accentRed, fontFamily: fontFamily.bold }]}>
            {streak} day streak
          </Text>
          <SpringButton
            style={[styles.doneBtn, { backgroundColor: colors.accentRed }]}
            onPress={() => initGame(shuffle([...eligibleWords]))}
          >
            <Text style={[styles.doneBtnText, { fontFamily: fontFamily.regular }]}>Play again</Text>
          </SpringButton>
          <SpringButton onPress={() => navigation.goBack()}>
            <Text style={[styles.backLink, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>Back to practise</Text>
          </SpringButton>
        </View>
      </View>
    );
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  const leftTiles  = tiles.filter((t) => t.isNative);
  const rightTiles = tiles.filter((t) => !t.isNative);
  const numRows = Math.max(leftTiles.length, rightTiles.length);

  function renderTile(tile: Tile | undefined) {
    if (!tile) return <View style={{ flex: 1 }} />;
    const isMatched  = matched.has(tile.pairId);
    const isSelected = selected === tile.id;
    const isWrong    = wrong?.includes(tile.id);
    const { y: exitY, op: exitOp } = getExitAnim(tile.id);
    const bgColor = isMatched ? '#43A04730' : isWrong ? '#E5393522' : isSelected ? colors.inkDark + '14' : colors.card;
    const borderColor = isMatched ? '#43A047' : isWrong ? '#E53935' : isSelected ? colors.inkDark : colors.borderLight;
    const borderWidth = (isMatched || isWrong || isSelected) ? 1.5 : StyleSheet.hairlineWidth;
    return (
      <Animated.View key={tile.id} style={{ flex: 1, transform: [{ translateY: exitY }], opacity: exitOp }}>
        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.tile, { backgroundColor: bgColor, borderColor, borderWidth }]}
          onPress={() => !isMatched && handleTile(tile)}
          disabled={isMatched}
        >
          <Text
            style={[styles.tileText, {
              color: isMatched ? '#43A047' : isSelected ? colors.inkDark : colors.inkMid,
              fontFamily: tile.isNative ? fontFamily.bold : fontFamily.regular,
            }]}
            numberOfLines={3}
            adjustsFontSizeToFit
          >
            {tile.text}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>

      {/* ── Header: back | best+title | spacer ── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <GlassButton size={40} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.inkDark} />
        </GlassButton>
        <View style={styles.titleBlock}>
          {speedSnapHighScore > 0 && (
            <Text style={[styles.bestText, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              Best: {speedSnapHighScore}
            </Text>
          )}
          <Text style={[styles.titleText, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            SPEED SNAP
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Smooth full-width timer bar ── */}
      <View style={styles.timerTrack}>
        <Animated.View style={[styles.timerFill, { backgroundColor: barColor, width: barWidth }]} />
      </View>

      {/* ── Timer + score row ── */}
      <View style={styles.timerRow}>
        <Animated.Text style={[styles.timerText, {
          color: timerTextColor,
          fontFamily: fontFamily.bold,
          transform: [{ translateX: shakeAnim }],
        }]}>
          {timeLeft}s
        </Animated.Text>
        <Text style={[styles.timerLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          {score} matched
        </Text>
      </View>

      {/* ── Card grid ── */}
      <View style={[styles.grid, { paddingBottom: insets.bottom + Spacing.md }]}>
        {Array.from({ length: numRows }).map((_, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {renderTile(leftTiles[rowIdx])}
            {renderTile(rightTiles[rowIdx])}
          </View>
        ))}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  titleBlock: { flex: 1, alignItems: 'center' },
  bestText: { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 1 },
  titleText: { fontSize: 15, letterSpacing: 2, textTransform: 'uppercase' },

  timerTrack: { height: 4, width: '100%', overflow: 'hidden' },
  timerFill:  { height: 4 },

  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  timerText:  { fontSize: 18, letterSpacing: 0.5 },
  timerLabel: { fontSize: 12, letterSpacing: 0.3 },

  grid: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  tile: {
    flex: 1,
    borderRadius: 12,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tileText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  congratsLine:  { fontSize: 18, letterSpacing: 0.5 },
  newBestBadge:  { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  doneTitle:     { fontSize: 22, textAlign: 'center' },
  statsBox: {
    width: '100%', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  statLabel: { flex: 1, fontSize: 15 },
  statValue:  { fontSize: 20 },
  streakText: { fontSize: 20 },
  doneBtn: {
    borderRadius: 12, paddingHorizontal: Spacing.xxl, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
  },
  doneBtnText: { color: '#FFF', fontSize: 16 },
  backLink: { fontSize: 14, textDecorationLine: 'underline' },
});

import { SpringButton } from '../components/SpringButton';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../hooks/useTheme';
import { Spacing } from '../theme';
import { useGameActive } from '../hooks/useGameActive';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';
import * as analytics from '../services/analytics';
import { GlassButton } from '../components/GlassButton';
import { GameEndScreen } from '../components/GameEndScreen';
import { GameSettingsSheet, DEFAULT_GAME_SETTINGS, type GameSettings } from '../components/GameSettingsSheet';


const PAIRS_PER_SCREEN = 6;
const MIN_WORDS        = PAIRS_PER_SCREEN;
const FADE_DURATION    = 500;
const MATCH_PAUSE      = 400;
const SHAKE_THRESHOLD  = 10;

interface Tile {
  id: string;
  pairId: string;
  text: string;
  isNative: boolean;
}

interface SlotSel { side: 'left' | 'right'; idx: number }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makePair(word: SavedWord): [Tile, Tile] {
  return [
    { id: `${word.id}-native`, pairId: word.id, text: word.word        || '—', isNative: true  },
    { id: `${word.id}-trans`,  pairId: word.id, text: word.translation || word.word || '—', isNative: false },
  ];
}

export function MatchingScreen() {
  const { colors, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'Matching'>>();
  const langFilter = route.params?.language;
  const { words } = useWordBankStore();
  const { recordSession, speedSnapHighScore, setSpeedSnapHighScore } = useStreakStore();
  const activeLanguages = useSettingsStore(useShallow((s) => s.languages.filter((l) => l.active).map((l) => l.code)));
  useGameActive();
  const scoreRef = useRef(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [settingsVisible, setSettingsVisible] = useState(false);

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

  // ── Slot-based grid: left = foreign word, right = English translation ───────
  // Tiles stay in position on match; new pair fades in at the same two slots.
  const [leftSlots,  setLeftSlots]  = useState<(Tile | null)[]>([]);
  const [rightSlots, setRightSlots] = useState<(Tile | null)[]>([]);
  const leftSlotsRef  = useRef<(Tile | null)[]>([]);
  const rightSlotsRef = useRef<(Tile | null)[]>([]);

  // Per-slot fade animations — reinitialised each game
  const leftFades  = useRef<Animated.Value[]>([]);
  const rightFades = useRef<Animated.Value[]>([]);

  const wordPoolRef = useRef<SavedWord[]>([]);

  const [matched,  setMatched]  = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<SlotSel | null>(null);
  const [wrong,    setWrong]    = useState<[SlotSel, SlotSel] | null>(null);

  const [timeLeft, setTimeLeft] = useState<number>(gameSettings.timeLimit);
  const [score,    setScore]    = useState(0);
  const [phase,    setPhase]    = useState<'playing' | 'done'>('playing');

  const timeLeftRef      = useRef(gameSettings.timeLimit);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongAnim        = useRef(new Animated.Value(0)).current;
  const timerAnim        = useRef(new Animated.Value(gameSettings.timeLimit)).current;
  const shakeAnim        = useRef(new Animated.Value(0)).current;
  const shakeLoopRef     = useRef<Animated.CompositeAnimation | null>(null);

  const stopShake = useCallback(() => {
    if (shakeLoopRef.current) { shakeLoopRef.current.stop(); shakeLoopRef.current = null; }
    shakeAnim.setValue(0);
  }, [shakeAnim]);

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

  const initGame = useCallback((pool: SavedWord[]) => {
    stopShake();
    const first = pool.slice(0, PAIRS_PER_SCREEN);
    // Left column = foreign words, right column = English translations (independently shuffled)
    const left  = shuffle(first.map((w) => makePair(w)[0]));
    const right = shuffle(first.map((w) => makePair(w)[1]));

    leftFades.current  = Array.from({ length: PAIRS_PER_SCREEN }, () => new Animated.Value(1));
    rightFades.current = Array.from({ length: PAIRS_PER_SCREEN }, () => new Animated.Value(1));

    leftSlotsRef.current  = left;
    rightSlotsRef.current = right;
    wordPoolRef.current   = pool.slice(PAIRS_PER_SCREEN);

    setLeftSlots(left);
    setRightSlots(right);
    setMatched(new Set());
    setSelected(null);
    setWrong(null);
    scoreRef.current = 0;
    setScore(0);
    setIsNewBest(false);
    timeLeftRef.current = gameSettings.timeLimit;
    timerAnim.setValue(gameSettings.timeLimit);
    setTimeLeft(gameSettings.timeLimit);
    setPhase('playing');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopShake, timerAnim, gameSettings.timeLimit]);

  useEffect(() => {
    if (eligibleWords.length >= 2) initGame(eligibleWords);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild whenever timeLimit changes in Settings — same reset the direction/
  // roundSize effects use in the other four games, applied to Speed Snap's own
  // setting. A fresh shuffle, not the exact words just played, matching what
  // Play Again already does.
  const prevTimeLimit = useRef(gameSettings.timeLimit);
  useEffect(() => {
    if (gameSettings.timeLimit !== prevTimeLimit.current) {
      prevTimeLimit.current = gameSettings.timeLimit;
      initGame(shuffle([...eligibleWords]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSettings.timeLimit]);

  // ── Countdown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      const next = timeLeftRef.current;
      Animated.timing(timerAnim, {
        toValue: next, duration: 950, useNativeDriver: false, easing: Easing.linear,
      }).start();
      if (next <= 0) { clearInterval(timerRef.current!); finishGame(scoreRef.current); }
      setTimeLeft(next);
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Shake when time almost up ───────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft <= SHAKE_THRESHOLD && timeLeft > 0 && phase === 'playing') {
      if (!shakeLoopRef.current) {
        const loop = Animated.loop(Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 5,  duration: 50,  useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -5, duration: 50,  useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 3,  duration: 50,  useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0,  duration: 100, useNativeDriver: true }),
        ]));
        shakeLoopRef.current = loop;
        loop.start();
      }
    } else if (timeLeft > SHAKE_THRESHOLD || phase !== 'playing') {
      stopShake();
    }
  }, [timeLeft, phase, shakeAnim, stopShake]);

  // ── Replace matched slots with the next word, fading in at same positions ──
  function fillMatchedSlots(leftIdx: number, rightIdx: number, pairId: string) {
    const pool     = wordPoolRef.current;
    const curLeft  = leftSlotsRef.current;
    const curRight = rightSlotsRef.current;

    const cycling = pool.length === 0;
    if (cycling) setMatched(new Set());

    const activePool = cycling
      ? shuffle(eligibleWords.filter((w) =>
          !curLeft.some((t) => t && t.pairId === w.id && t.pairId !== pairId) &&
          !curRight.some((t) => t && t.pairId === w.id && t.pairId !== pairId)
        ))
      : pool;

    if (activePool.length < 1) {
      const nextLeft  = curLeft.map((t, i)  => (i === leftIdx  ? null : t));
      const nextRight = curRight.map((t, i) => (i === rightIdx ? null : t));
      leftSlotsRef.current  = nextLeft;
      rightSlotsRef.current = nextRight;
      setLeftSlots(nextLeft);
      setRightSlots(nextRight);
      if (!nextLeft.some(Boolean) && !nextRight.some(Boolean)) finishGame(scoreRef.current);
      return;
    }

    const [next, ...rest] = activePool;
    wordPoolRef.current = rest;
    const [newLeft, newRight] = makePair(next);

    leftFades.current[leftIdx].setValue(0);
    rightFades.current[rightIdx].setValue(0);

    const nextLeft  = curLeft.map((t, i)  => (i === leftIdx  ? newLeft  : t));
    const nextRight = curRight.map((t, i) => (i === rightIdx ? newRight : t));
    leftSlotsRef.current  = nextLeft;
    rightSlotsRef.current = nextRight;
    setLeftSlots(nextLeft);
    setRightSlots(nextRight);

    if (!cycling) setMatched((prev) => { const n = new Set(prev); n.delete(pairId); return n; });

    Animated.parallel([
      Animated.timing(leftFades.current[leftIdx],   { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
      Animated.timing(rightFades.current[rightIdx], { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
    ]).start();
  }

  // Brief green-matched pause → fade out in place → fill with next word
  function animateMatchOut(leftIdx: number, rightIdx: number, pairId: string) {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(leftFades.current[leftIdx],   { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
        Animated.timing(rightFades.current[rightIdx], { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
      ]).start(() => fillMatchedSlots(leftIdx, rightIdx, pairId));
    }, MATCH_PAUSE);
  }

  // ── Tile interaction ────────────────────────────────────────────────────────
  function handleTileTap(side: 'left' | 'right', idx: number) {
    const tile = (side === 'left' ? leftSlotsRef.current : rightSlotsRef.current)[idx];
    if (!tile || matched.has(tile.pairId) || wrong) return;

    if (selected?.side === side && selected.idx === idx) { setSelected(null); return; }
    if (!selected) { setSelected({ side, idx }); return; }
    if (selected.side === side) { setSelected({ side, idx }); return; }

    const firstTile = (selected.side === 'left' ? leftSlotsRef.current : rightSlotsRef.current)[selected.idx];
    if (!firstTile) { setSelected({ side, idx }); return; }

    const leftIdx  = selected.side === 'left' ? selected.idx : idx;
    const rightIdx = selected.side === 'right' ? selected.idx : idx;

    if (firstTile.pairId === tile.pairId) {
      setMatched((prev) => new Set(prev).add(tile.pairId));
      setSelected(null);
      setScore((n) => { scoreRef.current = n + 1; return n + 1; });
      animateMatchOut(leftIdx, rightIdx, tile.pairId);
    } else {
      const selA: SlotSel = { side: selected.side, idx: selected.idx };
      const selB: SlotSel = { side, idx };
      setWrong([selA, selB]);
      Animated.sequence([
        Animated.timing(wrongAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => { setWrong(null); setSelected(null); });
    }
  }

  // ── Timer bar interpolations ────────────────────────────────────────────────
  const barColor = timerAnim.interpolate({
    inputRange: [0, gameSettings.timeLimit * 0.25, gameSettings.timeLimit * 0.5, gameSettings.timeLimit],
    outputRange: ['#E53935', '#E53935', '#E65100', '#43A047'],
    extrapolate: 'clamp',
  });
  const barWidth = timerAnim.interpolate({
    inputRange: [0, gameSettings.timeLimit],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });
  const timerFrac = timeLeft / gameSettings.timeLimit;
  const timerTextColor = timerFrac > 0.5 ? '#43A047' : timerFrac > 0.25 ? '#E65100' : '#E53935';

  // ── Slot tile renderer ──────────────────────────────────────────────────────
  function renderSlot(tile: Tile | null, side: 'left' | 'right', idx: number) {
    const fade = (side === 'left' ? leftFades : rightFades).current[idx];
    if (!tile || !fade) return <View key={`${side}-${idx}-empty`} style={{ flex: 1 }} />;

    const isMatched  = matched.has(tile.pairId);
    const isSelected = selected?.side === side && selected.idx === idx;
    const isWrong    = wrong ? wrong.some((w) => w.side === side && w.idx === idx) : false;

    const bgColor     = isMatched ? '#43A04730' : isWrong ? '#E5393522' : isSelected ? colors.borderMid + '60' : colors.card;
    const borderColor = isMatched ? '#43A047'   : isWrong ? '#E53935'   : isSelected ? colors.borderMid      : colors.borderLight;
    const borderWidth = (isMatched || isWrong || isSelected) ? 1.5 : StyleSheet.hairlineWidth;

    return (
      <Animated.View key={tile.id} style={{ flex: 1, opacity: fade }}>
        <TouchableOpacity
          activeOpacity={0.75}
          style={[styles.tile, { backgroundColor: bgColor, borderColor, borderWidth }]}
          onPress={() => !isMatched && handleTileTap(side, idx)}
          disabled={isMatched}
        >
          <Text
            style={[styles.tileText, {
              color: isMatched ? '#43A047' : colors.inkMid,
              fontFamily: side === 'left' ? fontFamily.bold : fontFamily.regular,
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

  // ── Empty state ─────────────────────────────────────────────────────────────
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

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const stats: React.ComponentProps<typeof GameEndScreen>['stats'] = [
      { icon: 'flash-outline', tint: isNewBest ? colors.accentGold : colors.accentRed, label: 'Score', value: score },
    ];
    if (speedSnapHighScore > 0) {
      stats.push({ icon: 'trophy-outline', tint: colors.accentGold, label: 'Best', value: speedSnapHighScore });
    }
    return (
      <GameEndScreen
        gameKey="Matching"
        // No fixed round count — Speed Snap is timed, not round-based — so
        // total=0 gets GameHeader's title text instead of progress pills.
        headerCurrent={0}
        headerTotal={0}
        celebrate={isNewBest}
        celebrateBadge={isNewBest ? 'NEW BEST!' : undefined}
        stats={stats}
        onPlayAgain={() => initGame(shuffle([...eligibleWords]))}
        onBack={() => navigation.goBack()}
      />
    );
  }

  // ── Playing ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>

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
        {/* Was a blank spacer balancing the back button — now a real settings
            gear, matching every other game's GameHeader, for the one setting
            Speed Snap actually has (time limit). */}
        <GlassButton size={40} onPress={() => setSettingsVisible(true)}>
          <Ionicons name="settings-outline" size={20} color={colors.inkDark} />
        </GlassButton>
      </View>

      <View style={styles.timerTrack}>
        <Animated.View style={[styles.timerFill, { backgroundColor: barColor, width: barWidth }]} />
      </View>

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

      {/* Left = foreign language, Right = English translation */}
      <View style={[styles.grid, { paddingBottom: insets.bottom + Spacing.md }]}>
        {Array.from({ length: PAIRS_PER_SCREEN }).map((_, i) => (
          <View key={i} style={styles.gridRow}>
            {renderSlot(leftSlots[i] ?? null, 'left', i)}
            {renderSlot(rightSlots[i] ?? null, 'right', i)}
          </View>
        ))}
      </View>

      <GameSettingsSheet
        visible={settingsVisible}
        settings={gameSettings}
        onClose={() => setSettingsVisible(false)}
        onChange={setGameSettings}
        showDirection={false}
        showRoundSize={false}
        showTimeLimit
      />
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
  bestText:   { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 1 },
  titleText:  { fontSize: 15, letterSpacing: 2, textTransform: 'uppercase' },

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

  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
  newBestBadge: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  doneTitle:    { fontSize: 22, textAlign: 'center' },
  statsBox: {
    width: '100%', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  statRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md,
  },
  statLabel:  { flex: 1, fontSize: 15 },
  statValue:  { fontSize: 20 },
  doneBtn: {
    borderRadius: 12, paddingHorizontal: Spacing.xxl, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
  },
  doneBtnText: { color: '#FFF', fontSize: 16 },
  backLink:    { fontSize: 14, textDecorationLine: 'underline' },
});

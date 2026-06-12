import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Dimensions,
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
import { GameHeader } from '../components/GameHeader';
import { Spacing } from '../theme';
import { useNavPillStore } from '../store/useNavPillStore';
import { getCongratsLines } from '../utils/congrats';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';

const SCREEN_W = Dimensions.get('window').width;

const TIME_LIMIT       = 30;
const MIN_WORDS        = 24;
const GRID_COLS        = 3;
const GRID_ROWS        = 4;
const PAIRS_PER_SCREEN = (GRID_COLS * GRID_ROWS) / 2; // 6 pairs × 2 tiles = 12 tiles
const EXIT_DURATION    = 320;

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
    { id: `${w.id}-native`, pairId: w.id, text: w.word, isNative: true },
    { id: `${w.id}-trans`,  pairId: w.id, text: w.translation || w.word, isNative: false },
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

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongAnim = useRef(new Animated.Value(0)).current;
  const congratsFadeAnim = useRef(new Animated.Value(1)).current;
  const [congratsIdx, setCongratsIdx] = useState(0);
  const congratsCycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-tile exit animations — keyed by tile ID.
  // Using a Map of Animated.Values avoids re-creating them on every render.
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
    setPhase('done');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedSnapHighScore]);

  const initGame = useCallback((pool: SavedWord[]) => {
    const first = pool.slice(0, PAIRS_PER_SCREEN);
    setTiles(shuffle(makeTiles(first)));
    setWordPool(pool.slice(PAIRS_PER_SCREEN));
    setMatched(new Set());
    setSelected(null);
    setWrong(null);
    scoreRef.current = 0;
    setScore(0);
    setIsNewBest(false);
    setTimeLeft(TIME_LIMIT);
    setPhase('playing');
  }, []);

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

  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          finishGame(scoreRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function replacePairs(pairId: string) {
    setTiles((prev) => {
      setWordPool((pool) => {
        // When the pool is exhausted, cycle back through eligibleWords so the
        // full 30 s is always playable. Exclude pairIds still visible on the grid
        // so the same word never appears twice at once. Reset matched so recycled
        // words aren't permanently disabled.
        const cycling = pool.length === 0;
        if (cycling) setMatched(new Set());
        const activePool = !cycling ? pool : shuffle(
          eligibleWords.filter((w) => !prev.some((t) => t.pairId === w.id && t.pairId !== pairId)),
        );

        if (activePool.length < 1) {
          // Word bank too small to refill at all — remove matched tiles.
          // If the grid is now empty, end the game.
          const remaining = prev.filter((t) => t.pairId !== pairId);
          setTiles(remaining);
          if (remaining.length === 0) { finishGame(scoreRef.current); }
          return pool;
        }

        const [next, ...rest] = activePool;
        const withoutMatched = prev.filter((t) => t.pairId !== pairId);
        setTiles(shuffle([...withoutMatched, ...makeTiles([next])]));
        return rest;
      });
      return prev;
    });
  }

  function handleTile(tile: Tile) {
    if (matched.has(tile.pairId)) return;
    if (wrong) return;
    if (selected === tile.id) { setSelected(null); return; }

    if (!selected) { setSelected(tile.id); return; }

    const first = tiles.find((t) => t.id === selected);
    if (!first) { setSelected(tile.id); return; }

    if (first.pairId === tile.pairId && first.id !== tile.id) {
      const newMatched = new Set(matched).add(tile.pairId);
      setMatched(newMatched);
      const firstId = selected; // capture before setSelected clears it
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

  if (eligibleWords.length < MIN_WORDS) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Speed Snap" current={0} total={0} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Save at least {MIN_WORDS} words with translations from your briefing to unlock this game.
          </Text>
        </View>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Speed Snap" current={TIME_LIMIT} total={TIME_LIMIT} />
        {isNewBest && (
          <ConfettiCannon count={180} origin={{ x: SCREEN_W / 2, y: -20 }} autoStart fadeOut fallSpeed={2800} />
        )}
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={colors.accentGold} />
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
          <Text style={[styles.doneLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            YOUR SCORE
          </Text>
          <Text style={[styles.doneScore, { color: isNewBest ? colors.accentGold : colors.inkDark, fontFamily: fontFamily.bold }]}>
            {score}
          </Text>
          <Text style={[styles.doneSub, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            pairs matched in 30 seconds
          </Text>
          {!isNewBest && speedSnapHighScore > 0 && (
            <Text style={[styles.doneSub, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
              Best: {speedSnapHighScore}
            </Text>
          )}
          <Text style={[styles.streakText, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
            {streak} day streak
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.accentGold }]}
            onPress={() => initGame(shuffle([...eligibleWords]))}
          >
            <Text style={[styles.doneBtnText, { fontFamily: fontFamily.regular }]}>Play again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.borderMid }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backBtnText, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>Back to practice</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const timerFrac = timeLeft / TIME_LIMIT;
  const timerColor = timerFrac > 0.5 ? '#43A047' : timerFrac > 0.25 ? '#E65100' : '#E53935';

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Speed Snap" current={0} total={0} />

      <View style={[styles.timerTrack, { backgroundColor: colors.borderLight }]}>
        <View style={[styles.timerFill, { backgroundColor: timerColor, width: `${timerFrac * 100}%` as any }]} />
      </View>

      <View style={styles.timerRow}>
        <Text style={[styles.timerText, { color: timerColor, fontFamily: fontFamily.bold }]}>
          {timeLeft}s
        </Text>
        {speedSnapHighScore > 0 && (
          <Text style={[styles.timerLabel, { fontFamily: fontFamily.regular,
            color: score >= speedSnapHighScore ? colors.accentGold : colors.inkFaint }]}>
            Best: {speedSnapHighScore}
          </Text>
        )}
        <Text style={[styles.timerLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          {score} matched
        </Text>
      </View>

      <View style={[styles.grid, { paddingBottom: insets.bottom + Spacing.md }]}>
        {Array.from({ length: GRID_ROWS }).map((_, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {tiles.slice(rowIdx * GRID_COLS, (rowIdx + 1) * GRID_COLS).map((tile) => {
              const isMatched  = matched.has(tile.pairId);
              const isSelected = selected === tile.id;
              const isWrong    = wrong?.includes(tile.id);
              const { y: exitY, op: exitOp } = getExitAnim(tile.id);

              const bgColor = isMatched
                ? '#43A04730'
                : isWrong
                  ? '#E5393522'
                  : isSelected
                    ? colors.inkDark + '14'
                    : colors.card;

              const borderColor = isMatched
                ? '#43A047'
                : isWrong
                  ? '#E53935'
                  : isSelected
                    ? colors.inkDark
                    : colors.borderLight;

              return (
                <Animated.View
                  key={tile.id}
                  style={{ flex: 1, transform: [{ translateY: exitY }], opacity: exitOp }}
                >
                  <TouchableOpacity
                    style={[styles.tile, { backgroundColor: bgColor, borderColor }]}
                    onPress={() => !isMatched && handleTile(tile)}
                    activeOpacity={0.7}
                    disabled={isMatched}
                  >
                    <Text
                      style={[
                        styles.tileText,
                        {
                          color: isMatched ? '#43A047' : isSelected ? colors.inkDark : colors.inkMid,
                          fontFamily: tile.isNative ? fontFamily.bold : fontFamily.regular,
                        },
                      ]}
                      numberOfLines={3}
                      adjustsFontSizeToFit
                    >
                      {tile.text}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
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

  timerTrack: { height: 3, marginHorizontal: Spacing.md, borderRadius: 2 },
  timerFill: { height: 3, borderRadius: 2 },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  timerText: { fontSize: 18, letterSpacing: 0.5 },
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
    borderWidth: 1.5,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  congratsLine: { fontSize: 18, letterSpacing: 0.5 },
  newBestBadge: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  doneLabel: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  doneScore: { fontSize: 64 },
  doneSub: { fontSize: 14 },
  streakText: { fontSize: 20 },
  doneBtn: { borderRadius: 8, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneBtnText: { color: '#FFF', fontSize: 16 },
  backBtn: { borderRadius: 8, paddingHorizontal: Spacing.xxl, paddingVertical: 12, borderWidth: 1 },
  backBtnText: { fontSize: 15 },
});

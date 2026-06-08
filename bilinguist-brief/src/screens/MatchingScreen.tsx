import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWordBankStore, type SavedWord } from '../store/useWordBankStore';
import { useStreakStore } from '../store/useStreakStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../hooks/useTheme';
import { GameHeader } from '../components/GameHeader';
import { Spacing } from '../theme';
import { FLOAT_TAB_INSET } from '../components/FloatingTabBar';
import type { LanguageCode } from '../store/useSettingsStore';
import type { PracticeStackParamList } from '../navigation/PracticeNavigator';

// ── Config ────────────────────────────────────────────────────────────────────

const ROUND_DURATIONS = [60, 45, 30]; // seconds per round
const PAIRS_PER_SCREEN = 6;
const TOTAL_ROUNDS = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tile {
  id: string;          // unique per tile
  pairId: string;      // shared between the two tiles in a pair
  text: string;
  isNative: boolean;   // true = word in target language, false = translation
}

interface RoundSummary {
  round: number;
  matched: number;
  time: number; // seconds used
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Screen ────────────────────────────────────────────────────────────────────

export function MatchingScreen() {
  const { colors, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PracticeStackParamList, 'Matching'>>();
  const langFilter = route.params?.language;
  const { words } = useWordBankStore();
  const { recordSession, streak } = useStreakStore();
  const { activeLanguages } = useSettingsStore();
  const activeCodes = new Set(activeLanguages().map((l) => l.code));

  const eligibleWords = useMemo(() => {
    const pool = words.filter((w) =>
      (langFilter && langFilter !== 'all'
        ? w.language === langFilter
        : activeCodes.has(w.language)) && !!w.translation,
    );
    return shuffle(pool);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [round, setRound] = useState(0);         // 0-indexed
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATIONS[0]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [wordPool, setWordPool] = useState<SavedWord[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set()); // pairIds
  const [selected, setSelected] = useState<string | null>(null);   // tile id
  const [wrong, setWrong] = useState<[string, string] | null>(null); // wrong pair
  const [roundSummaries, setRoundSummaries] = useState<RoundSummary[]>([]);
  const [roundMatched, setRoundMatched] = useState(0); // matched this round
  const [phase, setPhase] = useState<'playing' | 'roundDone' | 'allDone'>('playing');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeUsedRef = useRef(0);

  // Flash animation for wrong pairs
  const wrongAnim = useRef(new Animated.Value(0)).current;

  // ── Initialise round ──────────────────────────────────────────────────────

  const initRound = useCallback((roundIndex: number, pool: SavedWord[]) => {
    const next = pool.slice(0, PAIRS_PER_SCREEN);
    setTiles(shuffle(makeTiles(next)));
    setWordPool(pool.slice(PAIRS_PER_SCREEN));
    setMatched(new Set());
    setSelected(null);
    setWrong(null);
    setRoundMatched(0);
    setTimeLeft(ROUND_DURATIONS[roundIndex] ?? 30);
    timeUsedRef.current = 0;
  }, []);

  useEffect(() => {
    if (eligibleWords.length >= 2) {
      initRound(0, eligibleWords);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          finishRound();
          return 0;
        }
        timeUsedRef.current += 1;
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  // ── Replace matched pairs with new words from pool ────────────────────────

  function replacePairs(pairId: string) {
    setTiles((prev) => {
      // Check if there are new words in the pool to replace with
      setWordPool((pool) => {
        if (pool.length < 1) return pool;
        const [next, ...rest] = pool;
        const newTiles = makeTiles([next]);
        const withoutMatched = prev.filter((t) => t.pairId !== pairId);
        const shuffled = shuffle([...withoutMatched, ...newTiles]);
        setTiles(shuffled);
        return rest;
      });
      return prev; // will be overwritten above
    });
  }

  function finishRound() {
    clearInterval(timerRef.current!);
    const summary: RoundSummary = {
      round: round + 1,
      matched: roundMatched,
      time: timeUsedRef.current,
    };
    setRoundSummaries((s) => [...s, summary]);
    if (round + 1 >= TOTAL_ROUNDS) {
      recordSession();
      setPhase('allDone');
    } else {
      setPhase('roundDone');
    }
  }

  function startNextRound() {
    const nextRound = round + 1;
    setRound(nextRound);
    setPhase('playing');
    initRound(nextRound, wordPool.length >= PAIRS_PER_SCREEN ? wordPool : shuffle([...eligibleWords, ...wordPool]));
  }

  // ── Tile tap ─────────────────────────────────────────────────────────────

  function handleTile(tile: Tile) {
    if (matched.has(tile.pairId)) return;
    if (wrong) return; // locked while showing wrong flash
    if (selected === tile.id) {
      setSelected(null);
      return;
    }

    if (!selected) {
      setSelected(tile.id);
      return;
    }

    // Second tap — check for match
    const first = tiles.find((t) => t.id === selected);
    if (!first) { setSelected(tile.id); return; }

    if (first.pairId === tile.pairId && first.id !== tile.id) {
      // Correct match
      const newMatched = new Set(matched).add(tile.pairId);
      setMatched(newMatched);
      setSelected(null);
      setRoundMatched((n) => n + 1);

      // Replace after short delay
      setTimeout(() => replacePairs(tile.pairId), 400);
    } else {
      // Wrong — flash red briefly
      setWrong([selected, tile.id]);
      Animated.sequence([
        Animated.timing(wrongAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(wrongAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setWrong(null);
        setSelected(null);
      });
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (eligibleWords.length < 2) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <GameHeader title="Match" current={0} total={0} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.inkFaint, fontFamily: fontFamily.italic }]}>
            Save at least 2 words with translations from your briefing to play this game.
          </Text>
        </View>
      </View>
    );
  }

  // ── Round done screen ─────────────────────────────────────────────────────

  if (phase === 'roundDone') {
    const lastSummary = roundSummaries[roundSummaries.length - 1];
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Match" current={round} total={TOTAL_ROUNDS} />
        <View style={styles.center}>
          <Text style={[styles.roundDoneLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
            ROUND {lastSummary?.round}
          </Text>
          <Text style={[styles.roundDoneScore, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            {lastSummary?.matched} matched
          </Text>
          <Text style={[styles.roundDoneNext, { color: colors.accentGold, fontFamily: fontFamily.italic }]}>
            Round {round + 1} — {ROUND_DURATIONS[round]}s
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.accentGold }]}
            onPress={startNextRound}
          >
            <Text style={[styles.doneBtnText, { fontFamily: fontFamily.regular }]}>
              Start Round {round + 1}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── All done screen ───────────────────────────────────────────────────────

  if (phase === 'allDone') {
    const total = roundSummaries.reduce((sum, s) => sum + s.matched, 0);
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <GameHeader title="Match" current={TOTAL_ROUNDS} total={TOTAL_ROUNDS} />
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={colors.accentGold} />
          <Text style={[styles.doneTitle, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            Game complete
          </Text>
          <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            {roundSummaries.map((s) => (
              <View key={s.round} style={[styles.statRow, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.statLabel, { color: colors.inkMid, fontFamily: fontFamily.regular }]}>
                  Round {s.round}  ({ROUND_DURATIONS[s.round - 1]}s)
                </Text>
                <Text style={[styles.statValue, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                  {s.matched}
                </Text>
              </View>
            ))}
            <View style={[styles.statRow, { borderBottomColor: 'transparent' }]}>
              <Text style={[styles.statLabel, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
                Total matched
              </Text>
              <Text style={[styles.statValue, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
                {total}
              </Text>
            </View>
          </View>
          <Text style={[styles.streakText, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
            {streak} day streak
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.accentGold }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.doneBtnText, { fontFamily: fontFamily.regular }]}>Back to practice</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Playing ───────────────────────────────────────────────────────────────

  // Timer colour: green → amber → red as time runs out
  const duration = ROUND_DURATIONS[round] ?? 60;
  const timerFrac = timeLeft / duration;
  const timerColor = timerFrac > 0.5 ? '#43A047' : timerFrac > 0.25 ? '#E65100' : '#E53935';

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <GameHeader title="Match" current={round + 1} total={TOTAL_ROUNDS} />

      {/* Timer bar */}
      <View style={[styles.timerTrack, { backgroundColor: colors.borderLight }]}>
        <View
          style={[
            styles.timerFill,
            {
              backgroundColor: timerColor,
              width: `${timerFrac * 100}%` as any,
            },
          ]}
        />
      </View>

      <View style={[styles.timerRow]}>
        <Text style={[styles.timerText, { color: timerColor, fontFamily: fontFamily.bold }]}>
          {timeLeft}s
        </Text>
        <Text style={[styles.timerLabel, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
          Round {round + 1} · {roundMatched} matched
        </Text>
      </View>

      {/* Grid */}
      <View style={[styles.grid, { paddingBottom: insets.bottom + FLOAT_TAB_INSET }]}>
        {tiles.map((tile) => {
          const isMatched  = matched.has(tile.pairId);
          const isSelected = selected === tile.id;
          const isWrong    = wrong?.includes(tile.id);

          const bgColor = isMatched
            ? '#43A04722'
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
            <TouchableOpacity
              key={tile.id}
              style={[
                styles.tile,
                {
                  backgroundColor: bgColor,
                  borderColor,
                  opacity: isMatched ? 0.5 : 1,
                },
              ]}
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
          );
        })}
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    alignContent: 'flex-start',
    paddingTop: Spacing.sm,
  },

  tile: {
    width: '30.5%',
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Round done
  roundDoneLabel: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  roundDoneScore: { fontSize: 40 },
  roundDoneNext: { fontSize: 15 },

  // All done
  doneTitle: { fontSize: 22, textAlign: 'center' },
  statsBox: { width: '100%', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  statLabel: { flex: 1, fontSize: 14 },
  statValue: { fontSize: 20 },
  streakText: { fontSize: 20 },
  doneBtn: { borderRadius: 8, paddingHorizontal: Spacing.xxl, paddingVertical: 14 },
  doneBtnText: { color: '#FFF', fontSize: 16 },
});

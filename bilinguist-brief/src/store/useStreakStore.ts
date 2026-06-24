import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StreakStore {
  streak: number;
  lastPracticedDate: string | null;
  totalSessionsCompleted: number;
  speedSnapHighScore: number;
  // Per-language reading streaks
  readingStreaks: Record<string, number>;
  lastReadDates: Record<string, string>;
  readingHistory: Record<string, string[]>; // langCode → ['YYYY-MM-DD', ...]
  // Cumulative time spent on each language brief per day (key: `${langCode}_${date}`)
  readingTimeSecs: Record<string, number>;
  // Freeze days consumed per language (ISO date strings)
  freezeDatesUsed: Record<string, string[]>;
  // Date of last "all active languages read" celebration, to avoid re-firing
  fullSweepDate: string | null;
  recordSession: () => void;
  setSpeedSnapHighScore: (score: number) => void;
  recordRead: (langCode: string) => void;
  getReadingStreak: (langCode: string) => number;
  addReadingTime: (langCode: string, seconds: number) => void;
  getReadingTimeToday: (langCode: string) => number;
  // Returns true if a freeze was silently applied (streak preserved); false if streak broken
  checkAndConsumeFreeze: (langCode: string) => boolean;
  // Returns true if today is covered by a freeze (read yesterday via freeze, not yet read today)
  isFrozenToday: (langCode: string) => boolean;
  // Returns true if ALL given language codes have been read today (for full-sweep celebration)
  allReadToday: (langCodes: string[]) => boolean;
  // Mark the full-sweep celebration as shown for today
  recordFullSweep: () => void;
  // Returns true if full-sweep celebration already shown today
  fullSweepShownToday: () => boolean;
}

function todayString() {
  return new Date().toISOString().split('T')[0];
}

function yesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export const useStreakStore = create<StreakStore>()(
  persist(
    (set, get) => ({
      streak: 0,
      lastPracticedDate: null,
      totalSessionsCompleted: 0,
      speedSnapHighScore: 0,
      readingStreaks: {},
      lastReadDates: {},
      readingHistory: {},
      readingTimeSecs: {},
      freezeDatesUsed: {},
      fullSweepDate: null,

      recordSession: () => {
        const today = todayString();
        const { lastPracticedDate, streak } = get();

        if (lastPracticedDate === today) return;

        const newStreak =
          lastPracticedDate === yesterdayString() ? streak + 1 : 1;

        set({
          streak: newStreak,
          lastPracticedDate: today,
          totalSessionsCompleted: get().totalSessionsCompleted + 1,
        });
      },

      setSpeedSnapHighScore: (score) => set({ speedSnapHighScore: score }),

      recordRead: (langCode: string) => {
        const today = todayString();
        const { lastReadDates, readingStreaks, readingHistory } = get();
        const lastRead = lastReadDates[langCode];

        const currentStreak = readingStreaks[langCode] ?? 0;
        const newStreak = lastRead === today
          ? currentStreak
          : lastRead === yesterdayString() ? currentStreak + 1 : 1;

        // Append today to history (no duplicates)
        const existingHistory = readingHistory[langCode] ?? [];
        const newHistory = existingHistory.includes(today)
          ? existingHistory
          : [...existingHistory, today];

        if (lastRead === today) {
          // Only update history if today wasn't already recorded
          if (!existingHistory.includes(today)) {
            set({ readingHistory: { ...readingHistory, [langCode]: newHistory } });
          }
          return;
        }

        set({
          lastReadDates: { ...lastReadDates, [langCode]: today },
          readingStreaks: { ...readingStreaks, [langCode]: newStreak },
          readingHistory: { ...readingHistory, [langCode]: newHistory },
        });
      },

      getReadingStreak: (langCode: string) => {
        return get().readingStreaks[langCode] ?? 0;
      },

      addReadingTime: (langCode: string, seconds: number) => {
        if (seconds <= 0) return;
        const key = `${langCode}_${todayString()}`;
        const { readingTimeSecs } = get();
        // Prune keys older than 7 days to keep storage small
        const cutoff = (() => {
          const d = new Date(); d.setDate(d.getDate() - 7);
          return d.toISOString().split('T')[0];
        })();
        const pruned: Record<string, number> = {};
        for (const [k, v] of Object.entries(readingTimeSecs)) {
          const date = k.split('_').slice(1).join('_');
          if (date >= cutoff) pruned[k] = v;
        }
        set({ readingTimeSecs: { ...pruned, [key]: (pruned[key] ?? 0) + seconds } });
      },

      getReadingTimeToday: (langCode: string) => {
        const key = `${langCode}_${todayString()}`;
        return get().readingTimeSecs[key] ?? 0;
      },

      checkAndConsumeFreeze: (langCode: string) => {
        const today = todayString();
        const yesterday = yesterdayString();
        const { lastReadDates, readingStreaks, freezeDatesUsed } = get();
        const lastRead = lastReadDates[langCode];
        const currentStreak = readingStreaks[langCode] ?? 0;

        // Only apply freeze if: streak is active, yesterday was missed, today not yet read
        if (currentStreak === 0) return false;
        if (lastRead === today || lastRead === yesterday) return false;

        // Count freezes used in the rolling 7-day window
        const cutoff = (() => {
          const d = new Date(); d.setDate(d.getDate() - 7);
          return d.toISOString().split('T')[0];
        })();
        const used = (freezeDatesUsed[langCode] ?? []).filter(d => d >= cutoff);
        if (used.length >= 2) return false; // freeze exhausted

        // Consume freeze: set lastReadDate to yesterday so next read continues streak
        set({
          lastReadDates: { ...lastReadDates, [langCode]: yesterday },
          freezeDatesUsed: {
            ...freezeDatesUsed,
            [langCode]: [...used, yesterday],
          },
        });
        return true;
      },

      isFrozenToday: (langCode: string) => {
        const today = todayString();
        const yesterday = yesterdayString();
        const { lastReadDates, freezeDatesUsed } = get();
        // Frozen today = covered by a freeze yesterday AND haven't read today
        if (lastReadDates[langCode] === today) return false;
        return (freezeDatesUsed[langCode] ?? []).includes(yesterday);
      },

      allReadToday: (langCodes: string[]) => {
        const today = todayString();
        const { lastReadDates } = get();
        return langCodes.every(code => lastReadDates[code] === today);
      },

      recordFullSweep: () => {
        set({ fullSweepDate: todayString() });
      },

      fullSweepShownToday: () => {
        return get().fullSweepDate === todayString();
      },
    }),
    {
      name: 'bilinguist-streak',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

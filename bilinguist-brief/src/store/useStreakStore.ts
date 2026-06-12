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
  recordSession: () => void;
  setSpeedSnapHighScore: (score: number) => void;
  recordRead: (langCode: string) => void;
  getReadingStreak: (langCode: string) => number;
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
        const { lastReadDates, readingStreaks } = get();
        const lastRead = lastReadDates[langCode];

        if (lastRead === today) return;

        const currentStreak = readingStreaks[langCode] ?? 0;
        const newStreak = lastRead === yesterdayString() ? currentStreak + 1 : 1;

        set({
          lastReadDates: { ...lastReadDates, [langCode]: today },
          readingStreaks: { ...readingStreaks, [langCode]: newStreak },
        });
      },

      getReadingStreak: (langCode: string) => {
        return get().readingStreaks[langCode] ?? 0;
      },
    }),
    {
      name: 'bilinguist-streak',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

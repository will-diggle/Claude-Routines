import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StreakStore {
  streak: number;
  lastPracticedDate: string | null;
  totalSessionsCompleted: number;
  speedSnapHighScore: number;
  recordSession: () => void;
  setSpeedSnapHighScore: (score: number) => void;
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

      recordSession: () => {
        const today = todayString();
        const { lastPracticedDate, streak } = get();

        if (lastPracticedDate === today) return; // Already recorded today

        const newStreak =
          lastPracticedDate === yesterdayString() ? streak + 1 : 1;

        set({
          streak: newStreak,
          lastPracticedDate: today,
          totalSessionsCompleted: get().totalSessionsCompleted + 1,
        });
      },

      setSpeedSnapHighScore: (score) => set({ speedSnapHighScore: score }),
    }),
    {
      name: 'bilinguist-streak',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

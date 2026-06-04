import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task } from '../types';

export function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offsetDate(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateToString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getStreak(completions: string[]): number {
  if (completions.length === 0) return 0;
  const set = new Set(completions);
  const today = new Date();

  let cursor = new Date(today);
  // If today not done, start check from yesterday (streak still alive if yesterday done)
  if (!set.has(dateToString(cursor))) {
    cursor = offsetDate(cursor, -1);
    if (!set.has(dateToString(cursor))) return 0;
  }

  let count = 0;
  while (set.has(dateToString(cursor))) {
    count++;
    cursor = offsetDate(cursor, -1);
  }
  return count;
}

export function getDaysThisYear(completions: string[]): number {
  const year = new Date().getFullYear().toString();
  return completions.filter((d) => d.startsWith(year)).length;
}

export function isCompletedToday(completions: string[]): boolean {
  return completions.includes(getTodayString());
}

export function getLast30Days(completions: string[]): { date: string; done: boolean }[] {
  const set = new Set(completions);
  const result: { date: string; done: boolean }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = offsetDate(today, -i);
    const str = dateToString(d);
    result.push({ date: str, done: set.has(str) });
  }
  return result;
}

interface TaskStore {
  tasks: Task[];
  addTask: (name: string) => void;
  removeTask: (id: string) => void;
  toggleToday: (id: string) => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      tasks: [],
      addTask: (name: string) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id: Date.now().toString(),
              name: name.trim(),
              completions: [],
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      removeTask: (id: string) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
        })),
      toggleToday: (id: string) => {
        const today = getTodayString();
        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== id) return t;
            const done = t.completions.includes(today);
            return {
              ...t,
              completions: done
                ? t.completions.filter((d) => d !== today)
                : [...t.completions, today],
            };
          }),
        }));
      },
    }),
    {
      name: 'tally-tasks',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

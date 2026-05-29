import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LanguageCode } from './useSettingsStore';

export type Pile = 'new' | 'learning' | 'mastered' | 'revisit';

export interface SavedWord {
  id: string;
  word: string;
  language: LanguageCode;
  translation: string;
  explanation: string;
  exampleSentence: string;
  originalSentence: string;
  dateSaved: string;
  pile: Pile;
  correctStreak: number;
  lastPracticed: number | null;
}

interface WordBankStore {
  words: SavedWord[];
  saveWord: (word: Omit<SavedWord, 'id' | 'pile' | 'correctStreak' | 'lastPracticed' | 'dateSaved'>) => void;
  isWordSaved: (word: string, language: LanguageCode) => boolean;
  moveToPile: (id: string, pile: Pile) => void;
  recordPractice: (id: string, correct: boolean) => void;
  wordsByPile: (pile: Pile) => SavedWord[];
  counts: () => Record<Pile, number>;
}


export const useWordBankStore = create<WordBankStore>()(
  persist(
    (set, get) => ({
      words: [],

      saveWord: (incoming) => {
        const already = get().words.find(
          (w) => w.word.toLowerCase() === incoming.word.toLowerCase() && w.language === incoming.language
        );
        if (already) return;

        const newWord: SavedWord = {
          ...incoming,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          pile: 'new',
          correctStreak: 0,
          lastPracticed: null,
          dateSaved: new Date().toISOString().split('T')[0],
        };
        set({ words: [newWord, ...get().words] });
      },

      isWordSaved: (word, language) =>
        get().words.some(
          (w) => w.word.toLowerCase() === word.toLowerCase() && w.language === language
        ),

      moveToPile: (id, pile) =>
        set({ words: get().words.map((w) => (w.id === id ? { ...w, pile } : w)) }),

      recordPractice: (id, correct) => {
        set({
          words: get().words.map((w) => {
            if (w.id !== id) return w;
            const streak = correct ? w.correctStreak + 1 : 0;
            let pile: Pile = w.pile;
            if (correct) {
              if (streak >= 5) pile = 'mastered';
              else if (streak >= 2) pile = 'learning';
            } else {
              if (w.pile === 'mastered' || w.pile === 'learning') pile = 'learning';
            }
            return { ...w, correctStreak: streak, pile, lastPracticed: Date.now() };
          }),
        });
      },

      wordsByPile: (pile) => get().words.filter((w) => w.pile === pile),

      counts: () => {
        const words = get().words;
        return {
          new: words.filter((w) => w.pile === 'new').length,
          learning: words.filter((w) => w.pile === 'learning').length,
          mastered: words.filter((w) => w.pile === 'mastered').length,
          revisit: words.filter((w) => w.pile === 'revisit').length,
        };
      },
    }),
    {
      name: 'bilinguist-wordbank',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Remove any demo words that were seeded in earlier builds
        state.words = state.words.filter((w) => !w.id.startsWith('seed-'));
      },
    }
  )
);

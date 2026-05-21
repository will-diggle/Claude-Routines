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
  seeded: boolean;
  saveWord: (word: Omit<SavedWord, 'id' | 'pile' | 'correctStreak' | 'lastPracticed' | 'dateSaved'>) => void;
  isWordSaved: (word: string, language: LanguageCode) => boolean;
  moveToPile: (id: string, pile: Pile) => void;
  recordPractice: (id: string, correct: boolean) => void;
  wordsByPile: (pile: Pile) => SavedWord[];
  counts: () => Record<Pile, number>;
  seedSampleWords: () => void;
}

const SAMPLE_WORDS: Omit<SavedWord, 'id'>[] = [
  // French
  { word: 'bouleverser', language: 'fr', translation: 'to overturn; to deeply upset', explanation: 'Used to describe something that disrupts or profoundly moves someone emotionally.', exampleSentence: 'Les nouvelles l\'ont complètement bouleversé.', originalSentence: 'Le scandale a bouleversé le gouvernement.', dateSaved: '2026-05-18', pile: 'learning', correctStreak: 1, lastPracticed: Date.now() - 86400000 },
  { word: 'désormais', language: 'fr', translation: 'from now on; henceforth', explanation: 'Used to indicate a change beginning from the present moment onwards.', exampleSentence: 'Il sera désormais responsable de l\'équipe.', originalSentence: 'Le pays sera désormais dirigé par un nouveau gouvernement.', dateSaved: '2026-05-18', pile: 'new', correctStreak: 0, lastPracticed: null },
  { word: 'pourtant', language: 'fr', translation: 'yet; however; nevertheless', explanation: 'Expresses contrast or an unexpected consequence.', exampleSentence: 'Il est fatigué, pourtant il continue.', originalSentence: 'Pourtant, les experts restent optimistes.', dateSaved: '2026-05-19', pile: 'mastered', correctStreak: 5, lastPracticed: Date.now() - 172800000 },
  { word: 'malgré', language: 'fr', translation: 'despite; in spite of', explanation: 'A preposition used to introduce a contrasting or opposing circumstance.', exampleSentence: 'Il a continué malgré les obstacles.', originalSentence: 'Malgré les tensions, les négociations avancent.', dateSaved: '2026-05-20', pile: 'new', correctStreak: 0, lastPracticed: null },
  { word: 'quotidien', language: 'fr', translation: 'daily; everyday', explanation: 'Refers to something that happens or is encountered every day.', exampleSentence: 'La lecture est son activité quotidienne.', originalSentence: 'La vie quotidienne des citoyens a changé.', dateSaved: '2026-05-20', pile: 'learning', correctStreak: 2, lastPracticed: Date.now() - 43200000 },

  // German
  { word: 'überwältigen', language: 'de', translation: 'to overwhelm', explanation: 'To overpower someone emotionally or physically — often used in news contexts.', exampleSentence: 'Die Schönheit des Ortes hat ihn überwältigt.', originalSentence: 'Die Nachrichten haben die Bevölkerung überwältigt.', dateSaved: '2026-05-17', pile: 'learning', correctStreak: 1, lastPracticed: Date.now() - 86400000 },
  { word: 'inzwischen', language: 'de', translation: 'meanwhile; in the meantime', explanation: 'Refers to something happening in the interval between two points in time.', exampleSentence: 'Er hat inzwischen eine neue Stelle gefunden.', originalSentence: 'Inzwischen haben die Behörden reagiert.', dateSaved: '2026-05-17', pile: 'new', correctStreak: 0, lastPracticed: null },
  { word: 'Aufschwung', language: 'de', translation: 'upswing; upturn; boom', explanation: 'A period of economic or social improvement and growth.', exampleSentence: 'Die Wirtschaft erlebt einen starken Aufschwung.', originalSentence: 'Der wirtschaftliche Aufschwung setzt sich fort.', dateSaved: '2026-05-18', pile: 'new', correctStreak: 0, lastPracticed: null },
  { word: 'gleichwohl', language: 'de', translation: 'nevertheless; nonetheless', explanation: 'A formal conjunction meaning "despite everything" — common in written journalism.', exampleSentence: 'Die Lage ist schwierig, gleichwohl bleiben wir optimistisch.', originalSentence: 'Gleichwohl setzen die Verhandlungen fort.', dateSaved: '2026-05-19', pile: 'revisit', correctStreak: 0, lastPracticed: Date.now() - 259200000 },
  { word: 'besorgniserregend', language: 'de', translation: 'alarming; worrying', explanation: 'Describes something that causes concern or worry — a common word in news reporting.', exampleSentence: 'Die Zahlen sind besorgniserregend.', originalSentence: 'Die Entwicklung ist besorgniserregend, sagen Experten.', dateSaved: '2026-05-20', pile: 'new', correctStreak: 0, lastPracticed: null },

  // Spanish
  { word: 'sin embargo', language: 'es', translation: 'however; nevertheless', explanation: 'A conjunctive phrase used to introduce a contrasting or qualifying statement.', exampleSentence: 'Es difícil, sin embargo lo logró.', originalSentence: 'Sin embargo, los expertos mantienen la calma.', dateSaved: '2026-05-18', pile: 'mastered', correctStreak: 6, lastPracticed: Date.now() - 86400000 },
  { word: 'madrugada', language: 'es', translation: 'early morning; the small hours', explanation: 'Refers specifically to the hours between midnight and dawn — unique to Spanish.', exampleSentence: 'El incidente ocurrió en la madrugada.', originalSentence: 'Las negociaciones continuaron hasta la madrugada.', dateSaved: '2026-05-18', pile: 'learning', correctStreak: 2, lastPracticed: Date.now() - 43200000 },
  { word: 'cotidiano', language: 'es', translation: 'daily; everyday', explanation: 'Describes something that forms part of ordinary, everyday life.', exampleSentence: 'Es un problema cotidiano para muchos ciudadanos.', originalSentence: 'La vida cotidiana de la ciudad ha cambiado.', dateSaved: '2026-05-19', pile: 'new', correctStreak: 0, lastPracticed: null },
  { word: 'añoranza', language: 'es', translation: 'longing; nostalgia', explanation: 'A deep feeling of longing for something or somewhere from the past.', exampleSentence: 'Siente añoranza por su país natal.', originalSentence: 'La añoranza por tiempos mejores marca el discurso.', dateSaved: '2026-05-19', pile: 'new', correctStreak: 0, lastPracticed: null },
  { word: 'a pesar de', language: 'es', translation: 'despite; in spite of', explanation: 'A prepositional phrase expressing contrast — very common in journalistic writing.', exampleSentence: 'Continuaron a pesar de las dificultades.', originalSentence: 'A pesar de las tensiones, hubo acuerdo.', dateSaved: '2026-05-20', pile: 'learning', correctStreak: 1, lastPracticed: Date.now() - 86400000 },
];

export const useWordBankStore = create<WordBankStore>()(
  persist(
    (set, get) => ({
      words: [],
      seeded: false,

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

      seedSampleWords: () => {
        if (get().seeded) return;
        const existing = get().words;
        const toAdd: SavedWord[] = SAMPLE_WORDS
          .filter((s) => !existing.some((e) => e.word.toLowerCase() === s.word.toLowerCase() && e.language === s.language))
          .map((s, i) => ({ ...s, id: `seed-${i}-${s.language}-${s.word.replace(/\s/g, '')}` }));
        set({ words: [...existing, ...toAdd], seeded: true });
      },
    }),
    {
      name: 'bilinguist-wordbank',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

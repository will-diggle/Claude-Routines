import { create } from 'zustand';
import type { LanguageCode } from './useSettingsStore';

export type PrefetchStatus = 'idle' | 'loading' | 'done' | 'error';

interface LangPrefetchState {
  status: PrefetchStatus;
  total: number;
  found: number;
}

interface DictionaryPrefetchState {
  byLanguage: Record<string, LangPrefetchState>;
  setLoading: (lang: LanguageCode, total: number) => void;
  setDone: (lang: LanguageCode, found: number) => void;
  setError: (lang: LanguageCode) => void;
}

export const useDictionaryPrefetchStore = create<DictionaryPrefetchState>((set) => ({
  byLanguage: {},
  setLoading: (lang, total) => set((s) => ({
    byLanguage: { ...s.byLanguage, [lang]: { status: 'loading', total, found: s.byLanguage[lang]?.found ?? 0 } },
  })),
  setDone: (lang, found) => set((s) => ({
    byLanguage: { ...s.byLanguage, [lang]: { status: 'done', total: s.byLanguage[lang]?.total ?? found, found } },
  })),
  setError: (lang) => set((s) => ({
    byLanguage: { ...s.byLanguage, [lang]: { ...(s.byLanguage[lang] ?? { total: 0, found: 0 }), status: 'error' } },
  })),
}));

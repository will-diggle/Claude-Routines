import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import type { WordType, WordMeta } from './wordLookup';

const WORKER_URL = process.env.EXPO_PUBLIC_DATA_URL || 'https://bilinguist-brief.williamdiggz.workers.dev';

export interface WordEntry {
  word: string;
  language: string;
  lemma: string | null;
  translation: string | null;
  wordType: WordType | null;
  explanation: string | null;
  example: string | null;
  pronunciation: string | null;
  verbTable: Record<string, string> | null;
  verbTablePast: Record<string, string> | null;
  forms: Record<string, string> | null;
  tip: string | null;
  meta: WordMeta | null;
  level: string | null;
  fromCache: boolean;
}

export async function lookupWord(
  word: string,
  language: LanguageCode,
  level: LanguageLevel,
): Promise<WordEntry | null> {
  const url = `${WORKER_URL}/word?w=${encodeURIComponent(word)}&lang=${language}&level=${level}`;
  console.log('[wordService] fetching', url);
  try {
    const res = await fetch(url);
    console.log('[wordService] status', res.status);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[wordService] error body', body);
      return null;
    }
    const data = await res.json() as WordEntry;
    console.log('[wordService] translation', data.translation);
    return data;
  } catch (e) {
    console.error('[wordService] fetch failed', e);
    return null;
  }
}

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

// In-memory cache — keyed by word:language:level. Cleared when app restarts.
// Repeat taps on the same word are instant with zero network calls.
const lookupCache = new Map<string, WordEntry>();

export async function lookupWord(
  word: string,
  language: LanguageCode,
  level: LanguageLevel,
): Promise<WordEntry | null> {
  const cacheKey = `${word.toLowerCase()}:${language}:${level}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return cached;

  const url = `${WORKER_URL}/word?w=${encodeURIComponent(word)}&lang=${language}&level=${level}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const entry = await res.json() as WordEntry;
    lookupCache.set(cacheKey, entry);
    return entry;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

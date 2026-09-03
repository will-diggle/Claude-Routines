import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import type { WordType, WordMeta } from './wordLookup';

const WORKER_URL = process.env.EXPO_PUBLIC_DATA_URL || 'https://bilinguist-brief.williamdiggz.workers.dev';

export interface TenseTable {
  label: string;
  table: Record<string, string>;
}

export interface WordEntry {
  word: string;
  language: string;
  lemma: string | null;
  translation: string | null;
  wordType: WordType | null;
  explanation: string | null;
  example: string | null;
  /** Same sentence as `example`, with this entry's own words wrapped in **.
   *  Written by the model that composed the sentence, so it marks the inflected
   *  form actually used — which spelling alone can't recover ("gab" ← "geben"). */
  exampleMarked?: string | null;
  pronunciation: string | null;
  /** All tenses in display order. If present, overrides verbTable/verbTablePast. */
  tenses: TenseTable[] | null;
  /** Declension/inflection tables for nouns, adjectives, adverbs. */
  declensions: TenseTable[] | null;
  /** Present tense (backward compat — use tenses when available). */
  verbTable: Record<string, string> | null;
  /** Primary past tense (backward compat — use tenses when available). */
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
  options?: { forceRefresh?: boolean; sentence?: string },
): Promise<WordEntry | null> {
  // Include a short context fingerprint so the same word in different sentences
  // gets a separate in-memory cache entry (handles homographs like Bank=bench vs bank).
  const ctxKey = options?.sentence ? `:${options.sentence.slice(0, 60)}` : '';
  const cacheKey = `${word.toLowerCase()}:${language}:${level}${ctxKey}`;
  if (!options?.forceRefresh) {
    const cached = lookupCache.get(cacheKey);
    if (cached) return cached;
  }

  const url = `${WORKER_URL}/word?w=${encodeURIComponent(word)}&lang=${language}&level=${level}`
    + (options?.sentence ? `&ctx=${encodeURIComponent(options.sentence)}` : '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const entry = await res.json() as WordEntry;
    // Don't cache verbs that came back without full tenses — next lookup will backfill via worker
    const isIncompleteVerb = entry.wordType === 'verb' && (!entry.tenses || entry.tenses.length < 3);
    if (!isIncompleteVerb) lookupCache.set(cacheKey, entry);
    return entry;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

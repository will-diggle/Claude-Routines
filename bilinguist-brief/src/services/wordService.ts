import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import type { WordType, WordMeta } from './wordLookup';
import { getCachedWord } from './wordDictionaryCache';

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

/**
 * Maps a spaCy coarse POS tag (from the pipeline's tokenMap — see
 * TokenMapEntry.pos in services/anthropic.ts) to the word_type the
 * dictionary stores that sense under, for the cases where the mapping is
 * unambiguous. Deliberately conservative: only VERB/AUX, NOUN/PROPN, ADJ and
 * ADV are mapped. Everything else (PRON, DET, ADP, NUM, ...) returns null
 * rather than guessing — a real word like German "sein" has FOUR different
 * non-verb word_type labels in the dictionary (adjective/other/possessive
 * adjective/pronoun, an existing data-quality inconsistency, not something
 * this mapping should paper over by picking one). Returning null here just
 * falls back to "no preference", never worse than before this existed.
 */
export function posToWordType(pos: string | null | undefined): string | null {
  switch ((pos ?? '').toUpperCase()) {
    case 'VERB':
    case 'AUX':
      return 'verb';
    case 'NOUN':
    case 'PROPN':
      return 'noun';
    case 'ADJ':
      return 'adjective';
    case 'ADV':
      return 'adverb';
    default:
      return null;
  }
}

export async function lookupWord(
  word: string,
  language: LanguageCode,
  level: LanguageLevel,
  options?: { forceRefresh?: boolean; sentence?: string; expectedWordType?: string | null },
): Promise<WordEntry | null> {
  const t0 = Date.now();
  // Include a short context fingerprint so the same word in different sentences
  // gets a separate in-memory cache entry (handles homographs like Bank=bench vs bank).
  const ctxKey = options?.sentence ? `:${options.sentence.slice(0, 60)}` : '';
  const cacheKey = `${word.toLowerCase()}:${language}:${level}${ctxKey}`;
  if (!options?.forceRefresh) {
    const cached = lookupCache.get(cacheKey);
    if (cached) {
      console.log(`[lookupWord] "${word}" — in-memory hit, ${Date.now() - t0}ms`);
      return cached;
    }

    // On-device dictionary prefetched for today's brief — skip the network
    // entirely when it's already there. This is checked even when sentence
    // context is provided: showing the word's default/dictionary sense
    // instantly beats a live per-sentence lookup on every tap (that would
    // re-add exactly the Claude cost this cache exists to eliminate).
    // `expectedWordType` (from the tapped token's own POS tag) picks the
    // right sense among a real homograph's several cached senses — e.g.
    // German "sein" the verb vs. "sein" the possessive — without needing a
    // live per-sentence lookup to do it.
    const persisted = await getCachedWord(word, language, level, options?.expectedWordType);
    if (persisted) {
      lookupCache.set(cacheKey, persisted);
      console.log(`[lookupWord] "${word}" — SOURCE=on-device cache, total ${Date.now() - t0}ms, NO network call`);
      return persisted;
    }
  }

  console.log(`[lookupWord] "${word}" — SOURCE=network (${WORKER_URL}), forceRefresh=${!!options?.forceRefresh}`);
  const url = `${WORKER_URL}/word?w=${encodeURIComponent(word)}&lang=${language}&level=${level}`
    + (options?.sentence ? `&ctx=${encodeURIComponent(options.sentence)}` : '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const entry = await res.json() as WordEntry;
    console.log(`[lookupWord] "${word}" — network resolved, total ${Date.now() - t0}ms, fromCache(server)=${entry.fromCache}`);
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

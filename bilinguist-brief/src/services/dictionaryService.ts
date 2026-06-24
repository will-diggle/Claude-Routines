import { supabase } from './supabase';
import type { WordEntry } from './wordService';

// In-session cache — keyed by `${lang}:${lemma}`. Cleared on app restart.
const _cache = new Map<string, WordEntry | null>();

function mapRow(row: Record<string, unknown>): WordEntry {
  return {
    word:          row.lemma as string,
    language:      row.language as string,
    lemma:         row.lemma as string | null,
    translation:   row.translation as string | null,
    wordType:      (row.word_type as any) ?? null,
    explanation:   row.explanation as string | null,
    example:       row.example as string | null,
    pronunciation: row.pronunciation as string | null,
    verbTable:     (row.verb_table as Record<string, string>) ?? null,
    verbTablePast: (row.verb_table_past as Record<string, string>) ?? null,
    forms:         (row.forms as Record<string, string>) ?? null,
    tip:           row.tip as string | null,
    meta:          (row.meta as any) ?? null,
    level:         (row.cefr_level as string) ?? null,
    fromCache:     true,
  };
}

/**
 * Look up a lemma in the Supabase word_dictionary.
 * Returns null if not found, Supabase unavailable, or the entry is incomplete.
 * Caches results for the session lifetime.
 */
export async function lookupDictionary(
  lemma: string,
  language: string,
): Promise<WordEntry | null> {
  if (!supabase || !lemma) return null;
  const key = `${language}:${lemma.toLowerCase()}`;
  if (_cache.has(key)) return _cache.get(key)!;

  try {
    const { data, error } = await supabase
      .from('word_dictionary')
      .select('*')
      .eq('language', language)
      .eq('lemma', lemma.toLowerCase())
      .single();

    if (error || !data) {
      _cache.set(key, null);
      return null;
    }

    if (!data.is_complete) {
      // Entry exists but is flagged incomplete — behave as a miss so the
      // live Haiku fallback fires and we get a fresh, complete card.
      _cache.set(key, null);
      return null;
    }

    const entry = mapRow(data);
    _cache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Write a freshly-generated dictionary card back to Supabase (source='fallback').
 * Called asynchronously after a live Haiku lookup — never blocks the UI.
 */
export async function writeBackDictionary(
  lemma: string,
  language: string,
  entry: WordEntry,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('word_dictionary').upsert(
      {
        language,
        lemma:           lemma.toLowerCase(),
        translation:     entry.translation ?? '',
        word_type:       entry.wordType,
        explanation:     entry.explanation,
        example:         entry.example,
        pronunciation:   entry.pronunciation,
        verb_table:      entry.verbTable,
        verb_table_past: entry.verbTablePast,
        forms:           entry.forms,
        tip:             entry.tip,
        meta:            entry.meta,
        cefr_level:      entry.level,
        source:          'fallback',
        is_complete:     true,
      },
      { onConflict: 'language,lemma' },
    );
    // Warm the cache with the fresh data
    const key = `${language}:${lemma.toLowerCase()}`;
    _cache.set(key, { ...entry, lemma: lemma.toLowerCase(), fromCache: true });
  } catch {
    // Write-back is best-effort — never throw
  }
}

import type { LanguageCode } from '../store/useSettingsStore';

const WORKER_URL = process.env.EXPO_PUBLIC_DATA_URL || 'https://bilinguist-brief.williamdiggz.workers.dev';

/**
 * Second-pass check on already-generated conjugation tables, run server-side
 * by the Worker (which holds the Anthropic key) — the client used to call
 * Anthropic directly with a key shipped in the app bundle. Returns corrected
 * tenses, or null on failure. Called asynchronously after the initial lookup
 * so it never blocks display.
 */
export async function verifyTenses(
  tenses: Array<{ label: string; table: Record<string, string> }>,
  lemma: string,
  language: LanguageCode,
): Promise<Array<{ label: string; table: Record<string, string> }> | null> {
  if (!tenses.length || !lemma) return null;

  try {
    const res = await fetch(`${WORKER_URL}/word/verify-tenses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenses, lemma, language }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { tenses: Array<{ label: string; table: Record<string, string> }> | null };
    return data.tenses;
  } catch {
    return null;
  }
}

export type WordType = 'verb' | 'noun' | 'adjective' | 'adverb' | 'phrase' | 'other';

export interface WordMeta {
  isRegular?: boolean | null;
  auxiliary?: string | null;
  verbClass?: string | null;
  isSeparable?: boolean | null;
}


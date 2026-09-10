import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore, type LanguageCode, type LanguageLevel } from '../store/useSettingsStore';
import type { WordEntry, TenseTable } from './wordService';
import type { WordType, WordMeta } from './wordLookup';
import { useDictionaryPrefetchStore } from '../store/useDictionaryPrefetchStore';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

interface SupabaseWordFormRow {
  word: string;
  language: string;
  lemma: string | null;
  word_type: string | null;
  translation: string | null;
  explanation: string | null;
  example: string | null;
  pronunciation: string | null;
  forms: Record<string, string> | null;
  tip: string | null;
  meta: Record<string, unknown> | null;
  level: string | null;
}

/** word_forms stores tenses/declensions/exampleMarked packed inside `meta`
 * (mirroring the D1 `words.meta` column) — unpack them the same way the
 * Worker's rowToWordData() does server-side. jsonb columns already arrive
 * as parsed objects via PostgREST, no JSON.parse needed. */
function wordEntryFromSupabaseFormRow(row: SupabaseWordFormRow): WordEntry {
  const meta = row.meta ?? null;
  const tenses = Array.isArray(meta?.tenses) ? meta!.tenses as TenseTable[] : null;
  const declensions = Array.isArray(meta?.declensions) ? meta!.declensions as TenseTable[] : null;
  const exampleMarked = typeof meta?.exampleMarked === 'string' ? meta!.exampleMarked as string : null;

  let metaForClient: WordMeta | null = null;
  if (meta) {
    const copy = { ...meta };
    delete copy.tenses;
    delete copy.declensions;
    delete copy.exampleMarked;
    metaForClient = Object.keys(copy).length > 0 ? (copy as WordMeta) : null;
  }

  return {
    word: row.word,
    language: row.language,
    lemma: row.lemma,
    translation: row.translation,
    wordType: row.word_type as WordType | null,
    explanation: row.explanation,
    example: row.example,
    exampleMarked,
    pronunciation: row.pronunciation,
    tenses,
    declensions,
    verbTable: null,
    verbTablePast: null,
    forms: row.forms,
    tip: row.tip,
    meta: metaForClient,
    level: row.level,
    fromCache: true,
  };
}

/** Chunked so the URL stays a sane length — PostgREST's `in.()` filter takes
 * the full list in the query string, and a brief can have 1000+ words. */
const SUPABASE_QUERY_CHUNK = 150;

async function fetchWordFormsFromSupabase(lang: LanguageCode, words: string[]): Promise<WordEntry[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || words.length === 0) return [];
  const results: WordEntry[] = [];

  for (let i = 0; i < words.length; i += SUPABASE_QUERY_CHUNK) {
    const chunk = words.slice(i, i + SUPABASE_QUERY_CHUNK);
    const inList = chunk.join(',');
    const url = `${SUPABASE_URL}/rest/v1/word_forms`
      + `?language=eq.${encodeURIComponent(lang)}&word=in.(${encodeURIComponent(inList)})`
      + `&select=word,language,lemma,word_type,translation,explanation,example,pronunciation,forms,tip,meta,level`;
    try {
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!res.ok) continue; // best-effort per chunk — a failed chunk just means fewer words cached this run
      const rows = await res.json() as SupabaseWordFormRow[];
      results.push(...rows.map(wordEntryFromSupabaseFormRow));
    } catch {
      // best-effort per chunk
    }
  }
  return results;
}

// Capped, LRU-ish per (language, level) so on-device storage can't grow
// unbounded across months of daily briefs.
const MAX_ENTRIES_PER_DICT = 1500;
const WORD_RE = /[^\W\d_]+(?:'[^\W\d_]+)?/gu;

interface StoredDict {
  order: string[]; // insertion order — oldest evicted first
  lastPrefetchDate?: string; // YYYY-MM-DD — used by the "only keep recent words" setting
  entries: Record<string, WordEntry>;
}

const memoryCache = new Map<string, StoredDict>();

function storageKey(lang: LanguageCode, level: LanguageLevel): string {
  return `wordcache:${lang}:${level}`;
}

async function loadDict(lang: LanguageCode, level: LanguageLevel): Promise<StoredDict> {
  const key = storageKey(lang, level);
  const cached = memoryCache.get(key);
  if (cached) return cached;

  let dict: StoredDict = { order: [], entries: {} };
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) dict = JSON.parse(raw);
  } catch {
    // Corrupt or unavailable storage — start fresh rather than fail lookups
  }
  memoryCache.set(key, dict);
  return dict;
}

async function saveDict(lang: LanguageCode, level: LanguageLevel, dict: StoredDict): Promise<void> {
  memoryCache.set(storageKey(lang, level), dict);
  try {
    await AsyncStorage.setItem(storageKey(lang, level), JSON.stringify(dict));
  } catch {
    // Best-effort persistence — a full/unavailable AsyncStorage shouldn't break lookups
  }
}

export async function getCachedWord(word: string, lang: LanguageCode, level: LanguageLevel): Promise<WordEntry | null> {
  const t0 = Date.now();
  const wasWarm = memoryCache.has(storageKey(lang, level));
  const dict = await loadDict(lang, level);
  const hit = dict.entries[word.toLowerCase()] ?? null;
  console.log(`[wordcache] ${hit ? 'HIT' : 'MISS'} "${word}" (${lang}:${level}) — ${Date.now() - t0}ms, memCache=${wasWarm ? 'warm' : 'cold'}, dictSize=${dict.order.length}`);
  return hit;
}

function tokenise(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0].toLowerCase();
    if (w.length >= 2) tokens.add(w);
  }
  return tokens;
}

/**
 * Fire-and-forget: pulls every word across the given articles into the
 * on-device dictionary cache in one shot, so tapping any of them is instant
 * and works offline. Call this AFTER brief text is already on screen — it
 * must never block rendering. Queries Supabase's word_forms table directly
 * (public read policy, no server in the middle) — never triggers a live
 * Claude call.
 */
export async function prefetchDictionaryForArticles(
  lang: LanguageCode,
  level: LanguageLevel,
  articles: { headline: string; body: string }[],
): Promise<void> {
  // "Fetch live only" mode — the user turned auto-download off. Every tap
  // still works, just goes through the live per-word path instead.
  const settings = useSettingsStore.getState();
  if (!settings.autoDownloadWords) return;

  const dict = await loadDict(lang, level);
  const today = new Date().toISOString().slice(0, 10);
  if (settings.deleteOldDownloadedWords && dict.lastPrefetchDate && dict.lastPrefetchDate !== today) {
    dict.order = [];
    dict.entries = {};
  }
  dict.lastPrefetchDate = today;

  const allWords = new Set<string>();
  for (const a of articles) {
    for (const w of tokenise(`${a.headline} ${a.body}`)) allWords.add(w);
  }
  const missing = Array.from(allWords).filter((w) => !dict.entries[w]);
  const total = allWords.size;
  const store = useDictionaryPrefetchStore.getState();

  if (missing.length === 0) {
    await saveDict(lang, level, dict); // persist lastPrefetchDate even when nothing new to fetch
    store.setDone(lang, total);
    return;
  }
  store.setLoading(lang, total);

  try {
    const entries = await fetchWordFormsFromSupabase(lang, missing);
    for (const entry of entries) {
      const key = entry.word.toLowerCase();
      if (!(key in dict.entries)) dict.order.push(key);
      dict.entries[key] = entry;
    }
    while (dict.order.length > MAX_ENTRIES_PER_DICT) {
      const oldest = dict.order.shift();
      if (oldest) delete dict.entries[oldest];
    }
    await saveDict(lang, level, dict);
    // "found" = words already cached before this run + newly fetched this run —
    // may be less than `total` when some words (proper nouns, gaps) aren't in
    // the dictionary at all. That's honest signal, not a bug to hide.
    store.setDone(lang, total - missing.length + entries.length);
  } catch {
    store.setError(lang);
    // Background prefetch only — silent failure, per-tap lookupWord() still works
  }
}

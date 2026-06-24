import { supabase } from './supabase';
import type { WordEntry } from './wordService';

// In-session cache — keyed by `${lang}:${lemma}`. Cleared on app restart.
const _cache = new Map<string, WordEntry | null>();

// ── Schema mapping ────────────────────────────────────────────────────────────
//
// The Supabase word_dictionary table uses a flat column schema (not JSON blobs):
//   - pronunciation is stored as `ipa`
//   - CEFR level is stored as `level` (not cefr_level)
//   - German conjugations are in flat columns: present_ich/du/er/wir/ihr/sie,
//     simple_past_ich/du/er/wir/ihr/sie
//   - Noun forms are in flat columns: gender, article_definite, article_indefinite,
//     plural, genitive_singular
//   - Verb grammar metadata is in flat columns: is_regular, auxiliary, is_separable,
//     is_reflexive, verb_class
//   - There is no is_complete flag; any entry with a translation is usable.

function _buildVerbTable(row: Record<string, unknown>, lang: string): Record<string, string> | null {
  if (lang === 'de') {
    const present = {
      ich:       row.present_ich as string | null,
      du:        row.present_du  as string | null,
      'er/sie/es': row.present_er as string | null,
      wir:       row.present_wir as string | null,
      ihr:       row.present_ihr as string | null,
      'sie/Sie': row.present_sie as string | null,
    };
    const entries = Object.entries(present).filter(([, v]) => v != null) as [string, string][];
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }
  return null;
}

function _buildVerbTablePast(row: Record<string, unknown>, lang: string): Record<string, string> | null {
  if (lang === 'de') {
    const past = {
      ich:       row.simple_past_ich as string | null,
      du:        row.simple_past_du  as string | null,
      'er/sie/es': row.simple_past_er as string | null,
      wir:       row.simple_past_wir as string | null,
      ihr:       row.simple_past_ihr as string | null,
      'sie/Sie': row.simple_past_sie as string | null,
    };
    const entries = Object.entries(past).filter(([, v]) => v != null) as [string, string][];
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }
  return null;
}

function _buildForms(row: Record<string, unknown>): Record<string, string> | null {
  const f: Record<string, string> = {};
  if (row.gender)             f.gender   = row.gender as string;
  if (row.article_definite)   f.article  = row.article_definite as string;
  if (row.article_indefinite) f.indef    = row.article_indefinite as string;
  if (row.plural)             f.plural   = row.plural as string;
  if (row.genitive_singular)  f.genitive = row.genitive_singular as string;
  if (row.feminine)           f.feminine     = row.feminine as string;
  if (row.comparative)        f.comparative  = row.comparative as string;
  if (row.superlative)        f.superlative  = row.superlative as string;
  return Object.keys(f).length > 0 ? f : null;
}

function _buildMeta(row: Record<string, unknown>): Record<string, unknown> | null {
  const isRegularRaw = row.is_regular as string | null;
  const isSeparable  = row.is_separable as boolean | null;
  const isReflexive  = row.is_reflexive as boolean | null;
  const auxiliary    = row.auxiliary    as string | null;
  const verbClass    = row.verb_class   as string | null;

  const m: Record<string, unknown> = {};
  if (isRegularRaw != null) m.isRegular = isRegularRaw === 'regular';
  if (auxiliary    != null) m.auxiliary = auxiliary;
  if (isSeparable  != null) m.isSeparable = isSeparable;
  if (isReflexive  != null) m.isReflexive = isReflexive;
  if (verbClass    != null) m.verbClass  = verbClass;
  return Object.keys(m).length > 0 ? m : null;
}

function mapRow(row: Record<string, unknown>): WordEntry {
  const lang = row.language as string;
  return {
    word:          row.lemma as string,
    language:      lang,
    lemma:         row.lemma as string | null,
    translation:   row.translation as string | null,
    wordType:      (row.word_type as any) ?? null,
    explanation:   row.explanation as string | null,
    example:       row.example as string | null,
    pronunciation: (row.ipa as string | null) ?? null,
    verbTable:     _buildVerbTable(row, lang),
    verbTablePast: _buildVerbTablePast(row, lang),
    forms:         _buildForms(row),
    tip:           row.tip as string | null,
    meta:          _buildMeta(row) as any,
    level:         (row.level as string) ?? null,
    fromCache:     true,
  };
}

/**
 * Look up a lemma in the Supabase word_dictionary.
 * Returns null if not found, Supabase unavailable, or the entry has no translation.
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

    if (error || !data || !data.translation) {
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

// Separable-verb info cache — keyed by `${lang}:${lemma}`.
const _sepCache = new Map<string, { isSeparable: boolean; separablePrefix: string | null } | null>();

/**
 * Lightweight lookup of separable-verb metadata only.
 * Queries is_separable + separable_prefix without fetching the full entry.
 * Returns null if the lemma is not in the dictionary or not a separable verb.
 */
export async function lookupSeparableInfo(
  lemma: string,
  language: string,
): Promise<{ isSeparable: boolean; separablePrefix: string | null } | null> {
  if (!supabase || !lemma) return null;
  const key = `${language}:${lemma.toLowerCase()}`;
  if (_sepCache.has(key)) return _sepCache.get(key)!;

  try {
    const { data, error } = await supabase
      .from('word_dictionary')
      .select('is_separable, separable_prefix')
      .eq('language', language)
      .eq('lemma', lemma.toLowerCase())
      .single();

    if (error || !data || !data.is_separable) {
      _sepCache.set(key, null);
      return null;
    }

    const result = {
      isSeparable: true,
      separablePrefix: (data.separable_prefix as string | null) ?? null,
    };
    _sepCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Write a freshly-generated dictionary card back to Supabase (source='fallback').
 * Called asynchronously after a live Haiku lookup — never blocks the UI.
 * Writes using the actual flat column schema.
 */
export async function writeBackDictionary(
  lemma: string,
  language: string,
  entry: WordEntry,
): Promise<void> {
  if (!supabase) return;
  try {
    const row: Record<string, unknown> = {
      language,
      lemma:       lemma.toLowerCase(),
      translation: entry.translation ?? '',
      word_type:   entry.wordType,
      explanation: entry.explanation,
      example:     entry.example,
      ipa:         entry.pronunciation,
      tip:         entry.tip,
      level:       entry.level,
      source:      'fallback',
    };

    // Unpack meta fields into flat columns
    const m = entry.meta as any;
    if (m) {
      if (m.isRegular   != null) row.is_regular  = m.isRegular ? 'regular' : 'irregular';
      if (m.auxiliary   != null) row.auxiliary   = m.auxiliary;
      if (m.isSeparable != null) row.is_separable = m.isSeparable;
      if (m.verbClass   != null) row.verb_class  = m.verbClass;
    }

    // Unpack verbTable into flat German conjugation columns
    const vt = entry.verbTable;
    if (vt && language === 'de') {
      row.present_ich = vt['ich']         ?? null;
      row.present_du  = vt['du']          ?? null;
      row.present_er  = vt['er/sie/es']   ?? null;
      row.present_wir = vt['wir']         ?? null;
      row.present_ihr = vt['ihr']         ?? null;
      row.present_sie = vt['sie/Sie']     ?? null;
    }
    const vtp = entry.verbTablePast;
    if (vtp && language === 'de') {
      row.simple_past_ich = vtp['ich']       ?? null;
      row.simple_past_du  = vtp['du']        ?? null;
      row.simple_past_er  = vtp['er/sie/es'] ?? null;
      row.simple_past_wir = vtp['wir']       ?? null;
      row.simple_past_ihr = vtp['ihr']       ?? null;
      row.simple_past_sie = vtp['sie/Sie']   ?? null;
    }

    // Unpack forms into flat noun/adjective columns
    const f = entry.forms;
    if (f) {
      if (f.gender)      row.gender             = f.gender;
      if (f.article)     row.article_definite   = f.article;
      if (f.indef)       row.article_indefinite = f.indef;
      if (f.plural)      row.plural             = f.plural;
      if (f.genitive)    row.genitive_singular  = f.genitive;
      if (f.feminine)    row.feminine           = f.feminine;
      if (f.comparative) row.comparative        = f.comparative;
      if (f.superlative) row.superlative        = f.superlative;
    }

    await supabase
      .from('word_dictionary')
      .upsert(row, { onConflict: 'language,lemma' });

    // Warm the cache with the fresh data
    _cache.set(`${language}:${lemma.toLowerCase()}`, {
      ...entry, lemma: lemma.toLowerCase(), fromCache: true,
    });
  } catch {
    // Write-back is best-effort — never throw
  }
}

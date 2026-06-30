import { supabase } from './supabase';
import type { WordEntry, TenseTable } from './wordService';
import type { WordMeta } from './wordLookup';

// In-session cache — keyed by `${lang}:${lemma}:${word_type}`. Cleared on app restart.
const _cache = new Map<string, WordEntry | null>();

// ── JSONB data → WordEntry mappers ────────────────────────────────────────────

function _buildTenses(data: Record<string, unknown>): TenseTable[] | null {
  const raw = data.tenses as Record<string, Record<string, string>> | null | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const list: TenseTable[] = [];
  for (const [label, table] of Object.entries(raw)) {
    if (table && typeof table === 'object' && Object.keys(table).length > 0) {
      list.push({ label, table });
    }
  }
  return list.length > 0 ? list : null;
}

function _buildForms(data: Record<string, unknown>, wordType: string): Record<string, string> | null {
  const f: Record<string, string> = {};

  if (wordType === 'noun') {
    if (data.gender)             f.gender  = data.gender as string;
    if (data.article_definite)   f.article = data.article_definite as string;
    if (data.article_indefinite) f.indef   = data.article_indefinite as string;

    // German: cases object
    const cases = data.cases as Record<string, string> | null;
    if (cases) {
      if (cases.nominative_plural)  f.plural   = cases.nominative_plural;
      if (cases.genitive_singular)  f.genitive = cases.genitive_singular;
      if (cases.dative_singular)    f.dative   = cases.dative_singular;
      if (cases.accusative_singular) f.accusative = cases.accusative_singular;
    }

    // French / Italian / Spanish: flat singular/plural
    if (data.singular) f.singular = data.singular as string;
    if (data.plural)   f.plural   = data.plural as string;
    if (data.article_partitive) f['du/de la'] = data.article_partitive as string;

    // Swedish
    if (data.definite_singular) f['def.sg'] = data.definite_singular as string;
    if (data.indefinite_plural) f.plural    = data.indefinite_plural as string;
    if (data.definite_plural)   f['def.pl'] = data.definite_plural as string;

    // Turkish: top-level cases
    const tcases = data.cases as Record<string, string> | null;
    if (tcases && !cases) Object.assign(f, tcases);
  }

  if (wordType === 'adjective') {
    if (data.comparative)             f.comparative  = data.comparative as string;
    if (data.superlative)             f.superlative  = data.superlative as string;
    if (data.superlative_definite)    f.superlative  = data.superlative_definite as string;
    if (data.feminine_singular)       f.feminine     = data.feminine_singular as string;
    if (data.masculine_singular)      f.masc         = data.masculine_singular as string;
    if (data.masculine_plural)        f['masc.pl']   = data.masculine_plural as string;
    if (data.feminine_plural)         f['fem.pl']    = data.feminine_plural as string;
    if (data.common_singular)         f.common       = data.common_singular as string;
    if (data.neuter_singular)         f.neuter       = data.neuter_singular as string;
    if (data.plural_definite)         f['pl.def']    = data.plural_definite as string;
    if (data.adverbial_form)          f.adverb       = data.adverbial_form as string;
  }

  return Object.keys(f).length > 0 ? f : null;
}

function _buildMeta(data: Record<string, unknown>, wordType: string): WordMeta | null {
  if (wordType !== 'verb') return null;
  const m: Record<string, unknown> = {};
  if (data.is_regular   != null) m.isRegular       = data.is_regular;
  if (data.auxiliary    != null) m.auxiliary        = data.auxiliary;
  if (data.is_separable != null) m.isSeparable      = data.is_separable;
  if (data.separable_prefix != null) m.separablePrefix = data.separable_prefix;
  if (data.is_reflexive != null) m.isReflexive      = data.is_reflexive;
  if (data.verb_class   != null) m.verbClass        = data.verb_class;
  if (data.verb_group   != null) m.verbClass        = data.verb_group;   // Swedish
  if (data.verb_root    != null) m.verbRoot         = data.verb_root;    // Turkish
  if (data.vowel_harmony != null) m.vowelHarmony    = data.vowel_harmony; // Turkish
  if (data.past_participle != null) m.pastParticiple = data.past_participle;
  if (data.zu_infinitive   != null) m.zuInfinitive   = data.zu_infinitive; // German
  return Object.keys(m).length > 0 ? (m as WordMeta) : null;
}

function mapRow(row: Record<string, unknown>): WordEntry {
  const lang     = row.language as string;
  const wordType = (row.word_type as string) ?? 'other';
  const data     = (row.data as Record<string, unknown> | null) ?? {};

  const tenses       = _buildTenses(data);
  const verbTable    = tenses?.[0]?.table ?? null;
  const verbTablePast = tenses?.[1]?.table ?? null;

  return {
    word:          row.word as string,
    language:      lang,
    lemma:         row.lemma as string | null,
    translation:   row.translation as string | null,
    wordType:      wordType as any,
    explanation:   row.explanation as string | null,
    example:       row.example_sentence as string | null,
    pronunciation: (row.ipa as string | null) ?? null,
    tenses,
    verbTable,
    verbTablePast,
    forms:         _buildForms(data, wordType),
    tip:           row.tip as string | null,
    meta:          _buildMeta(data, wordType),
    level:         (row.level as string) ?? null,
    fromCache:     true,
  };
}

/**
 * Look up a lemma in the Supabase word_dictionary.
 * Returns null if not found, Supabase unavailable, or the entry has no translation.
 */
export async function lookupDictionary(
  lemma: string,
  language: string,
): Promise<WordEntry | null> {
  if (!supabase || !lemma) return null;
  const key = `${language}:${lemma.toLowerCase()}`;
  if (_cache.has(key)) return _cache.get(key)!;

  try {
    // Try to find by lemma first (most common path)
    const { data, error } = await supabase
      .from('word_dictionary')
      .select('*')
      .eq('language', language)
      .eq('lemma', lemma.toLowerCase())
      .order('frequency_rank', { ascending: true, nullsFirst: false })
      .limit(1)
      .single();

    if (error || !data || !data.translation) {
      // Fall back to surface-form lookup
      const { data: wordData, error: wordError } = await supabase
        .from('word_dictionary')
        .select('*')
        .eq('language', language)
        .eq('word', lemma.toLowerCase())
        .order('frequency_rank', { ascending: true, nullsFirst: false })
        .limit(1)
        .single();

      if (wordError || !wordData || !wordData.translation) {
        _cache.set(key, null);
        return null;
      }

      const entry = mapRow(wordData);
      _cache.set(key, entry);
      return entry;
    }

    const entry = mapRow(data);
    _cache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

// Separable-verb info cache
const _sepCache = new Map<string, { isSeparable: boolean; separablePrefix: string | null } | null>();

/**
 * Lightweight lookup of separable-verb metadata.
 * Reads data->is_separable and data->separable_prefix from the JSONB column.
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
      .select('data')
      .eq('language', language)
      .eq('lemma', lemma.toLowerCase())
      .eq('word_type', 'verb')
      .single();

    if (error || !data) {
      _sepCache.set(key, null);
      return null;
    }

    const d = (data.data as Record<string, unknown> | null) ?? {};
    if (!d.is_separable) {
      _sepCache.set(key, null);
      return null;
    }

    const result = {
      isSeparable: true,
      separablePrefix: (d.separable_prefix as string | null) ?? null,
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
 */
export async function writeBackDictionary(
  lemma: string,
  language: string,
  entry: WordEntry,
): Promise<void> {
  if (!supabase) return;
  try {
    const wordType = entry.wordType ?? 'other';

    // Build JSONB data blob from the WordEntry
    const data: Record<string, unknown> = {};

    // Verb metadata
    const m = entry.meta as any;
    if (m) {
      if (m.isRegular      != null) data.is_regular       = m.isRegular;
      if (m.auxiliary      != null) data.auxiliary        = m.auxiliary;
      if (m.isSeparable    != null) data.is_separable     = m.isSeparable;
      if (m.separablePrefix != null) data.separable_prefix = m.separablePrefix;
      if (m.isReflexive    != null) data.is_reflexive     = m.isReflexive;
      if (m.verbClass      != null) data.verb_class       = m.verbClass;
      if (m.pastParticiple != null) data.past_participle  = m.pastParticiple;
      if (m.zuInfinitive   != null) data.zu_infinitive    = m.zuInfinitive;
    }

    // Tenses from entry.tenses (preferred) or build from verbTable/verbTablePast
    if (entry.tenses && entry.tenses.length > 0) {
      const tenseObj: Record<string, Record<string, string>> = {};
      for (const t of entry.tenses) {
        tenseObj[t.label] = t.table;
      }
      data.tenses = tenseObj;
    } else {
      const tenseObj: Record<string, Record<string, string>> = {};
      if (entry.verbTable)    tenseObj['PRESENT'] = entry.verbTable;
      if (entry.verbTablePast) tenseObj['PAST']   = entry.verbTablePast;
      if (Object.keys(tenseObj).length > 0) data.tenses = tenseObj;
    }

    // Forms (noun/adjective)
    const f = entry.forms;
    if (f) {
      if (f.gender)      data.gender             = f.gender;
      if (f.article)     data.article_definite   = f.article;
      if (f.indef)       data.article_indefinite = f.indef;
      if (f.singular)    data.singular            = f.singular;
      if (f.plural)      data.plural              = f.plural;
      if (f.genitive)    { data.cases = { ...(data.cases as object ?? {}), genitive_singular: f.genitive }; }
      if (f.feminine)    data.feminine_singular   = f.feminine;
      if (f.comparative) data.comparative         = f.comparative;
      if (f.superlative) data.superlative         = f.superlative;
    }

    const row: Record<string, unknown> = {
      language,
      word:                lemma.toLowerCase(),
      lemma:               lemma.toLowerCase(),
      word_type:           wordType,
      translation:         entry.translation ?? '',
      explanation:         entry.explanation,
      example_sentence:    entry.example,
      ipa:                 entry.pronunciation,
      tip:                 entry.tip,
      level:               entry.level,
      source:              'fallback',
      data:                Object.keys(data).length > 0 ? data : null,
    };

    await supabase
      .from('word_dictionary')
      .upsert(row, { onConflict: 'language,lemma,word_type' });

    _cache.set(`${language}:${lemma.toLowerCase()}`, {
      ...entry, lemma: lemma.toLowerCase(), fromCache: true,
    });
  } catch {
    // Best-effort — never throw
  }
}

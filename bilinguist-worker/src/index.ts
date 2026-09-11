/**
 * Bilinguist Brief — Cloudflare Worker
 *
 * Routes:
 *   GET  /latest                        → latest.json briefing bundle
 *   GET  /latest/meta                   → { date, generatedAt } only (~50 bytes)
 *   GET  /briefings/YYYY-MM-DD          → archived briefing bundle
 *   GET  /word?w={word}&lang={lang}     → word lookup (D1 cache → Claude + translate)
 *   POST /word                          → admin: bulk-insert a word (requires X-Admin-Key)
 *   GET  /word/stats                    → per-language word counts
 */

// ── Language data ─────────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese (Brazilian)', it: 'Italian', sv: 'Swedish', tr: 'Turkish',
};

const VERB_TENSES: Record<string, Array<{ label: string; pronouns: string[] }>> = {
  de: [
    { label: 'PRÄSENS',       pronouns: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'] },
    { label: 'IMPERATIV',     pronouns: ['du', 'ihr', 'Sie'] },
    { label: 'PERFEKT',       pronouns: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'] },
    { label: 'PRÄTERITUM',    pronouns: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'] },
    { label: 'KONJUNKTIV II', pronouns: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'] },
  ],
  fr: [
    { label: 'PRÉSENT',       pronouns: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'] },
    { label: 'PASSÉ COMPOSÉ', pronouns: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'] },
    { label: 'IMPARFAIT',     pronouns: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'] },
    { label: 'FUTUR SIMPLE',  pronouns: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'] },
    { label: 'CONDITIONNEL',  pronouns: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'] },
    { label: 'SUBJONCTIF',    pronouns: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'] },
  ],
  es: [
    { label: 'PRESENTE',             pronouns: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'] },
    { label: 'PRETÉRITO INDEFINIDO', pronouns: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'] },
    { label: 'IMPERFECTO',           pronouns: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'] },
    { label: 'FUTURO',               pronouns: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'] },
    { label: 'CONDICIONAL',          pronouns: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'] },
    { label: 'SUBJUNTIVO',           pronouns: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'] },
  ],
  it: [
    { label: 'PRESENTE',         pronouns: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'] },
    { label: 'PASSATO PROSSIMO', pronouns: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'] },
    { label: 'IMPERFETTO',       pronouns: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'] },
    { label: 'FUTURO',           pronouns: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'] },
    { label: 'CONDIZIONALE',     pronouns: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'] },
    { label: 'CONGIUNTIVO',      pronouns: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'] },
  ],
  sv: [
    { label: 'PRESENS',    pronouns: ['—'] },
    { label: 'PRETERITUM', pronouns: ['—'] },
    { label: 'SUPINUM',    pronouns: ['har/hade'] },
    { label: 'KONJUNKTIV', pronouns: ['—'] },
  ],
  tr: [
    { label: 'GENİŞ ZAMAN',               pronouns: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'] },
    { label: 'ŞİMDİKİ ZAMAN',            pronouns: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'] },
    { label: 'GELECEK ZAMAN',             pronouns: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'] },
    { label: 'GEÇMİŞ ZAMAN (-DI)',       pronouns: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'] },
    { label: 'ÖĞRENİLEN GEÇMİŞ (-MIŞ)', pronouns: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'] },
    { label: 'ŞART KİPİ',                pronouns: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'] },
  ],
};

function buildDeclensionsInstruction(lang: string): string {
  const wrap = (s: string) =>
    `"declensions": array of {label, table} objects or null —\n${s}`;
  switch (lang) {
    case 'de': return wrap(
      `noun → [{"label":"DEKLINIERT","table":{"NOM sg":"definite article+noun","AKK sg":"...","DAT sg":"...","GEN sg":"...","NOM pl":"...","AKK pl":"...","DAT pl":"...","GEN pl":"..."}}]\n` +
      `adjective → [{"label":"STARK","table":{"NOM m":"...","AKK m":"...","DAT m":"...","GEN m":"...","NOM f":"...","AKK f":"...","DAT f":"...","GEN f":"...","NOM n":"...","AKK n":"...","DAT n":"...","GEN n":"..."}},{"label":"SCHWACH","table":{same 12 keys, weak inflection}}]\n` +
      `adverb → [{"label":"STEIGERUNG","table":{"Positiv":"...","Komparativ":"...","Superlativ":"..."}}]\n` +
      `verb or other → null`
    );
    case 'fr': return wrap(
      `noun → [{"label":"FORMES","table":{"sg":"article+noun","pl":"article+noun"}}]\n` +
      `adjective → [{"label":"FORMES","table":{"m sg":"...","f sg":"...","m pl":"...","f pl":"..."}},{"label":"COMPARAISON","table":{"positif":"...","comparatif":"...","superlatif":"..."}}]\n` +
      `adverb → [{"label":"COMPARAISON","table":{"positif":"...","comparatif":"...","superlatif":"..."}}]\n` +
      `verb or other → null`
    );
    case 'es': return wrap(
      `noun → [{"label":"FORMAS","table":{"sg":"article+noun","pl":"article+noun"}}]\n` +
      `adjective → [{"label":"FORMAS","table":{"m sg":"...","f sg":"...","m pl":"...","f pl":"..."}},{"label":"COMPARACIÓN","table":{"positivo":"...","comparativo":"...","superlativo":"..."}}]\n` +
      `adverb → [{"label":"COMPARACIÓN","table":{"positivo":"...","comparativo":"...","superlativo":"..."}}]\n` +
      `verb or other → null`
    );
    case 'it': return wrap(
      `noun → [{"label":"FORME","table":{"sg":"article+noun","pl":"article+noun"}}]\n` +
      `adjective → [{"label":"FORME","table":{"m sg":"...","f sg":"...","m pl":"...","f pl":"..."}},{"label":"COMPARAZIONE","table":{"positivo":"...","comparativo":"...","superlativo":"..."}}]\n` +
      `adverb → [{"label":"COMPARAZIONE","table":{"positivo":"...","comparativo":"...","superlativo":"..."}}]\n` +
      `verb or other → null`
    );
    case 'sv': return wrap(
      `noun → [{"label":"FORMER","table":{"obestämd sg":"...","bestämd sg":"...","obestämd pl":"...","bestämd pl":"..."}}]\n` +
      `adjective → [{"label":"BÖJNING","table":{"grundform":"...","bestämd/pl":"...","komparativ":"...","superlativ":"..."}}]\n` +
      `adverb → [{"label":"JÄMFÖRELSE","table":{"positiv":"...","komparativ":"...","superlativ":"..."}}]\n` +
      `verb or other → null`
    );
    case 'tr': return wrap(
      `noun → [{"label":"ÇEKİM","table":{"NOM sg":"...","GEN sg":"...","DAT sg":"...","ACC sg":"...","LOC sg":"...","ABL sg":"...","NOM pl":"...","GEN pl":"...","DAT pl":"...","ACC pl":"...","LOC pl":"...","ABL pl":"..."}}]\n` +
      `adjective → [{"label":"KARŞILAŞTIRMA","table":{"olumlu":"...","karşılaştırmalı":"...","en üstün":"..."}}]\n` +
      `adverb → [{"label":"KARŞILAŞTIRMA","table":{"olumlu":"...","karşılaştırmalı":"...","en üstün":"..."}}]\n` +
      `verb or other → null`
    );
    default: return '"declensions": null';
  }
}

function buildTensesInstruction(lang: string): string {
  const tenses = VERB_TENSES[lang];
  if (!tenses) return '"tenses": null';
  const lines = tenses.map((t) => {
    const cells = t.pronouns.map((p) => `"${p}": "..."`).join(', ');
    return `  {"label": "${t.label}", "table": {${cells}}}`;
  });
  return `"tenses": if wordType is "verb", fill in ALL conjugated forms for the INFINITIVE:\n[\n${lines.join(',\n')}\n] — otherwise null`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Env {
  GITHUB_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  WORKER_ADMIN_KEY: string;
  NTFY_TOPIC?: string;
  WORDS_DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface WordRow {
  word: string;
  language: string;
  lemma: string | null;
  word_type: string | null;
  translation: string | null;
  explanation: string | null;
  example: string | null;
  pronunciation: string | null;
  verb_present: string | null;
  verb_past: string | null;
  forms: string | null;
  tip: string | null;
  meta: string | null;
  level: string | null;
  lookup_count: number;
}

interface TenseTable {
  label: string;
  table: Record<string, string>;
}

interface WordData {
  word: string;
  language: string;
  lemma: string | null;
  translation: string | null;
  wordType: string | null;
  explanation: string | null;
  example: string | null;
  /** Same sentence as `example` with the entry's own words wrapped in **. */
  exampleMarked: string | null;
  pronunciation: string | null;
  tenses: TenseTable[] | null;
  declensions: TenseTable[] | null;
  verbTable: Record<string, string> | null;
  verbTablePast: Record<string, string> | null;
  forms: Record<string, string> | null;
  tip: string | null;
  meta: Record<string, unknown> | null;
  level: string | null;
  fromCache: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function rowToWordData(row: WordRow, fromCache: boolean): WordData {
  const parsedMeta = row.meta ? JSON.parse(row.meta) as Record<string, unknown> : null;
  const tenses      = Array.isArray(parsedMeta?.tenses)      ? parsedMeta.tenses      as TenseTable[] : null;
  const declensions = Array.isArray(parsedMeta?.declensions) ? parsedMeta.declensions as TenseTable[] : null;
  const exampleMarked = typeof parsedMeta?.exampleMarked === 'string' ? parsedMeta.exampleMarked : null;

  let metaForClient: Record<string, unknown> | null = null;
  if (parsedMeta) {
    const copy = { ...parsedMeta };
    delete copy['tenses'];
    delete copy['declensions'];
    delete copy['exampleMarked'];
    metaForClient = Object.keys(copy).length > 0 ? copy : null;
  }

  return {
    word:          row.word,
    language:      row.language,
    lemma:         row.lemma,
    translation:   row.translation,
    wordType:      row.word_type,
    explanation:   row.explanation,
    example:       row.example,
    exampleMarked,
    pronunciation: row.pronunciation,
    tenses,
    declensions,
    verbTable:     row.verb_present ? JSON.parse(row.verb_present) : null,
    verbTablePast: row.verb_past    ? JSON.parse(row.verb_past)    : null,
    forms:         row.forms        ? JSON.parse(row.forms)        : null,
    tip:           row.tip,
    meta:          metaForClient,
    level:         row.level,
    fromCache,
  };
}

// ── Supabase pre-populated dictionary (read-through + batch sync) ─────────────
//
// Supabase `word_dictionary` is the source of truth populated by the nightly
// batch pipeline (one row per lemma, keyed by language+lemma+word_type). D1
// `words` is the fast edge cache keyed by exact surface form. This section
// lets D1 read through to Supabase on a miss (avoiding a live Claude call for
// any word Supabase already has) and lets the scheduled job bulk-expand every
// Supabase lemma's conjugated forms into D1 ahead of time.

interface SupabaseWordRow {
  language: string;
  word: string;
  lemma: string;
  word_type: string | null;
  translation: string | null;
  level: string | null;
  ipa: string | null;
  explanation: string | null;
  example_sentence: string | null;
  tip: string | null;
  data: Record<string, unknown> | null;
}

function tensesDictToArray(tenses: unknown): TenseTable[] | null {
  if (!tenses || typeof tenses !== 'object') return null;
  const array: TenseTable[] = [];
  for (const [label, table] of Object.entries(tenses as Record<string, unknown>)) {
    if (table && typeof table === 'object') array.push({ label, table: table as Record<string, string> });
  }
  return array.length > 0 ? array : null;
}

function buildFormsFromSupabaseData(wordType: string | null, data: Record<string, unknown>): Record<string, string> | null {
  const svForms = (data.forms && typeof data.forms === 'object') ? data.forms as Record<string, string> : {};
  if (wordType === 'noun') {
    const cases = (data.cases as Record<string, string>) ?? {};
    const forms: Record<string, string> = {};
    if (data.gender) forms.gender = String(data.gender);
    if (data.article_definite) { forms.article = String(data.article_definite); forms.definite = String(data.article_definite); }
    if (data.article_indefinite) forms.indefinite = String(data.article_indefinite);
    const plural = data.plural ?? cases.nominative_plural ?? svForms.plural_indefinite;
    if (plural) forms.plural = String(plural);
    return Object.keys(forms).length > 0 ? forms : null;
  }
  if (wordType === 'adjective') {
    const forms: Record<string, string> = {};
    if (data.feminine) forms.feminine = String(data.feminine);
    if (data.masculine) forms.masculine = String(data.masculine);
    if (data.comparative) forms.comparative = String(data.comparative);
    if (data.superlative) forms.superlative = String(data.superlative);
    if (svForms.plural_indefinite) forms.plural = String(svForms.plural_indefinite);
    return Object.keys(forms).length > 0 ? forms : null;
  }
  return null;
}

/** Every other single-token inflected surface form Claude already generated
 * for this lemma (plurals, feminine/masculine, comparative/superlative, case
 * declensions) — mirrors scripts/sync_supabase_to_d1.py's
 * extract_additional_forms() across all 6 languages' actual field shapes. */
function extractAdditionalForms(wordType: string | null, data: Record<string, unknown>): string[] {
  const forms = new Set<string>();
  const svForms = (data.forms && typeof data.forms === 'object') ? data.forms as Record<string, unknown> : {};
  if (wordType === 'verb') {
    // Flat fields alongside `tenses` on every verb across all 6 languages
    // (e.g. fr "ajouter": past_participle="ajouté", present_participle=
    // "ajoutant"). The three gendered/number-agreed participle fields were
    // added to the generation schema on 2026-09-11 for past participles used
    // as adjectives (e.g. "acceptée", "accueillis") — missing them here (not
    // a generation gap) is why those surface forms kept showing as
    // uncovered through multiple population rounds that day.
    for (const key of [
      'past_participle', 'present_participle',
      'past_participle_feminine', 'past_participle_masculine_plural', 'past_participle_feminine_plural',
    ]) {
      if (typeof data[key] === 'string') forms.add(data[key] as string);
    }
  } else if (wordType === 'adjective') {
    // masculine_plural/feminine_plural were added the same day, same reason.
    for (const key of ['feminine', 'masculine', 'comparative', 'superlative', 'masculine_plural', 'feminine_plural']) {
      if (typeof data[key] === 'string') forms.add(data[key] as string);
    }
    for (const v of Object.values(svForms)) if (typeof v === 'string') forms.add(v);
  } else if (wordType === 'noun') {
    for (const key of ['plural', 'singular']) {
      if (typeof data[key] === 'string') forms.add(data[key] as string);
    }
    const cases = (data.cases && typeof data.cases === 'object') ? data.cases as Record<string, unknown> : {};
    for (const v of Object.values(cases)) if (typeof v === 'string') forms.add(v);
    for (const v of Object.values(svForms)) if (typeof v === 'string') forms.add(v);
  }
  return Array.from(forms);
}

/** Builds the D1 row for a Supabase lemma row's BASE form only (word === lemma) — used by the live read-through, which only ever checks an exact lemma match. */
function d1RowFromSupabaseLemma(row: SupabaseWordRow): Partial<WordRow> {
  const data = row.data ?? {};
  const tenses = row.word_type === 'verb' ? tensesDictToArray(data.tenses) : null;
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (k !== 'tenses' && k !== 'cases') meta[k] = v;
  if (tenses) meta.tenses = tenses;

  return {
    word: row.lemma,
    language: row.language,
    lemma: row.lemma,
    word_type: row.word_type,
    translation: row.translation,
    explanation: row.explanation,
    example: row.example_sentence,
    pronunciation: row.ipa,
    forms: buildFormsFromSupabaseData(row.word_type, data) ? JSON.stringify(buildFormsFromSupabaseData(row.word_type, data)) : null,
    tip: row.tip,
    meta: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
    level: row.level,
  };
}

/** Cheap, indexed exact-lemma lookup — the only Supabase query the live request path makes. */
async function fetchSupabaseLemma(env: Env, word: string, lang: string): Promise<SupabaseWordRow | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = `${env.SUPABASE_URL}/rest/v1/word_dictionary`
    + `?language=eq.${encodeURIComponent(lang)}&lemma=eq.${encodeURIComponent(word)}`
    + `&select=language,word,lemma,word_type,translation,level,ipa,explanation,example_sentence,tip,data&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return null;
    const rows = await res.json() as SupabaseWordRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Full row set for one Supabase lemma: the lemma itself, plus (verbs only) every
 * distinct single-token conjugated form. Compound tenses ("habe gehabt") are two
 * tokens in running text — a tap only ever hits one token, and that token belongs
 * to a different lemma (the auxiliary) or needs its own row (the participle), so
 * a multi-word key here would never be looked up and risks misattributing the
 * auxiliary to this lemma. Mirrors scripts/sync_supabase_to_d1.py exactly. */
function d1RowsFromSupabaseRow(row: SupabaseWordRow): Partial<WordRow>[] {
  const lemma = (row.lemma || '').trim().toLowerCase();
  if (!lemma) return [];
  const base = d1RowFromSupabaseLemma({ ...row, lemma });
  const rows: Partial<WordRow>[] = [{ ...base, word: lemma }];

  const data = row.data ?? {};
  const seen = new Set([lemma]);
  const candidateForms: string[] = [];
  if (row.word_type === 'verb') {
    const tenses = tensesDictToArray(data.tenses);
    if (tenses) for (const tense of tenses) candidateForms.push(...Object.values(tense.table));
  }
  candidateForms.push(...extractAdditionalForms(row.word_type, data));

  const isRealWord = (w: string) => !!w && /\p{L}/u.test(w);

  for (const form of candidateForms) {
    if (typeof form !== 'string') continue;
    const w = form.trim().toLowerCase();
    if (!isRealWord(w)) continue;
    if (w.includes(' ')) {
      // Compound tenses ("j'ai affirmé", "wirst haben") and multi-word
      // comparative/superlative phrases ("le plus grand") are more than one
      // token in running text — a tap only ever hits one token. The LAST
      // token is always this lemma's own participle or infinitive (never
      // the leading auxiliary/pronoun/qualifier), so it's safe to extract
      // on its own; the rest of the phrase is someone else's word.
      const last = w.split(' ').pop() ?? '';
      if (isRealWord(last) && !seen.has(last)) {
        seen.add(last);
        rows.push({ ...base, word: last });
      }
      continue;
    }
    if (seen.has(w)) continue;
    seen.add(w);
    rows.push({ ...base, word: w });
  }
  return rows;
}

async function fetchAllSupabaseRows(env: Env, lang: string): Promise<SupabaseWordRow[]> {
  const rows: SupabaseWordRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url = `${env.SUPABASE_URL}/rest/v1/word_dictionary`
      + `?language=eq.${encodeURIComponent(lang)}&order=id.asc&limit=${pageSize}&offset=${offset}`
      + `&select=language,word,lemma,word_type,translation,level,ipa,explanation,example_sentence,tip,data`;
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) { console.error(`[sync] Supabase fetch failed for ${lang}: ${res.status}`); break; }
    const page = await res.json() as SupabaseWordRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const SYNC_LANGUAGES = ['fr', 'de', 'es', 'it', 'sv', 'pt'];
const SUPABASE_UPSERT_BATCH_SIZE = 1000;

/** Bulk-expands every Supabase lemma (+ conjugated/inflected forms) into
 * word_forms — the table the app's on-device prefetch queries directly (no
 * D1, no Worker round-trip, just a public read policy). Idempotent —
 * ON CONFLICT DO UPDATE keeps every row current with the latest population. */
async function syncSupabaseToWordForms(env: Env): Promise<{ lang: string; rows: number }[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[sync] Supabase env vars not set — skipping word_forms sync');
    return [];
  }

  const summary: { lang: string; rows: number }[] = [];
  for (const lang of SYNC_LANGUAGES) {
    try {
      const supaRows = await fetchAllSupabaseRows(env, lang);
      const rawFormRows = supaRows.flatMap(d1RowsFromSupabaseRow).map((r) => ({
        word: r.word, language: r.language, lemma: r.lemma, word_type: r.word_type ?? null,
        translation: r.translation ?? null, explanation: r.explanation ?? null,
        example: r.example ?? null, pronunciation: r.pronunciation ?? null,
        forms: r.forms ? JSON.parse(r.forms) : null, tip: r.tip ?? null,
        meta: r.meta ? JSON.parse(r.meta) : null, level: r.level ?? null,
      }));
      // word_forms is unique on (word, language, word_type) — one row PER
      // SENSE, e.g. German "sein" keeps a separate row for the verb ("to
      // be") and the possessive adjective ("his/its") instead of one
      // colliding into the other. Still de-dup within a batch: the same
      // word_type can still coincide across two different lemmas (verb-verb
      // homographs), or within one lemma's own expansion. Without this, a
      // single upsert batch containing the same conflict key twice is
      // rejected outright by Postgres ("ON CONFLICT DO UPDATE command
      // cannot affect row a second time"), failing the whole batch.
      const dedupMap = new Map<string, typeof rawFormRows[number]>();
      for (const r of rawFormRows) dedupMap.set(`${r.word} ${r.language} ${r.word_type}`, r);
      const formRows = Array.from(dedupMap.values());

      for (let i = 0; i < formRows.length; i += SUPABASE_UPSERT_BATCH_SIZE) {
        const chunk = formRows.slice(i, i + SUPABASE_UPSERT_BATCH_SIZE);
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/word_forms?on_conflict=word,language,word_type`, {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) {
          console.error(`[sync] word_forms ${lang} batch ${i} failed: ${res.status} ${await res.text()}`);
        }
      }
      console.log(`[sync] ${lang}: ${supaRows.length} lemmas -> ${formRows.length} word_forms rows`);
      summary.push({ lang, rows: formRows.length });
    } catch (err) {
      console.error(`[sync] word_forms ${lang} failed (continuing to next language):`, err);
    }
  }
  return summary;
}

// ── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T | null>,
  maxAttempts: number,
  delayMs = 400,
): Promise<{ result: T | null; allFailed: boolean }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fn();
    if (result !== null) return { result, allFailed: false };
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  return { result: null, allFailed: true };
}

// ── Failure notification ──────────────────────────────────────────────────────

function notifyWordFailure(
  topic: string,
  word: string,
  lang: string,
): void {
  const langName  = LANGUAGE_NAMES[lang] ?? lang.toUpperCase();
  const timestamp = new Date().toUTCString().replace(' GMT', ' UTC');

  const body = [
    `WHAT FAILED:  Claude (translation + explanations)`,
    `WORD:         "${word}" · ${langName} (${lang})`,
    `USER SAW:     "Translation unavailable" — blank popup`,
    `RETRIES:      3 attempts exhausted`,
    `TIME:         ${timestamp}`,
    `ACTION:       Check Cloudflare Worker logs + Anthropic API status`,
  ].join('\n');

  // Fire-and-forget — don't delay the response waiting on ntfy
  fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: {
      'Title': 'Bilinguist — Word lookup failure',
      'Priority': 'urgent',
      'Tags': 'rotating_light,no_entry_sign',
      'Content-Type': 'text/plain',
    },
    body,
  }).catch(() => { /* non-fatal */ });
}

// ── Claude word explanation ────────────────────────────────────────────────────

async function generateWordData(
  word: string,
  lang: string,
  level: string,
  apiKey: string,
  ctx?: string | null,
): Promise<Partial<WordRow> | null> {
  const langName = LANGUAGE_NAMES[lang] ?? lang;
  const ctxHint = ctx ? `\n\nContext — this word appeared in the sentence: "${ctx}"\nUse this to resolve any ambiguity (e.g. proper nouns vs common nouns).` : '';

  const prompt = `A language learner studying ${langName} at ${level} level wants to learn the word "${word}".${ctxHint}

Identify the word type and reply ONLY with a JSON object — no markdown, no preamble:
{
  "lemma": "the base dictionary form — for a verb the infinitive (e.g. 'haben' for 'hätte'), for a noun the nominative singular, for an adjective the masculine base form. If '${word}' IS already the base form, repeat it here exactly.",
  "translation": "the primary English meaning in 1-5 words — the most natural translation",
  "wordType": one of "verb" | "noun" | "adjective" | "adverb" | "phrase" | "other",
  "explanation": "Meaning in English, 1-2 sentences, suited to ${level} level",
  "example": "A ${langName} example sentence using this word naturally",
  "exampleMarked": "the SAME sentence as \"example\", character for character, with every word belonging to this entry wrapped in double asterisks. For a separable verb mark BOTH pieces where they sit — e.g. 'Die Behörde **gab** **an**, dass ...'. Mark the inflected form actually used, not the dictionary form. If only one word belongs, mark only that one.",
  "pronunciation": "IPA pronunciation of the lemma form",
  ${buildTensesInstruction(lang)},
  ${buildDeclensionsInstruction(lang)},
  "forms": if noun {"gender": "masculine/feminine/neuter", "plural": "plural form", "article": "definite article", "definite": "article + singular", "indefinite": "indefinite article + singular"} — if adjective {"feminine": "feminine form", "masculine": "masculine form", "comparative": "comparative form", "superlative": "superlative form"} — otherwise null,
  "tip": a short memorable tip — etymology, common learner mistake, or memory hook — or null,
  "meta": if verb {"isRegular": true/false, "auxiliary": the auxiliary verb e.g. "haben"/"sein"/"avoir"/"être" (null if not applicable), "verbClass": verb group e.g. "-er"/"-ir" for French, "Group 1" for Swedish (null if not applicable), "isSeparable": true/false for German separable verbs (null for other languages)} — otherwise null,
  "level": CEFR level of this word: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;

    const data = await res.json() as { content: { text: string }[] };
    const raw  = data.content?.[0]?.text ?? '';
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      lemma?: string | null;
      translation?: string | null;
      wordType?: string;
      explanation?: string;
      example?: string;
      exampleMarked?: string;
      pronunciation?: string;
      tenses?: TenseTable[] | null;
      declensions?: TenseTable[] | null;
      forms?: Record<string, string> | null;
      tip?: string | null;
      meta?: Record<string, unknown> | null;
      level?: string | null;
    };

    const tenses      = Array.isArray(parsed.tenses)      ? parsed.tenses      : null;
    const declensions = Array.isArray(parsed.declensions) ? parsed.declensions : null;
    // Keep verb_present/verb_past populated for backward compat with any legacy readers
    const verb_present = tenses?.[0]?.table ? JSON.stringify(tenses[0].table) : null;
    const verb_past    = tenses?.[1]?.table ? JSON.stringify(tenses[1].table) : null;
    // Pack tenses + declensions into meta — no D1 schema change needed
    const metaObj = {
      ...(parsed.meta ?? {}),
      ...(tenses      ? { tenses }      : {}),
      ...(declensions ? { declensions } : {}),
      // The model wrote the sentence, so it knows which words it meant — the app
      // can't recover that from spelling once a verb is inflected ("gab" from
      // "geben"). Rides in meta for the same reason tenses do: no schema change.
      ...(parsed.exampleMarked ? { exampleMarked: parsed.exampleMarked } : {}),
    };
    const metaStr = Object.keys(metaObj).length > 0 ? JSON.stringify(metaObj) : null;

    return {
      lemma:         parsed.lemma?.toLowerCase() ?? null,
      translation:   parsed.translation          ?? null,
      word_type:     parsed.wordType             ?? null,
      explanation:   parsed.explanation          ?? null,
      example:       parsed.example              ?? null,
      pronunciation: parsed.pronunciation        ?? null,
      verb_present,
      verb_past,
      forms:         parsed.forms ? JSON.stringify(parsed.forms) : null,
      tip:           parsed.tip   ?? null,
      meta:          metaStr,
      level:         parsed.level ?? null,
    };
  } catch {
    return null;
  }
}

// ── Route: POST /word/verify-tenses ───────────────────────────────────────────
// Second-pass check on already-generated conjugation tables — generateWordData()
// occasionally gets a form wrong, so the client sends the tables back here to be
// re-checked. Used to run client-side with the Anthropic key shipped in the app
// bundle (EXPO_PUBLIC_ANTHROPIC_API_KEY); moved server-side so the key never has
// to leave the Worker.

async function handleVerifyTenses(request: Request, env: Env): Promise<Response> {
  let body: { tenses?: TenseTable[]; lemma?: string; language?: string };
  try { body = await request.json() as typeof body; }
  catch { return json({ tenses: null }); }

  const tenses   = Array.isArray(body.tenses) ? body.tenses : null;
  const lemma    = body.lemma?.trim();
  const language = body.language?.trim();
  if (!tenses || !tenses.length || !lemma || !language) {
    return json({ tenses: null });
  }

  const langName = LANGUAGE_NAMES[language] ?? language;
  const prompt = `You are a ${langName} grammar expert. Below are the conjugation tables for the verb "${lemma}". Verify every form and correct any errors. Return ONLY the corrected JSON array — same structure, same tenses in the same order, same pronouns as keys. Fix wrong forms silently. If everything is correct, return the data unchanged. No explanation, no markdown, no preamble.

${JSON.stringify(tenses)}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return json({ tenses: null });

    const data = await res.json() as { content: { text: string }[] };
    const raw  = data.content?.[0]?.text ?? '';
    const start = raw.indexOf('[');
    const end   = raw.lastIndexOf(']');
    if (start === -1 || end === -1) return json({ tenses: null });

    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed) || parsed.length !== tenses.length) return json({ tenses: null });

    return json({ tenses: parsed });
  } catch {
    return json({ tenses: null });
  }
}

// ── Tense backfill for legacy cached verbs ────────────────────────────────────

async function backfillVerbTenses(
  row: WordRow,
  lang: string,
  apiKey: string,
  db: D1Database,
): Promise<TenseTable[] | null> {
  const lemma    = row.lemma ?? row.word;
  const langName = LANGUAGE_NAMES[lang] ?? lang;

  const prompt = `Conjugate the ${langName} verb "${lemma}" and reply ONLY with a JSON object — no markdown, no preamble:
{
  ${buildTensesInstruction(lang)}
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;

    const data   = await res.json() as { content: { text: string }[] };
    const raw    = data.content?.[0]?.text ?? '';
    const start  = raw.indexOf('{');
    const end    = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as { tenses?: TenseTable[] | null };
    const tenses = Array.isArray(parsed.tenses) && parsed.tenses.length > 0 ? parsed.tenses : null;
    if (!tenses) return null;

    // Update the D1 meta column with the new tenses, preserving other meta fields
    const existing = row.meta ? JSON.parse(row.meta) as Record<string, unknown> : {};
    const newMeta  = JSON.stringify({ ...existing, tenses });
    await db
      .prepare('UPDATE words SET meta = ?1 WHERE word = ?2 AND language = ?3')
      .bind(newMeta, row.word, lang)
      .run();

    return tenses;
  } catch {
    return null;
  }
}

// ── Declension backfill for legacy cached nouns/adjectives/adverbs ────────────

async function backfillDeclensions(
  row: WordRow,
  lang: string,
  apiKey: string,
  db: D1Database,
): Promise<TenseTable[] | null> {
  const lemma    = row.lemma ?? row.word;
  const langName = LANGUAGE_NAMES[lang] ?? lang;
  const wordType = row.word_type ?? 'noun';

  const prompt = `Give the declension/inflection forms for the ${langName} ${wordType} "${lemma}" and reply ONLY with a JSON object — no markdown, no preamble:
{
  ${buildDeclensionsInstruction(lang)}
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;

    const data   = await res.json() as { content: { text: string }[] };
    const raw    = data.content?.[0]?.text ?? '';
    const start  = raw.indexOf('{');
    const end    = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as { declensions?: TenseTable[] | null };
    const declensions = Array.isArray(parsed.declensions) && parsed.declensions.length > 0 ? parsed.declensions : null;
    if (!declensions) return null;

    const existing = row.meta ? JSON.parse(row.meta) as Record<string, unknown> : {};
    const newMeta  = JSON.stringify({ ...existing, declensions });
    await db
      .prepare('UPDATE words SET meta = ?1 WHERE word = ?2 AND language = ?3')
      .bind(newMeta, row.word, lang)
      .run();

    return declensions;
  } catch {
    return null;
  }
}

// ── Contextual explanation overlay (used when word is cached but ctx is provided) ──

async function getContextualExplanation(
  word: string,
  lang: string,
  level: string,
  ctx: string,
  apiKey: string,
): Promise<Pick<WordRow, 'translation' | 'explanation' | 'word_type'> | null> {
  const langName = LANGUAGE_NAMES[lang] ?? lang;
  const prompt = `A ${langName} language learner tapped the word "${word}" in this sentence:
"${ctx}"

Reply ONLY with a JSON object — no markdown, no preamble:
{
  "translation": "the correct English translation of '${word}' AS USED IN THIS SENTENCE, 1-5 words",
  "explanation": "what '${word}' means in this specific context, 1-2 sentences at ${level} level",
  "wordType": one of "verb" | "noun" | "adjective" | "adverb" | "phrase" | "other"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { content: { text: string }[] };
    const raw  = data.content?.[0]?.text ?? '';
    const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { translation?: string; explanation?: string; wordType?: string };
    return {
      translation: parsed.translation ?? null,
      explanation: parsed.explanation ?? null,
      word_type:   parsed.wordType   ?? null,
    };
  } catch {
    return null;
  }
}

// ── Route: GET /word ──────────────────────────────────────────────────────────

/** Fire off a D1 write without ever letting it fail the response. Writes on
 * this path (cache-fill inserts) are all optional bookkeeping — the data to
 * return has already been read or generated by the time these run, so a
 * write failure (e.g. the daily D1 rows_written cap) must never turn an
 * otherwise-successful lookup into a 500. */
async function safeD1Write(stmt: D1PreparedStatement): Promise<void> {
  try {
    await stmt.run();
  } catch (err) {
    console.error('[d1] write failed (non-fatal):', err);
  }
}

async function handleWordGet(url: URL, env: Env): Promise<Response> {
  const rawWord = url.searchParams.get('w')?.trim();
  const lang    = url.searchParams.get('lang')?.trim().toLowerCase() ?? 'fr';
  const level   = url.searchParams.get('level')?.trim() ?? 'B1';
  const ctx     = url.searchParams.get('ctx')?.trim() ?? null;

  if (!rawWord) return json({ error: 'missing_word' }, 400);
  const word = rawWord.toLowerCase();

  // ── Step 1: exact match ──────────────────────────────────────────────────────
  const hit = await env.WORDS_DB
    .prepare('SELECT * FROM words WHERE word = ?1 AND language = ?2')
    .bind(word, lang)
    .first<WordRow>();

  // Only trust the cache if translation is populated — null means saved during an outage
  if (hit && hit.translation !== null) {
    // When sentence context is provided, get a contextual explanation overlay so
    // homographs (e.g. Bank=bench vs Bank=financial) resolve correctly even from cache.
    // Grammar tables (tenses, declensions) are always context-independent — keep from cache.
    if (ctx) {
      const contextualOverlay = await getContextualExplanation(word, lang, level, ctx, env.ANTHROPIC_API_KEY);
      if (contextualOverlay) {
        const overlaidHit = { ...hit, ...contextualOverlay };
        // Backfill grammar if needed (reuse existing logic below via modified hit)
        const parsedMeta  = overlaidHit.meta ? JSON.parse(overlaidHit.meta) as Record<string, unknown> : null;
        const hasTenses   = Array.isArray(parsedMeta?.tenses) && (parsedMeta.tenses as unknown[]).length > 0;
        const isVerb      = overlaidHit.word_type === 'verb' || overlaidHit.verb_present !== null;
        const needsDecl   = !isVerb && ['noun', 'adjective', 'adverb'].includes(overlaidHit.word_type ?? '');
        const hasDeclensions = Array.isArray(parsedMeta?.declensions) && (parsedMeta.declensions as unknown[]).length > 0;
        let finalHit = overlaidHit;
        if (isVerb && !hasTenses) {
          const newTenses = await backfillVerbTenses(hit, lang, env.ANTHROPIC_API_KEY, env.WORDS_DB);
          if (newTenses) { const m = JSON.stringify({ ...(parsedMeta ?? {}), tenses: newTenses }); finalHit = { ...overlaidHit, meta: m }; }
        } else if (needsDecl && !hasDeclensions) {
          const newDecl = await backfillDeclensions(hit, lang, env.ANTHROPIC_API_KEY, env.WORDS_DB);
          if (newDecl) { const m = JSON.stringify({ ...(parsedMeta ?? {}), declensions: newDecl }); finalHit = { ...overlaidHit, meta: m }; }
        }
        return json(rowToWordData(finalHit, true));
      }
    }

    // Backfill tenses for verbs cached before the full-tenses feature was added
    const parsedMeta  = hit.meta ? JSON.parse(hit.meta) as Record<string, unknown> : null;
    const hasTenses   = Array.isArray(parsedMeta?.tenses) && (parsedMeta.tenses as unknown[]).length > 0;
    const isVerb      = hit.word_type === 'verb' || hit.verb_present !== null;
    const needsDecl   = !isVerb && ['noun', 'adjective', 'adverb'].includes(hit.word_type ?? '');
    const hasDeclensions = Array.isArray(parsedMeta?.declensions) && (parsedMeta.declensions as unknown[]).length > 0;

    let updatedHit = hit;
    if (isVerb && !hasTenses) {
      const newTenses = await backfillVerbTenses(hit, lang, env.ANTHROPIC_API_KEY, env.WORDS_DB);
      if (newTenses) {
        const m = JSON.stringify({ ...(parsedMeta ?? {}), tenses: newTenses });
        updatedHit = { ...hit, meta: m };
      }
    } else if (needsDecl && !hasDeclensions) {
      const newDecl = await backfillDeclensions(hit, lang, env.ANTHROPIC_API_KEY, env.WORDS_DB);
      if (newDecl) {
        const m = JSON.stringify({ ...(parsedMeta ?? {}), declensions: newDecl });
        updatedHit = { ...hit, meta: m };
      }
    }

    return json(rowToWordData(updatedHit, true));
  }

  // ── Step 1.5: Supabase read-through — word may already be a synced lemma we
  // haven't pulled into D1 yet (batch sync runs on a schedule, not instantly) ───
  const supaLemma = await fetchSupabaseLemma(env, word, lang);
  if (supaLemma) {
    const supaRow = d1RowFromSupabaseLemma(supaLemma) as WordRow;
    await safeD1Write(env.WORDS_DB.prepare(`
      INSERT INTO words
        (word, language, translation, lemma, word_type, explanation, example, pronunciation,
         forms, tip, meta, level)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
      ON CONFLICT(word, language) DO NOTHING
    `).bind(
      supaRow.word, supaRow.language, supaRow.translation, supaRow.lemma, supaRow.word_type,
      supaRow.explanation, supaRow.example, supaRow.pronunciation,
      supaRow.forms, supaRow.tip, supaRow.meta, supaRow.level,
    ));
    return json(rowToWordData(supaRow, true));
  }

  // ── Step 2: cache miss — call Claude (provides translation + full word data) ───
  const generatedResult = await withRetry(
    () => generateWordData(word, lang, level, env.ANTHROPIC_API_KEY, ctx), 3,
  );
  const generated = generatedResult.result;

  if (generatedResult.allFailed && env.NTFY_TOPIC) {
    notifyWordFailure(env.NTFY_TOPIC, word, lang);
  }

  const translation = generated?.translation ?? null;
  const lemma       = generated?.lemma ?? word;

  // ── Step 3: if inflected form, check whether the lemma is already cached ──────
  if (lemma !== word) {
    const lemmaHit = await env.WORDS_DB
      .prepare('SELECT * FROM words WHERE word = ?1 AND language = ?2')
      .bind(lemma, lang)
      .first<WordRow>();

    if (lemmaHit) {
      await safeD1Write(env.WORDS_DB.prepare(`
        INSERT INTO words
          (word, language, translation, lemma, word_type, explanation, example, pronunciation,
           verb_present, verb_past, forms, tip, meta, level)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(word, language) DO UPDATE SET
          translation=excluded.translation, lemma=excluded.lemma,
          word_type=excluded.word_type, explanation=excluded.explanation,
          example=excluded.example, pronunciation=excluded.pronunciation,
          verb_present=excluded.verb_present, verb_past=excluded.verb_past,
          forms=excluded.forms, tip=excluded.tip, meta=excluded.meta, level=excluded.level
        WHERE words.translation IS NULL
      `).bind(
        word, lang,
        translation ?? lemmaHit.translation,
        lemma,
        lemmaHit.word_type, lemmaHit.explanation, lemmaHit.example,
        lemmaHit.pronunciation, lemmaHit.verb_present, lemmaHit.verb_past,
        lemmaHit.forms, lemmaHit.tip, lemmaHit.meta, lemmaHit.level,
      ));

      return json(rowToWordData(
        { ...lemmaHit, word, translation: translation ?? lemmaHit.translation, lemma },
        false,
      ));
    }
  }

  // ── Step 4: full miss — store everything and return ───────────────────────────
  const row: Partial<WordRow> = { word, language: lang, translation, lemma, ...generated };

  await safeD1Write(env.WORDS_DB.prepare(`
    INSERT INTO words
      (word, language, translation, lemma, word_type, explanation, example, pronunciation,
       verb_present, verb_past, forms, tip, meta, level)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT(word, language) DO UPDATE SET
      translation=excluded.translation, lemma=excluded.lemma,
      word_type=excluded.word_type, explanation=excluded.explanation,
      example=excluded.example, pronunciation=excluded.pronunciation,
      verb_present=excluded.verb_present, verb_past=excluded.verb_past,
      forms=excluded.forms, tip=excluded.tip, meta=excluded.meta, level=excluded.level
    WHERE words.translation IS NULL
  `).bind(
    row.word, row.language,
    row.translation ?? null, row.lemma ?? null,
    row.word_type ?? null, row.explanation ?? null, row.example ?? null,
    row.pronunciation ?? null, row.verb_present ?? null, row.verb_past ?? null,
    row.forms ?? null, row.tip ?? null, row.meta ?? null, row.level ?? null,
  ));

  return json(rowToWordData(row as WordRow, false));
}

// ── Route: POST /word (admin bulk insert for populate script) ─────────────────

async function handleWordPost(request: Request, env: Env): Promise<Response> {
  const adminKey = request.headers.get('X-Admin-Key');
  if (!env.WORKER_ADMIN_KEY || adminKey !== env.WORKER_ADMIN_KEY) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const word     = (body.word as string)?.trim().toLowerCase();
  const language = (body.language as string)?.trim().toLowerCase();
  if (!word || !language) return json({ error: 'word and language are required' }, 400);

  await env.WORDS_DB.prepare(`
    INSERT OR REPLACE INTO words
      (word, language, translation, lemma, word_type, explanation, example, pronunciation,
       verb_present, verb_past, forms, tip, meta)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
  `).bind(
    word, language,
    (body.translation as string) ?? null,
    (body.lemma as string) ?? null,
    (body.wordType as string) ?? null,
    (body.explanation as string) ?? null,
    (body.example as string) ?? null,
    (body.pronunciation as string) ?? null,
    body.verbTable     ? JSON.stringify(body.verbTable)     : null,
    body.verbTablePast ? JSON.stringify(body.verbTablePast) : null,
    body.forms         ? JSON.stringify(body.forms)         : null,
    (body.tip as string) ?? null,
    body.meta          ? JSON.stringify(body.meta)          : null,
  ).run();

  return json({ ok: true, word, language });
}

// ── Route: GET /word/stats ────────────────────────────────────────────────────

async function handleWordStats(env: Env): Promise<Response> {
  const rows = await env.WORDS_DB
    .prepare('SELECT language, COUNT(*) as count FROM words GROUP BY language ORDER BY count DESC')
    .all<{ language: string; count: number }>();
  return json(rows.results);
}

// ── Route: GET /word/export ───────────────────────────────────────────────────
// Admin-only: returns the full D1 word library as JSON (protected by WORKER_ADMIN_KEY)

async function handleWordExport(request: Request, env: Env): Promise<Response> {
  const adminKey = new URL(request.url).searchParams.get('key');
  if (!env.WORKER_ADMIN_KEY || adminKey !== env.WORKER_ADMIN_KEY) {
    return json({ error: 'unauthorized' }, 401);
  }

  const rows = await env.WORDS_DB
    .prepare(`SELECT word, language, lemma, translation, word_type, explanation, example,
              pronunciation, verb_present, verb_past, forms, tip, meta, lookup_count
              FROM words ORDER BY language, word`)
    .all<WordRow>();

  return json({
    exported_at: new Date().toISOString(),
    total: rows.results.length,
    words: rows.results.map((r) => rowToWordData(r, true)),
  });
}

// ── Route: POST /words/bulk ────────────────────────────────────────────────────
// D1-only lookup for many words at once — the client's on-device prefetch calls
// this once per brief instead of one request per word. NEVER touches Claude or
// Supabase: a word not yet in D1 is just absent from the response, and the
// client's normal per-tap lookupWord() (which does read through) fills the gap
// if the user actually taps it.

async function handleWordsBulk(request: Request, env: Env): Promise<Response> {
  let body: { lang?: string; words?: string[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const lang = body.lang?.trim().toLowerCase();
  const words = Array.isArray(body.words)
    ? Array.from(new Set(body.words.map((w) => String(w).trim().toLowerCase()).filter(Boolean)))
    : [];
  if (!lang || words.length === 0) return json({ error: 'missing_lang_or_words' }, 400);

  const capped = words.slice(0, 3000);
  const CHUNK = 90; // stay comfortably under D1's per-statement bound-parameter limit
  const found: WordRow[] = [];

  for (let i = 0; i < capped.length; i += CHUNK) {
    const chunk = capped.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => `?${j + 2}`).join(',');
    const res = await env.WORDS_DB
      .prepare(`SELECT * FROM words WHERE language = ?1 AND word IN (${placeholders}) AND translation IS NOT NULL`)
      .bind(lang, ...chunk)
      .all<WordRow>();
    found.push(...res.results);
  }

  return json({
    lang,
    requested: capped.length,
    found: found.length,
    words: found.map((r) => rowToWordData(r, true)),
  });
}

// ── Route: GET /audio/* ───────────────────────────────────────────────────────
// Streams pre-generated audio from R2. Files are written by the pipeline's
// own audio stage (Google Cloud TTS), never synthesised on demand here — this
// route is read-only by design, so there's nothing here for an unauthenticated
// caller to spend money or write storage by hitting.

async function handleAudioStream(key: string, env: Env): Promise<Response> {
  const r2Key = `${key}.mp3`;
  const obj = await env.AUDIO_BUCKET.get(r2Key);

  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ── Briefing routes (existing) ────────────────────────────────────────────────

const REPO   = 'will-diggle/bilinguist-data';
const BRANCH = 'main';

async function handleBriefingMeta(env: Env): Promise<Response> {
  const upstream = `https://api.github.com/repos/${REPO}/contents/latest.json`;
  const githubRes = await fetch(upstream, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.raw+json',
      'User-Agent': 'Bilinguist-Brief-Worker/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cf: { cacheEverything: false },
  } as RequestInit & { cf: { cacheEverything: boolean } });

  if (!githubRes.ok) {
    const status = githubRes.status === 404 ? 404 : 502;
    return new Response(status === 404 ? 'Not found' : 'Upstream error', { status });
  }

  const bundle = await githubRes.json() as { date?: string; generatedAt?: number };
  return json({ date: bundle.date ?? null, generatedAt: bundle.generatedAt ?? null });
}

async function handleBriefing(filePath: string, env: Env): Promise<Response> {
  // Use the GitHub API contents endpoint instead of raw.githubusercontent.com.
  // raw.githubusercontent.com is served via GitHub's CDN (Fastly) which can
  // cache private-repo content for hours, causing the app to receive yesterday's
  // bundle long after today's has been pushed. The API endpoint bypasses that CDN.
  const upstream = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
  const githubRes = await fetch(upstream, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.raw+json',
      'User-Agent': 'Bilinguist-Brief-Worker/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cf: { cacheEverything: false },
  } as RequestInit & { cf: { cacheEverything: boolean } });

  if (!githubRes.ok) {
    const status = githubRes.status === 404 ? 404 : 502;
    return new Response(status === 404 ? 'Not found' : 'Upstream error', { status });
  }

  // The stored bundle also carries internal pipeline/QA material (factbase,
  // gatherSource, search logs, raw grading reasoning, fact-check notes, the
  // unshipped "intermediate" native draft) alongside the finished content —
  // strip it here so this public, unauthenticated route only ever serves what
  // the app actually displays. nativeGrades stays: it's just a small {lang:
  // level} map the app reads to show the native-article level chip, not the
  // editorial write-up. Keep this allowlist in sync with what
  // briefingSync.ts, notifications.ts, and useBriefingStore.ts actually read.
  const raw = await githubRes.json() as Record<string, unknown>;
  const filtered = {
    date:              raw.date,
    generatedAt:       raw.generatedAt,
    briefings:         raw.briefings,
    nativeJournalism:  raw.nativeJournalism,
    nativeGrades:      raw.nativeGrades,
    daily_notification: raw.daily_notification,
    volume:            raw.volume,
  };

  return new Response(JSON.stringify(filtered), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ── Route: GET /latest?lang=&level= (filtered slice for the website) ─────────
// Avoids shipping the full multi-language bundle (all languages × all levels ×
// all lengths + factbase + tokenMaps) to every site visitor — returns just the
// requested language/level, in the same per-length shape the app already uses.

interface NativeArticle { genre: string; headline: string; body: string; slug?: string }

async function handleBriefingFiltered(env: Env, lang: string, level: string): Promise<Response> {
  const upstream = `https://api.github.com/repos/${REPO}/contents/latest.json`;
  const githubRes = await fetch(upstream, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.raw+json',
      'User-Agent': 'Bilinguist-Brief-Worker/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cf: { cacheEverything: false },
  } as RequestInit & { cf: { cacheEverything: boolean } });

  if (!githubRes.ok) {
    const status = githubRes.status === 404 ? 404 : 502;
    return json({ error: status === 404 ? 'not_found' : 'upstream_error' }, status);
  }

  const bundle = await githubRes.json() as {
    date: string;
    generatedAt: number;
    briefings?: Record<string, Record<string, Record<string, unknown>>>;
    nativeJournalism?: Record<string, Record<string, NativeArticle[]>>;
  };

  let lengths: Record<string, unknown> | null = null;

  if (level === 'Native') {
    const byLength = bundle.nativeJournalism?.[lang];
    if (byLength) {
      lengths = {};
      for (const [length, articles] of Object.entries(byLength)) {
        if (!Array.isArray(articles) || articles.length === 0) continue;
        lengths[length] = {
          articles: articles.map((a) => ({ genre: a.genre, headline: a.headline, body: a.body })),
          date: bundle.date,
          language: lang,
          level: 'Native',
          length,
          generatedAt: bundle.generatedAt,
        };
      }
      if (Object.keys(lengths).length === 0) lengths = null;
    }
  } else {
    lengths = bundle.briefings?.[lang]?.[level] ?? null;
  }

  if (!lengths) return json({ error: 'not_found' }, 404);

  return json({
    date: bundle.date,
    generatedAt: bundle.generatedAt,
    language: lang,
    level,
    lengths,
  });
}

// ── DB warm-up (runs on cron schedule) ───────────────────────────────────────

const NO_DB_LANGS = new Set(['tr', 'ar', 'hu']);
const MIN_WORD_LEN = 3;

function tokenise(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.split(/[\s ]+/)) {
    const tok = raw.replace(/^[^\w]+|[^\w]+$/gu, '');
    for (const part of tok.split('-')) {
      const w = part.toLowerCase();
      if (w.length >= MIN_WORD_LEN && !/^\d+$/.test(w) && /[a-zA-ZÀ-ÿ]/.test(w)) {
        tokens.add(w);
      }
    }
  }
  return tokens;
}

async function warmDb(env: Env): Promise<void> {
  // 1. Fetch today's brief via the internal handler
  const briefRes = await handleBriefing('latest.json', env);
  if (!briefRes.ok) { console.error('[warm] failed to fetch brief:', briefRes.status); return; }
  const brief = await briefRes.json() as { date?: string; briefings?: Record<string, unknown> };
  const date = brief.date ?? 'unknown';
  console.log(`[warm] date=${date}`);

  // 2. Extract unique (word, lang, level) pairs
  const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const seen = new Map<string, string>(); // key="word|lang" → level

  const briefings = brief.briefings as Record<string, Record<string, Record<string, { articles?: { headline?: string; body?: string }[] }>>> ?? {};
  for (const [lang, levels] of Object.entries(briefings)) {
    if (NO_DB_LANGS.has(lang)) continue;
    for (const [level, lengths] of Object.entries(levels)) {
      for (const section of Object.values(lengths)) {
        for (const article of section.articles ?? []) {
          for (const word of tokenise((article.headline ?? '') + ' ' + (article.body ?? ''))) {
            const key = `${word}|${lang}`;
            const cur = seen.get(key);
            if (!cur || LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(cur)) {
              seen.set(key, level);
            }
          }
        }
      }
    }
  }

  console.log(`[warm] ${seen.size} unique (word, lang) pairs`);

  // 3. Check word_forms directly — NO Claude fallback here, NO D1 either.
  // word_forms (public-read Supabase table) is the actual source of truth
  // the app's own on-device prefetch queries, so this reports the same
  // coverage a real user would see. A word still missing after this needs
  // the (separate, Haiku-subagent-based) population pipeline to run for it —
  // this job never spends live API cost, it only reports the gap.
  const entries = Array.from(seen.entries()).map(([key, level]) => {
    const [word, lang] = key.split('|');
    return { word, lang, level };
  });

  const byLang = new Map<string, string[]>();
  for (const { word, lang } of entries) {
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(word);
  }

  let cached = 0;
  const missingByLang: Record<string, number> = {};
  const CHUNK = 150;

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    for (const [lang, words] of byLang) {
      const found = new Set<string>();
      for (let i = 0; i < words.length; i += CHUNK) {
        const chunk = words.slice(i, i + CHUNK);
        const url = `${env.SUPABASE_URL}/rest/v1/word_forms`
          + `?language=eq.${encodeURIComponent(lang)}&word=in.(${encodeURIComponent(chunk.join(','))})&select=word`;
        try {
          const res = await fetch(url, {
            headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
          });
          if (res.ok) {
            const rows = await res.json() as { word: string }[];
            for (const r of rows) found.add(r.word);
          }
        } catch { /* best-effort chunk */ }
      }
      cached += found.size;
      const missingCount = words.length - found.size;
      if (missingCount > 0) missingByLang[lang] = missingCount;
    }
  }

  const missing = Object.values(missingByLang).reduce((a, b) => a + b, 0);
  console.log(`[warm] done — cached=${cached} missing=${missing}`);

  // 4. Send ntfy summary
  if (!env.NTFY_TOPIC) return;
  const lines: string[] = [];
  if (missing === 0) {
    lines.push('All of today\'s brief words are already in the dictionary — nothing missing.');
  } else {
    lines.push('Not yet in the dictionary — needs the population pipeline to run:');
    const LANG_FLAGS: Record<string, string> = { de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹', sv: '🇸🇪', pt: '🇵🇹' };
    const LANG_NAMES: Record<string, string> = { de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', sv: 'Swedish', pt: 'Portuguese' };
    for (const lang of Object.keys(missingByLang).sort((a, b) => missingByLang[b] - missingByLang[a])) {
      lines.push(`${LANG_FLAGS[lang] ?? ''} ${LANG_NAMES[lang] ?? lang.toUpperCase()}: ${missingByLang[lang]} missing`);
    }
  }
  lines.push('');
  lines.push(`Total: ${cached} cached · ${missing} missing (no API calls made)`);

  await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `Bilinguist DB coverage — ${date}`, message: lines.join('\n') }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      // 1. Expand every Supabase lemma (+ conjugated forms) into word_forms —
      //    the table the app's on-device prefetch queries directly (no D1,
      //    no Worker round-trip). This is what keeps that path current
      //    without anyone running a script by hand.
      //    (D1 bulk sync was removed here — D1 free tier caps at 100k row
      //    writes/day, and re-attempting a full sync of an ~80k-row+ and
      //    growing dictionary every morning blew through that repeatedly.
      //    D1 is no longer the primary delivery path — it self-heals
      //    incrementally from real live taps via the read-through in
      //    handleWordGet, which needs no bulk pre-sync.)
      await syncSupabaseToWordForms(env);
      // 2. Pre-warm today's brief words — only genuinely-uncovered words fall
      //    through to a live Claude call now.
      await warmDb(env);
    })());
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
        },
      });
    }

    if (pathname === '/word/stats'  && request.method === 'GET') return handleWordStats(env);
    if (pathname === '/word/export' && request.method === 'GET') return handleWordExport(request, env);
    if (pathname === '/word'        && request.method === 'GET') return handleWordGet(url, env);
    if (pathname === '/word'        && request.method === 'POST') return handleWordPost(request, env);
    if (pathname === '/word/verify-tenses' && request.method === 'POST') return handleVerifyTenses(request, env);
    if (pathname === '/words/bulk'  && request.method === 'POST') return handleWordsBulk(request, env);

    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

    const audioStream = pathname.match(/^\/audio\/(.+)$/);
    if (audioStream) return handleAudioStream(audioStream[1], env);

    if (pathname === '/latest/meta') return handleBriefingMeta(env);
    if (pathname === '/latest') {
      const lang  = url.searchParams.get('lang');
      const level = url.searchParams.get('level');
      if (lang && level) return handleBriefingFiltered(env, lang, level);
      return handleBriefing('latest.json', env);
    }

    const archive = pathname.match(/^\/briefings\/(\d{4}-\d{2}-\d{2})$/);
    if (archive) return handleBriefing(`briefings/${archive[1]}.json`, env);

    return new Response('Not found', { status: 404 });
  },
};

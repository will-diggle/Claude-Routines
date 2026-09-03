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
  ELEVENLABS_API_KEY: string;
  WORKER_ADMIN_KEY: string;
  NTFY_TOPIC?: string;
  WORDS_DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
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
    await env.WORDS_DB
      .prepare('UPDATE words SET lookup_count = lookup_count + 1 WHERE word = ?1 AND language = ?2')
      .bind(word, lang)
      .run();

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
      await env.WORDS_DB.prepare(`
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
      ).run();

      return json(rowToWordData(
        { ...lemmaHit, word, translation: translation ?? lemmaHit.translation, lemma },
        false,
      ));
    }
  }

  // ── Step 4: full miss — store everything and return ───────────────────────────
  const row: Partial<WordRow> = { word, language: lang, translation, lemma, ...generated };

  await env.WORDS_DB.prepare(`
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
  ).run();

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

// ── ElevenLabs voice for article audio ───────────────────────────────────────

const CHARLOTTE_VOICE_ID = 'XB0fDUnXU5powFXDhCwa';

// ── Route: POST /audio ────────────────────────────────────────────────────────
// Body: { key: string, text: string, lang: string }
// → checks R2 for {key}.mp3; on miss synthesises via ElevenLabs and caches

async function handleAudioPost(request: Request, env: Env): Promise<Response> {
  let body: { key?: string; text?: string; lang?: string };
  try { body = await request.json() as { key?: string; text?: string; lang?: string }; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const { key, text, lang } = body;
  if (!key || !text) return json({ error: 'key and text are required' }, 400);

  const r2Key = `${key}.mp3`;

  // Cache hit — return the CDN-style worker URL directly
  const existing = await env.AUDIO_BUCKET.head(r2Key);
  if (existing) {
    const workerUrl = new URL(request.url);
    return json({ url: `${workerUrl.origin}/audio/${key}`, fromCache: true });
  }

  // Cache miss — synthesise via ElevenLabs
  if (!env.ELEVENLABS_API_KEY) return json({ error: 'elevenlabs_not_configured' }, 503);

  const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CHARLOTTE_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!elRes.ok) {
    const errText = await elRes.text();
    return json({ error: 'elevenlabs_error', detail: errText }, 502);
  }

  const audioBytes = await elRes.arrayBuffer();

  await env.AUDIO_BUCKET.put(r2Key, audioBytes, {
    httpMetadata: { contentType: 'audio/mpeg' },
  });

  const workerUrl = new URL(request.url);
  return json({ url: `${workerUrl.origin}/audio/${key}`, fromCache: false });
}

// ── Route: GET /audio/* ───────────────────────────────────────────────────────
// Streams the cached MP3 from R2

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

  const body = await githubRes.text();
  return new Response(body, {
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
  const WORKER_BASE = 'https://bilinguist-brief.williamdiggz.workers.dev';

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

  // 3. Look up each word — handleWordGet auto-generates via Haiku on cache miss
  const CONCURRENCY = 6;
  const entries = Array.from(seen.entries()).map(([key, level]) => {
    const [word, lang] = key.split('|');
    return { word, lang, level };
  });

  let cached = 0, generated = 0, errors = 0;
  const newByLang: Record<string, number> = {};

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ({ word, lang, level }) => {
      try {
        const u = new URL(`${WORKER_BASE}/word`);
        u.searchParams.set('w', word);
        u.searchParams.set('lang', lang);
        u.searchParams.set('level', level);
        const res = await handleWordGet(u, env);
        if (!res.ok) { errors++; return; }
        const data = await res.json() as { fromCache?: boolean };
        if (data.fromCache) { cached++; }
        else { generated++; newByLang[lang] = (newByLang[lang] ?? 0) + 1; }
      } catch { errors++; }
    }));
  }

  console.log(`[warm] done — cached=${cached} generated=${generated} errors=${errors}`);

  // 4. Send ntfy summary
  if (!env.NTFY_TOPIC) return;
  const lines: string[] = [];
  if (generated === 0) {
    lines.push('All words already cached — nothing new to generate.');
  } else {
    const LANG_FLAGS: Record<string, string> = { de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹', sv: '🇸🇪', nl: '🇳🇱' };
    const LANG_NAMES: Record<string, string> = { de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', sv: 'Swedish', nl: 'Dutch' };
    for (const lang of Object.keys(newByLang).sort((a, b) => newByLang[b] - newByLang[a])) {
      lines.push(`${LANG_FLAGS[lang] ?? ''} ${LANG_NAMES[lang] ?? lang.toUpperCase()}: ${newByLang[lang]} new`);
    }
  }
  lines.push('');
  lines.push(`Total: ${generated} new · ${cached} cached${errors ? ` · ${errors} errors` : ''}`);

  await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `Bilinguist DB warmed — ${date}`, message: lines.join('\n') }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(warmDb(env));
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
    if (pathname === '/audio'      && request.method === 'POST') return handleAudioPost(request, env);

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

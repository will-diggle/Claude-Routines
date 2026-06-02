/**
 * Bilinguist Brief — Cloudflare Worker
 *
 * Routes:
 *   GET  /latest                        → latest.json briefing bundle
 *   GET  /briefings/YYYY-MM-DD          → archived briefing bundle
 *   GET  /word?w={word}&lang={lang}     → word lookup (D1 cache → Claude + translate)
 *   POST /word                          → admin: bulk-insert a word (requires X-Admin-Key)
 *   GET  /word/stats                    → per-language word counts
 */

// ── Language data ─────────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', sv: 'Swedish',
};

const PAST_TENSE_NAME: Record<string, string> = {
  fr: 'passé composé',
  de: 'Präteritum',
  es: 'pretérito indefinido',
  it: 'passato prossimo',
  sv: 'preteritum',
  en: 'simple past',
};

const VERB_PRONOUNS: Record<string, string[]> = {
  fr: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'],
  de: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'],
  es: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'],
  it: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'],
  sv: ['jag', 'du', 'han/hon', 'vi', 'ni', 'de'],
  en: ['I', 'you', 'he/she', 'we', 'you (pl)', 'they'],
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Env {
  GITHUB_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  WORKER_ADMIN_KEY: string;
  WORDS_DB: D1Database;
}

interface WordRow {
  word: string;
  language: string;
  word_type: string | null;
  translation: string | null;
  explanation: string | null;
  example: string | null;
  pronunciation: string | null;
  verb_present: string | null;
  verb_past: string | null;
  forms: string | null;
  tip: string | null;
  lookup_count: number;
}

interface WordData {
  word: string;
  language: string;
  translation: string | null;
  wordType: string | null;
  explanation: string | null;
  example: string | null;
  pronunciation: string | null;
  verbTable: Record<string, string> | null;
  verbTablePast: Record<string, string> | null;
  forms: Record<string, string> | null;
  tip: string | null;
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
  return {
    word:         row.word,
    language:     row.language,
    translation:  row.translation,
    wordType:     row.word_type,
    explanation:  row.explanation,
    example:      row.example,
    pronunciation: row.pronunciation,
    verbTable:    row.verb_present ? JSON.parse(row.verb_present) : null,
    verbTablePast: row.verb_past   ? JSON.parse(row.verb_past)   : null,
    forms:        row.forms        ? JSON.parse(row.forms)        : null,
    tip:          row.tip,
    fromCache,
  };
}

// ── Translation via Google Translate (no key required) ────────────────────────

async function translateWord(word: string, lang: string): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=en&dt=t&q=${encodeURIComponent(word)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as unknown[][];
    return (data?.[0]?.[0] as string[])?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── Claude word explanation ────────────────────────────────────────────────────

async function generateWordData(
  word: string,
  lang: string,
  level: string,
  apiKey: string,
): Promise<Partial<WordRow> | null> {
  const pronouns = VERB_PRONOUNS[lang] ?? VERB_PRONOUNS.fr;
  const langName = LANGUAGE_NAMES[lang] ?? lang;
  const pastName = PAST_TENSE_NAME[lang] ?? 'simple past';
  const [p0, p1, p2, p3, p4, p5] = pronouns;

  const prompt = `A language learner studying ${langName} at ${level} level wants to learn the word "${word}".

Identify the word type and reply ONLY with a JSON object — no markdown, no preamble:
{
  "wordType": one of "verb" | "noun" | "adjective" | "adverb" | "phrase" | "other",
  "explanation": "Meaning in English, 1-2 sentences, suited to ${level} level",
  "example": "A ${langName} example sentence using this word",
  "pronunciation": "IPA pronunciation of ${word}",
  "verbTable": if verb, present tense {"${p0}": "...", "${p1}": "...", "${p2}": "...", "${p3}": "...", "${p4}": "...", "${p5}": "..."} — otherwise null,
  "verbTablePast": if verb, ${pastName} {"${p0}": "...", "${p1}": "...", "${p2}": "...", "${p3}": "...", "${p4}": "...", "${p5}": "..."} — otherwise null,
  "forms": if noun {"gender": "masculine/feminine/neuter", "plural": "plural form", "article": "definite article"} — if adjective {"feminine": "feminine form", "comparative": "comparative", "superlative": "superlative"} — otherwise null,
  "tip": a short memorable tip about this word — etymology, common learner mistake, or memory hook — or null
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
        max_tokens: 900,
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
      wordType?: string;
      explanation?: string;
      example?: string;
      pronunciation?: string;
      verbTable?: Record<string, string> | null;
      verbTablePast?: Record<string, string> | null;
      forms?: Record<string, string> | null;
      tip?: string | null;
    };

    return {
      word_type:     parsed.wordType     ?? null,
      explanation:   parsed.explanation  ?? null,
      example:       parsed.example      ?? null,
      pronunciation: parsed.pronunciation ?? null,
      verb_present:  parsed.verbTable     ? JSON.stringify(parsed.verbTable)     : null,
      verb_past:     parsed.verbTablePast ? JSON.stringify(parsed.verbTablePast) : null,
      forms:         parsed.forms         ? JSON.stringify(parsed.forms)         : null,
      tip:           parsed.tip           ?? null,
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

  if (!rawWord) return json({ error: 'missing_word' }, 400);
  const word = rawWord.toLowerCase();

  const hit = await env.WORDS_DB
    .prepare('SELECT * FROM words WHERE word = ?1 AND language = ?2')
    .bind(word, lang)
    .first<WordRow>();

  if (hit) {
    await env.WORDS_DB
      .prepare('UPDATE words SET lookup_count = lookup_count + 1 WHERE word = ?1 AND language = ?2')
      .bind(word, lang)
      .run();
    return json(rowToWordData(hit, true));
  }

  const [translation, generated] = await Promise.all([
    translateWord(word, lang),
    generateWordData(word, lang, level, env.ANTHROPIC_API_KEY),
  ]);

  const row: Partial<WordRow> = { word, language: lang, translation, ...generated };

  await env.WORDS_DB.prepare(`
    INSERT OR IGNORE INTO words
      (word, language, translation, word_type, explanation, example, pronunciation,
       verb_present, verb_past, forms, tip)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  `).bind(
    row.word, row.language, row.translation ?? null, row.word_type ?? null,
    row.explanation ?? null, row.example ?? null, row.pronunciation ?? null,
    row.verb_present ?? null, row.verb_past ?? null, row.forms ?? null, row.tip ?? null,
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
      (word, language, translation, word_type, explanation, example, pronunciation,
       verb_present, verb_past, forms, tip)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  `).bind(
    word, language,
    (body.translation as string) ?? null,
    (body.wordType as string) ?? null,
    (body.explanation as string) ?? null,
    (body.example as string) ?? null,
    (body.pronunciation as string) ?? null,
    body.verbTable    ? JSON.stringify(body.verbTable)    : null,
    body.verbTablePast ? JSON.stringify(body.verbTablePast) : null,
    body.forms        ? JSON.stringify(body.forms)        : null,
    (body.tip as string) ?? null,
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

// ── Briefing routes (existing) ────────────────────────────────────────────────

const REPO   = 'will-diggle/bilinguist-data';
const BRANCH = 'main';

async function handleBriefing(filePath: string, env: Env): Promise<Response> {
  const upstream = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${filePath}`;
  const githubRes = await fetch(upstream, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'Bilinguist-Brief-Worker/1.0',
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

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
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

    if (pathname === '/word/stats' && request.method === 'GET') return handleWordStats(env);
    if (pathname === '/word'       && request.method === 'GET')  return handleWordGet(url, env);
    if (pathname === '/word'       && request.method === 'POST') return handleWordPost(request, env);

    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (pathname === '/latest')   return handleBriefing('latest.json', env);

    const archive = pathname.match(/^\/briefings\/(\d{4}-\d{2}-\d{2})$/);
    if (archive) return handleBriefing(`briefings/${archive[1]}.json`, env);

    return new Response('Not found', { status: 404 });
  },
};

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
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', sv: 'Swedish', tr: 'Turkish',
};

const PAST_TENSE_NAME: Record<string, string> = {
  fr: 'passé composé',
  de: 'Präteritum',
  es: 'pretérito indefinido',
  it: 'passato prossimo',
  sv: 'preteritum',
  en: 'simple past',
  tr: 'geçmiş zaman',
};

const VERB_PRONOUNS: Record<string, string[]> = {
  fr: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'],
  de: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'],
  es: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'],
  it: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'],
  sv: ['jag', 'du', 'han/hon', 'vi', 'ni', 'de'],
  en: ['I', 'you', 'he/she', 'we', 'you (pl)', 'they'],
  tr: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'],
};

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
  lookup_count: number;
}

interface WordData {
  word: string;
  language: string;
  lemma: string | null;
  translation: string | null;
  wordType: string | null;
  explanation: string | null;
  example: string | null;
  pronunciation: string | null;
  verbTable: Record<string, string> | null;
  verbTablePast: Record<string, string> | null;
  forms: Record<string, string> | null;
  tip: string | null;
  meta: Record<string, unknown> | null;
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
    word:          row.word,
    language:      row.language,
    lemma:         row.lemma,
    translation:   row.translation,
    wordType:      row.word_type,
    explanation:   row.explanation,
    example:       row.example,
    pronunciation: row.pronunciation,
    verbTable:     row.verb_present ? JSON.parse(row.verb_present) : null,
    verbTablePast: row.verb_past    ? JSON.parse(row.verb_past)    : null,
    forms:         row.forms        ? JSON.parse(row.forms)        : null,
    tip:           row.tip,
    meta:          row.meta         ? JSON.parse(row.meta)         : null,
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
  translateAlsoFailed: boolean,
): void {
  const services = translateAlsoFailed ? 'Claude + Google Translate' : 'Claude';
  // Fire-and-forget — don't delay the response waiting on ntfy
  fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: {
      'Title': 'Bilinguist — Word Lookup Failed',
      'Priority': 'high',
      'Tags': 'rotating_light',
      'Content-Type': 'text/plain',
    },
    body: `${services} failed for "${word}" (${lang}) after all retries. User saw partial or empty word data.`,
  }).catch(() => { /* non-fatal */ });
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
  "lemma": "the base dictionary form — for a verb the infinitive (e.g. 'haben' for 'hätte'), for a noun the nominative singular, for an adjective the base form. If '${word}' IS already the base form, repeat it here exactly.",
  "wordType": one of "verb" | "noun" | "adjective" | "adverb" | "phrase" | "other",
  "explanation": "Meaning in English, 1-2 sentences, suited to ${level} level",
  "example": "A ${langName} example sentence using this word",
  "pronunciation": "IPA pronunciation of ${word}",
  "verbTable": if verb, present tense of the INFINITIVE FORM {"${p0}": "...", "${p1}": "...", "${p2}": "...", "${p3}": "...", "${p4}": "...", "${p5}": "..."} — otherwise null,
  "verbTablePast": if verb, ${pastName} of the INFINITIVE FORM {"${p0}": "...", "${p1}": "...", "${p2}": "...", "${p3}": "...", "${p4}": "...", "${p5}": "..."} — otherwise null,
  "forms": if noun {"gender": "masculine/feminine/neuter", "plural": "plural form", "article": "definite article"} — if adjective {"feminine": "feminine form", "comparative": "comparative", "superlative": "superlative"} — otherwise null,
  "tip": a short memorable tip about this word — etymology, common learner mistake, or memory hook — or null,
  "meta": if verb {"isRegular": true/false, "auxiliary": the auxiliary verb for compound tenses e.g. "haben"/"sein"/"avoir"/"être" (null if not applicable), "verbClass": verb group e.g. "-er"/"-ir" for French, "-are"/"-ere" for Italian, "Group 1"/"Group 2" for Swedish (null if not applicable), "isSeparable": true/false for German separable verbs (null for all other languages)} — otherwise null
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
      lemma?: string | null;
      wordType?: string;
      explanation?: string;
      example?: string;
      pronunciation?: string;
      verbTable?: Record<string, string> | null;
      verbTablePast?: Record<string, string> | null;
      forms?: Record<string, string> | null;
      tip?: string | null;
      meta?: Record<string, unknown> | null;
    };

    return {
      lemma:         parsed.lemma?.toLowerCase() ?? null,
      word_type:     parsed.wordType     ?? null,
      explanation:   parsed.explanation  ?? null,
      example:       parsed.example      ?? null,
      pronunciation: parsed.pronunciation ?? null,
      verb_present:  parsed.verbTable     ? JSON.stringify(parsed.verbTable)     : null,
      verb_past:     parsed.verbTablePast ? JSON.stringify(parsed.verbTablePast) : null,
      forms:         parsed.forms         ? JSON.stringify(parsed.forms)         : null,
      tip:           parsed.tip           ?? null,
      meta:          parsed.meta          ? JSON.stringify(parsed.meta)          : null,
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

  // ── Step 1: exact match ──────────────────────────────────────────────────────
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

  // ── Step 2: cache miss — call translation + Claude (gets lemma too) ───────────
  // Google Translate: up to 2 attempts. Claude: up to 3 attempts with backoff.
  const [translationResult, generatedResult] = await Promise.all([
    withRetry(() => translateWord(word, lang), 2),
    withRetry(() => generateWordData(word, lang, level, env.ANTHROPIC_API_KEY), 3),
  ]);

  const translation = translationResult.result;
  const generated   = generatedResult.result;

  // Notify if Claude failed after all retries — it provides the rich learning data
  if (generatedResult.allFailed && env.NTFY_TOPIC) {
    notifyWordFailure(env.NTFY_TOPIC, word, lang, translationResult.allFailed);
  }

  const lemma = generated?.lemma ?? word;

  // ── Step 3: if inflected form, check whether the lemma is already cached ──────
  if (lemma !== word) {
    const lemmaHit = await env.WORDS_DB
      .prepare('SELECT * FROM words WHERE word = ?1 AND language = ?2')
      .bind(lemma, lang)
      .first<WordRow>();

    if (lemmaHit) {
      // Lemma cached — store this inflected form pointing to lemma's rich data
      await env.WORDS_DB.prepare(`
        INSERT OR IGNORE INTO words
          (word, language, translation, lemma, word_type, explanation, example, pronunciation,
           verb_present, verb_past, forms, tip, meta)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
      `).bind(
        word, lang,
        translation ?? lemmaHit.translation,
        lemma,
        lemmaHit.word_type, lemmaHit.explanation, lemmaHit.example,
        lemmaHit.pronunciation, lemmaHit.verb_present, lemmaHit.verb_past,
        lemmaHit.forms, lemmaHit.tip, lemmaHit.meta,
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
    INSERT OR IGNORE INTO words
      (word, language, translation, lemma, word_type, explanation, example, pronunciation,
       verb_present, verb_past, forms, tip, meta)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
  `).bind(
    row.word, row.language,
    row.translation ?? null, row.lemma ?? null,
    row.word_type ?? null, row.explanation ?? null, row.example ?? null,
    row.pronunciation ?? null, row.verb_present ?? null, row.verb_past ?? null,
    row.forms ?? null, row.tip ?? null, row.meta ?? null,
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

    if (pathname === '/word/stats'  && request.method === 'GET') return handleWordStats(env);
    if (pathname === '/word/export' && request.method === 'GET') return handleWordExport(request, env);
    if (pathname === '/word'        && request.method === 'GET') return handleWordGet(url, env);
    if (pathname === '/word'        && request.method === 'POST') return handleWordPost(request, env);
    if (pathname === '/audio'      && request.method === 'POST') return handleAudioPost(request, env);

    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

    const audioStream = pathname.match(/^\/audio\/(.+)$/);
    if (audioStream) return handleAudioStream(audioStream[1], env);

    if (pathname === '/latest')   return handleBriefing('latest.json', env);

    const archive = pathname.match(/^\/briefings\/(\d{4}-\d{2}-\d{2})$/);
    if (archive) return handleBriefing(`briefings/${archive[1]}.json`, env);

    return new Response('Not found', { status: 404 });
  },
};

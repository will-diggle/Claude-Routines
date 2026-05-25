#!/usr/bin/env node
/**
 * Server-side daily briefing generator.
 * Run by GitHub Actions at 04:30 UTC daily.
 *
 * Outputs:
 *   scripts/output/YYYY-MM-DD.json   — archived dated copy
 *   scripts/output/latest.json       — overwritten daily (app fetches this)
 *
 * Stage 1 — Gather (sequential, 2 regular API calls):
 *   Call A: web search ON  — free-form research notes
 *   Call B: web search OFF — structures notes into factbase JSON
 *
 * Stage 2 — Write (Anthropic Message Batches API):
 *   All language/level/length combinations submitted as a single batch.
 *   Each request uses submit_article tool (one call per story).
 *   Polls for completion, then assembles the bundle.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/generate-briefings.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { jsonrepair } from 'jsonrepair';
import {
  GATHERING_SYSTEM,
  WRITING_SYSTEM,
  LANGUAGE_NAMES,
  WORDS_PER_ARTICLE,
  normaliseLevel,
  type ArticleLength,
} from '../src/services/prompts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── JSON parser ───────────────────────────────────────────────────────────────

function findJsonEnd(raw: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') { inString = true; }
      else if (ch === '{') { depth++; }
      else if (ch === '}') { if (--depth === 0) return i; }
    }
  }
  return -1;
}

function parseServerJSON(raw: string): any | null {
  if (!raw) return null;
  let jsonStr: string | null = null;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const start = raw.indexOf('{');
    if (start !== -1) {
      const end = findJsonEnd(raw, start);
      if (end !== -1) jsonStr = raw.slice(start, end + 1);
    }
  }
  if (!jsonStr) return null;
  try { return JSON.parse(jsonStr); } catch {}
  try { return JSON.parse(jsonrepair(jsonStr)); } catch (e) {
    console.error('[parse] jsonrepair failed:', String(e).slice(0, 300));
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LanguageCode = 'en' | 'fr' | 'de' | 'es' | 'it';
type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

interface BriefingArticle { genre: string; headline: string; body: string; }
interface FactbaseStory {
  genre: string; slug: string; what_happened: string[]; attribution: string[];
  verified: string[]; contested: string[]; neutral_descriptors: string[];
  numbers: string[]; proper_nouns: string[]; key_terms: string[];
  why_it_matters: string;
}

// ── Action 1: Story validator ─────────────────────────────────────────────────
// All fields that the gathering prompt should return as arrays.
// If any are missing or non-array (LLM occasionally drops them), coerce to []
// and log a warning — repeated warnings are a signal to tighten the prompt.

const FACTBASE_ARRAY_FIELDS = [
  'what_happened', 'attribution', 'verified', 'contested',
  'neutral_descriptors', 'numbers', 'proper_nouns', 'key_terms',
] as const;

function validateStory(raw: any, index: number): FactbaseStory {
  const story = { ...raw };
  for (const field of FACTBASE_ARRAY_FIELDS) {
    if (!Array.isArray(story[field])) {
      console.warn(
        `[validate] story[${index}] "${story.slug ?? '?'}" — ` +
        `field "${field}" is ${JSON.stringify(story[field])} → coerced to []`,
      );
      story[field] = [];
    }
  }
  if (typeof story.genre !== 'string' || !story.genre) {
    console.warn(`[validate] story[${index}] missing genre — setting empty string`);
    story.genre = '';
  }
  if (typeof story.slug !== 'string' || !story.slug) {
    console.warn(`[validate] story[${index}] missing slug — auto-generating`);
    story.slug = `story-${index}`;
  }
  if (typeof story.why_it_matters !== 'string') {
    story.why_it_matters = '';
  }
  return story as FactbaseStory;
}
interface GeneratedBriefing {
  articles: BriefingArticle[]; date: string;
  language: LanguageCode; level: LanguageLevel; length: ArticleLength;
  generatedAt: number;
}
interface DailyBundle {
  date: string; generatedAt: number; factbase: FactbaseStory[];
  briefings: { [lang: string]: { [level: string]: { [length: string]: GeneratedBriefing } } };
}

// ── Combinations ──────────────────────────────────────────────────────────────
// Per-language level lists (must match LEVELS_BY_LANG in SettingsScreen.tsx):
//   en → A2, B1, B2, C1, C2
//   fr → A1, A2, B1, B2, C1, C2
//   de → A1, A2, B1  (learners don't typically reach C1 in German)
// A1/A2 → short only; B1+ → medium + longer
// C1 = journalistic/native tier; C2 = distinct harder scholar tier

const LANGUAGE_LEVELS: Record<LanguageCode, LanguageLevel[]> = {
  en: ['A2', 'B1', 'B2', 'C1', 'C2'],
  fr: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  de: ['A1', 'A2', 'B1'],
  es: [],
  it: [],
};

const LANGUAGES = Object.keys(LANGUAGE_LEVELS).filter(
  (lang) => LANGUAGE_LEVELS[lang as LanguageCode].length > 0,
) as LanguageCode[];

const COMBINATIONS: Array<{ language: LanguageCode; level: LanguageLevel; length: ArticleLength }> = [];
for (const language of LANGUAGES) {
  for (const level of LANGUAGE_LEVELS[language]) {
    if (level === 'A1' || level === 'A2') {
      COMBINATIONS.push({ language, level, length: 'short' });
    } else {
      COMBINATIONS.push({ language, level, length: 'medium' });
      COMBINATIONS.push({ language, level, length: 'longer' });
    }
  }
}
// en: A2(1)+B1–C2(8) = 9 | fr: A1–A2(2)+B1–C2(8) = 10 | de: A1–A2(2)+B1(2) = 4 → 23 writing requests

// ── Model routing ─────────────────────────────────────────────────────────────
// A1/A2 → Haiku  (shorter articles, simpler prose — quality holds, cost drops)
// B1+   → Sonnet (richer writing needed for intermediate through scholar levels)
//
// CACHE NAMESPACE NOTE: Haiku and Sonnet maintain SEPARATE prompt-cache stores.
// Within each tier the cached system blocks must be byte-identical across all calls.
// Variables ({LANGUAGE}, {LEVEL}, {WORD_COUNT}) are injected via the user message only,
// keeping Block 1 (factbase) and Block 2 (writing instructions) fully static per tier.

const LEVEL_LABELS: Record<LanguageLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper Intermediate',
  C1: 'Advanced / Native',
  C2: 'Scholar',
};

function writingModel(level: LanguageLevel): string {
  return level === 'A1' || level === 'A2'
    ? 'claude-haiku-4-5-20251001'
    : 'claude-sonnet-4-6';
}

// ── API helpers ───────────────────────────────────────────────────────────────

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  return { 'x-api-key': apiKey, 'content-type': 'application/json', ...extra };
}

async function callAnthropicAPI(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<any> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: apiHeaders(headers), body: JSON.stringify(body),
    });
    if (res.status === 429) {
      if (attempt === 3) throw new Error('Rate limit after 3 attempts');
      console.log(`[rate limit] 429 on attempt ${attempt} — waiting 60s…`);
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    return await res.json();
  }
  throw new Error('callAnthropicAPI: exhausted retries');
}

async function callClaude(system: string, user: string, useSearch = false): Promise<string> {
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: 64000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };
  if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

  const data = await callAnthropicAPI(body, {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': useSearch
      ? 'web-search-2025-03-05,prompt-caching-2024-07-31'
      : 'prompt-caching-2024-07-31',
  });
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

// ── Batch API helpers ─────────────────────────────────────────────────────────

const ARTICLE_TOOL = {
  name: 'submit_article',
  description: 'Submit one written news article. Call this tool once for each story in the fact-base.',
  input_schema: {
    type: 'object',
    properties: {
      genre:    { type: 'string' },
      headline: { type: 'string' },
      body:     { type: 'string' },
    },
    required: ['genre', 'headline', 'body'],
  },
} as const;

function buildWritingRequest(
  customId: string,
  factbase: FactbaseStory[],
  language: LanguageCode,
  level: LanguageLevel,
  length: ArticleLength,
  date: string,
) {
  const model = writingModel(level);

  // Block 1: factbase — STATIC across all 23 requests in this run.
  // (${date} and ${factbase.length} are identical for every call in the batch.)
  // Written to cache once per model tier; read for every subsequent call in that tier.
  const factbaseBlock =
    `TODAY'S FACT-BASE (${date}) — ${factbase.length} stories:\n` +
    JSON.stringify(factbase, null, 2) +
    `\n\nThese are the only facts to use. Do not add events, figures, or claims not present above.`;

  // Block 2: writing instructions — NO variable substitution → byte-identical for every
  // call using the same model tier.
  //   Sonnet tier: one cache entry shared by all B1/B2/C1/C2 requests (9+ calls)
  //   Haiku tier:  one cache entry shared by all A1/A2 requests (3 calls)
  // Variables go to the user message only — see below.
  const instructionsBlock = WRITING_SYSTEM;

  // User message: inject all per-request variables here. ~30 tokens. Not cached.
  const levelLabel = LEVEL_LABELS[level];
  const wordCount = WORDS_PER_ARTICLE[length];
  const user =
    `Write all articles in ${LANGUAGE_NAMES[language]} at ${normaliseLevel(level)} (${levelLabel}), ` +
    `approximately ${wordCount} words per article. ` +
    `Call submit_article once per story — all ${factbase.length} stories, do not stop early.`;

  return {
    custom_id: customId,
    params: {
      model,
      max_tokens: 64000,
      system: [
        // Block 1: factbase — static per run → cached once per tier, read N-1 times
        { type: 'text', text: factbaseBlock, cache_control: { type: 'ephemeral' } },
        // Block 2: writing instructions — static across all calls → single cache entry per tier
        { type: 'text', text: instructionsBlock, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: user }],
      tools: [ARTICLE_TOOL],
      tool_choice: { type: 'any' },
    },
  };
}

async function submitBatch(requests: any[]): Promise<string> {
  console.log(`[batch] Submitting ${requests.length} requests…`);
  const res = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: apiHeaders({
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24,prompt-caching-2024-07-31',
    }),
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Batch submit ${res.status}: ${await res.text()}`);
  const data = await res.json();
  console.log(`[batch] Submitted — batch ID: ${data.id}`);
  return data.id;
}

async function waitForBatch(batchId: string): Promise<any[]> {
  const POLL_INTERVAL_MS = 20_000; // 20 seconds
  const MAX_POLLS = 270;           // 90 minutes max (GitHub Actions limit is 6 h)

  for (let i = 1; i <= MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
      headers: apiHeaders({
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      }),
    });
    if (!res.ok) throw new Error(`Batch poll ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const { processing, succeeded, errored, canceled, expired } = data.request_counts ?? {};
    console.log(`[batch] Poll ${i}: ${data.processing_status} — processing:${processing} succeeded:${succeeded} errored:${errored}`);

    if (data.processing_status === 'ended') {
      if (errored > 0 || canceled > 0 || expired > 0) {
        console.warn(`[batch] Completed with issues — errored:${errored} canceled:${canceled} expired:${expired}`);
      }

      // Fetch JSONL results
      const resultsRes = await fetch(
        `https://api.anthropic.com/v1/messages/batches/${batchId}/results`,
        {
          headers: apiHeaders({
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'message-batches-2024-09-24',
          }),
        },
      );
      if (!resultsRes.ok) throw new Error(`Batch results ${resultsRes.status}: ${await resultsRes.text()}`);

      const text = await resultsRes.text();
      return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    }
  }

  throw new Error(`Batch ${batchId} did not complete within ${(MAX_POLLS * POLL_INTERVAL_MS) / 60000} minutes — consider increasing MAX_POLLS`);
}

function extractArticles(result: any): BriefingArticle[] | null {
  if (result?.type !== 'succeeded') {
    console.error('[batch] Request did not succeed:', JSON.stringify(result).slice(0, 200));
    return null;
  }
  const content = result.message?.content ?? [];
  const articles = content
    .filter((b: any) => b.type === 'tool_use' && b.name === 'submit_article')
    .map((b: any) => b.input as BriefingArticle)
    .filter((a: any) => a.genre && a.headline && a.body);
  return articles.length > 0 ? articles : null;
}

// ── Stage 1: Gather ───────────────────────────────────────────────────────────

const RESEARCH_SYSTEM = `You are a news researcher. Your job is to find today's most significant news stories across these genres using web search:
- GLOBAL NEWS (3-4 stories)
- POLITICS (2 stories)
- BUSINESS & ECONOMY (2 stories)
- GOOD NEWS (2 stories)

Today's date is {DATE}. Search for news from today and the preceding 24 hours only. Do not rely on training data for current events.

For each story note: what happened (in chronological order), key figures, exact numbers, places, organisations, what is independently verified vs what is contested/single-source, and why it matters. Be thorough — this research will be used to write multilingual news articles.`;

async function gatherFactbase(date: string): Promise<FactbaseStory[]> {
  console.log(`[gather] Step 1/2 — researching today's news…`);
  const researchSystem = RESEARCH_SYSTEM.replace(/\{DATE\}/g, date);
  const research = await callClaude(researchSystem, `Today is ${date}. Please search for today's top news stories across all genres.`, true);

  console.log(`[gather] Step 2/2 — structuring factbase JSON…`);
  const structureSystem = GATHERING_SYSTEM.replace(/\{DATE\}/g, date);
  const structureUser = `Today is ${date}. Based on the following research notes, produce the factbase JSON exactly as specified in your instructions. Do not search for additional information — use only what is provided below.

RESEARCH NOTES:
${research}`;

  const raw = await callClaude(structureSystem, structureUser, false);
  const parsed = parseServerJSON(raw);
  if (!parsed || !Array.isArray(parsed.factbase)) {
    console.error('[gather] Full raw response:\n', raw);
    throw new Error(`Gathering returned invalid JSON (${raw.length} chars)`);
  }
  const stories: FactbaseStory[] = parsed.factbase.map(
    (raw: any, i: number) => validateStory(raw, i),
  );
  console.log(`[gather] ${stories.length} stories gathered and validated`);
  return stories;
}

// ── Stage 2: Write (Batch API) ────────────────────────────────────────────────

async function writeBriefingsBatch(
  factbase: FactbaseStory[],
  date: string,
): Promise<GeneratedBriefing[]> {
  // Build one batch request per combination
  const requests = COMBINATIONS.map(({ language, level, length }) =>
    buildWritingRequest(`${language}-${level}-${length}`, factbase, language, level, length, date),
  );

  const batchId = await submitBatch(requests);
  const results = await waitForBatch(batchId);

  const briefings: GeneratedBriefing[] = [];
  const generatedAt = Date.now();

  for (const item of results) {
    const customId: string = item.custom_id;
    const [language, level, length] = customId.split('-') as [LanguageCode, LanguageLevel, ArticleLength];

    const articles = extractArticles(item.result);
    if (!articles) {
      console.error(`[batch] No articles extracted for ${customId}`);
      continue;
    }

    console.log(`[batch] ${customId} — ${articles.length} articles`);
    briefings.push({ articles, date, language, level, length, generatedAt });
  }

  return briefings;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const date = new Date().toISOString().split('T')[0];
  console.log(`[bilinguist] Generating daily bundle — ${date}`);
  console.log(`[bilinguist] ${COMBINATIONS.length} writing requests (Batch API)`);
  console.log(`[bilinguist] Languages: ${LANGUAGES.join(', ')}`);
  for (const lang of LANGUAGES) {
    console.log(`[bilinguist]   ${lang}: ${LANGUAGE_LEVELS[lang].join(', ')}`);
  }

  const factbase = await gatherFactbase(date);

  // ── Cache diagnostic ──────────────────────────────────────────────────────
  // Block 2 (WRITING_SYSTEM) must be byte-identical within each model tier.
  // Log its size here; after the run, verify cache_read_input_tokens > cache_creation_input_tokens
  // in the Anthropic dashboard batch row.
  const block2Bytes = Buffer.byteLength(WRITING_SYSTEM, 'utf8');
  const haikuCalls  = COMBINATIONS.filter(c => c.level === 'A1' || c.level === 'A2').length;
  const sonnetCalls = COMBINATIONS.filter(c => c.level !== 'A1' && c.level !== 'A2').length;
  console.log(`[cache-diag] Block 2 (WRITING_SYSTEM) bytes: ${block2Bytes} — fully static, zero variables`);
  console.log(`[cache-diag] Haiku  (A1/A2): ${haikuCalls} calls — Block 2 shared across all ${haikuCalls}`);
  console.log(`[cache-diag] Sonnet (B1+):   ${sonnetCalls} calls — Block 2 shared across all ${sonnetCalls}`);
  console.log(`[cache-diag] Expected: 2 cache writes per tier + reads for the rest`);
  // ─────────────────────────────────────────────────────────────────────────

  const bundle: DailyBundle = { date, generatedAt: Date.now(), factbase, briefings: {} };

  const briefings = await writeBriefingsBatch(factbase, date);
  for (const briefing of briefings) {
    const { language, level, length } = briefing;
    bundle.briefings[language] ??= {};
    bundle.briefings[language][level] ??= {};
    bundle.briefings[language][level][length] = briefing;
  }

  console.log(`[bilinguist] ${briefings.length}/${COMBINATIONS.length} briefings generated`);

  const outputDir = path.join(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const json = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(path.join(outputDir, `${date}.json`), json, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'latest.json'), json, 'utf8');

  const approxKB = Math.round(Buffer.byteLength(json, 'utf8') / 1024);
  console.log(`[bilinguist] Done — output/${date}.json (${approxKB} KB)`);
}

main().catch((err) => {
  console.error('[bilinguist] Fatal:', err);
  process.exit(1);
});

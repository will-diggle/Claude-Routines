#!/usr/bin/env node
/**
 * Server-side daily briefing generator.
 * Run by GitHub Actions at 04:30 UTC daily.
 *
 * Outputs:
 *   scripts/output/YYYY-MM-DD.json   — archived dated copy
 *   scripts/output/latest.json       — overwritten daily (app fetches this)
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
// Handles: code fences, preamble text, trailing commas, unescaped chars

// Walk the raw string tracking brace depth and string state to find the
// exact end of the first top-level JSON object, ignoring any trailing text.
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

  // Prefer content inside ```json ... ``` fences
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

  // Try strict parse first
  try { return JSON.parse(jsonStr); } catch {}

  // Repair common LLM mistakes (trailing commas, unescaped chars, etc.)
  try { return JSON.parse(jsonrepair(jsonStr)); } catch (e) {
    console.error('[parse] jsonrepair failed:', String(e).slice(0, 300));
    console.error('[parse] Extraction (first 2000 chars):\n', jsonStr.slice(0, 2000));
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LanguageCode = 'en' | 'fr' | 'de' | 'es' | 'it';
type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

interface BriefingArticle { genre: string; headline: string; body: string; }
interface FactbaseStory {
  genre: string; slug: string; what_happened: string[]; attribution: string[];
  verified: string[]; contested: string[]; neutral_descriptors: string[];
  numbers?: string[]; proper_nouns?: string[]; key_terms?: string[];
  why_it_matters: string;
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
// TEST: 2 languages × 3 spread levels = 10 writing calls (~$0.60/run)
// PRODUCTION: restore LANGUAGES to ['en','fr','de','es','it'] and LEVELS to ['A1','A2','B1','B2','C1']

const LANGUAGES: LanguageCode[] = ['en', 'fr'];
const LEVELS: LanguageLevel[] = ['A2', 'B1', 'C1'];

const COMBINATIONS: Array<{ language: LanguageCode; level: LanguageLevel; length: ArticleLength }> = [];
for (const language of LANGUAGES) {
  for (const level of LEVELS) {
    if (level === 'A1' || level === 'A2') {
      COMBINATIONS.push({ language, level, length: 'short' });
    } else {
      COMBINATIONS.push({ language, level, length: 'medium' });
      COMBINATIONS.push({ language, level, length: 'longer' });
    }
  }
}
// 5 languages × (2 short + 6 medium/longer) = 40 writing calls

// ── API helpers ───────────────────────────────────────────────────────────────

async function callAnthropicAPI(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const allHeaders = { 'x-api-key': apiKey, 'content-type': 'application/json', ...headers };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: allHeaders, body: JSON.stringify(body),
    });

    if (res.status === 429) {
      if (attempt === 3) throw new Error('Claude API rate limit hit after 3 attempts');
      console.log(`[rate limit] Attempt ${attempt} hit 429 — waiting 60s before retry…`);
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }

    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    return await res.json();
  }

  throw new Error('callAnthropicAPI: exhausted retries');
}

// Text generation (research + gather steps)
async function callClaude(system: string, user: string, useSearch = false): Promise<string> {
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: 64000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };
  if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': useSearch
      ? 'web-search-2025-03-05,prompt-caching-2024-07-31'
      : 'prompt-caching-2024-07-31',
  };

  const data = await callAnthropicAPI(body, headers);
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

// Tool-use writing call: forces structured output so the API serialises article fields —
// quotes/newlines in article text are handled automatically, no JSON parsing needed.
const ARTICLES_TOOL = {
  name: 'report_articles',
  description: 'Submit all written articles as structured data.',
  input_schema: {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            genre:    { type: 'string' },
            headline: { type: 'string' },
            body:     { type: 'string' },
          },
          required: ['genre', 'headline', 'body'],
        },
      },
    },
    required: ['articles'],
  },
} as const;

async function callClaudeForArticles(system: string, user: string): Promise<BriefingArticle[] | null> {
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: 64000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    tools: [ARTICLES_TOOL],
    tool_choice: { type: 'tool', name: 'report_articles' },
  };

  const data = await callAnthropicAPI(body, {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'prompt-caching-2024-07-31',
  });

  const toolBlock = (data.content ?? []).find(
    (b: any) => b.type === 'tool_use' && b.name === 'report_articles',
  );
  if (toolBlock && Array.isArray(toolBlock.input?.articles)) {
    return toolBlock.input.articles as BriefingArticle[];
  }

  // Diagnostics — logged on every null return so we can see exactly why
  console.error('[write] No articles in response. stop_reason:', data.stop_reason);
  console.error('[write] Content blocks:', (data.content ?? []).map((b: any) => b.type).join(', ') || '(empty)');
  if (toolBlock) {
    console.error('[write] tool_use found but articles field is:', JSON.stringify(toolBlock.input).slice(0, 300));
  }
  return null;
}

// ── Stage 1: Gather ───────────────────────────────────────────────────────────
//
// Two-call approach: web search can consume as many tokens as it needs for
// research without competing with the JSON output requirement.
//
// Call A (research): web search ON, free-form output
// Call B (structure): web search OFF, converts research notes to factbase JSON

const RESEARCH_SYSTEM = `You are a news researcher. Your job is to find today's most significant news stories across these genres using web search:
- GLOBAL NEWS (3-4 stories)
- POLITICS (2 stories)
- BUSINESS & ECONOMY (2 stories)
- SCIENCE & TECHNOLOGY (2 stories)
- ARTS & CULTURE (2 stories)
- GOOD NEWS (2 stories)

Today's date is {DATE}. Search for news from today and the preceding 24 hours only. Do not rely on training data for current events.

For each story note: what happened (in chronological order), key figures, exact numbers, places, organisations, what is independently verified vs what is contested/single-source, and why it matters. Be thorough — this research will be used to write multilingual news articles.`;

async function gatherFactbase(date: string): Promise<FactbaseStory[]> {
  console.log(`[gather] Step 1/2 — researching today's news…`);
  const researchSystem = RESEARCH_SYSTEM.replace(/\{DATE\}/g, date);
  const researchUser = `Today is ${date}. Please search for today's top news stories across all genres.`;
  const research = await callClaude(researchSystem, researchUser, true);
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
  console.log(`[gather] ${parsed.factbase.length} stories gathered`);
  return parsed.factbase as FactbaseStory[];
}

// ── Stage 2: Write ────────────────────────────────────────────────────────────

async function writeBriefing(
  factbase: FactbaseStory[],
  language: LanguageCode,
  level: LanguageLevel,
  length: ArticleLength,
  date: string,
): Promise<GeneratedBriefing> {
  const system = WRITING_SYSTEM
    .replace(/\{LANGUAGE\}/g, LANGUAGE_NAMES[language])
    .replace(/\{LEVEL\}/g, normaliseLevel(level))
    .replace(/\{WORD_COUNT\}/g, String(WORDS_PER_ARTICLE[length]));

  const user = `Today is ${date}.
Write one original news article for every story in the fact-base below. Cover every story — do not skip any.

FACT-BASE - rewrite as original journalism in ${LANGUAGE_NAMES[language]}. Do not translate directly:
${JSON.stringify(factbase, null, 2)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const articles = await callClaudeForArticles(system, user);
    if (articles && articles.length > 0) {
      return { articles, date, language, level, length, generatedAt: Date.now() };
    }
    if (attempt < 3) {
      console.warn(`[write] ${language}/${level}/${length} — no articles returned (attempt ${attempt}), retrying…`);
    }
  }
  throw new Error(`Writing failed for ${language}/${level}/${length} after 3 attempts`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const date = new Date().toISOString().split('T')[0];
  console.log(`[bilinguist] Generating daily bundle — ${date}`);
  console.log(`[bilinguist] ${COMBINATIONS.length} writing calls planned`);

  const factbase = await gatherFactbase(date);

  const bundle: DailyBundle = { date, generatedAt: Date.now(), factbase, briefings: {} };

  // Run writing calls in batches of 5 to stay within rate limits
  const BATCH_SIZE = 3;
  for (let i = 0; i < COMBINATIONS.length; i += BATCH_SIZE) {
    const batch = COMBINATIONS.slice(i, i + BATCH_SIZE);
    const label = batch.map((c) => `${c.language}/${c.level}/${c.length}`).join(', ');
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(COMBINATIONS.length / BATCH_SIZE);
    console.log(`[write] Batch ${batchNum}/${totalBatches}: ${label}`);

    const results = await Promise.all(
      batch.map((c) => writeBriefing(factbase, c.language, c.level, c.length, date)),
    );

    for (const briefing of results) {
      const { language, level, length } = briefing;
      bundle.briefings[language] ??= {};
      bundle.briefings[language][level] ??= {};
      bundle.briefings[language][level][length] = briefing;
    }

    if (i + BATCH_SIZE < COMBINATIONS.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

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

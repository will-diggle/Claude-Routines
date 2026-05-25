#!/usr/bin/env node
/**
 * Server-side daily briefing generator.
 * Run by GitHub Actions at 04:30 UTC daily.
 *
 * Outputs:
 *   scripts/output/YYYY-MM-DD.json   — archived dated copy
 *   scripts/output/latest.json       — overwritten daily (app fetches this)
 *
 * Stage 1 — Gather (Gemini Flash primary, Claude fallback):
 *   Gemini Flash + Google Search grounding  →  factbase JSON  (primary)
 *   Claude Sonnet + web_search tool         →  factbase JSON  (fallback only, if Gemini fails)
 *   GEMINI_API_KEY is required. Claude fallback uses ANTHROPIC_API_KEY.
 *
 * Stage 2 — Write (Anthropic Message Batches API):
 *   All language/level/length combinations submitted as a single batch.
 *   Each request uses submit_article tool (one call per story).
 *   Polls for completion, then assembles the bundle.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... GEMINI_API_KEY=... npx tsx scripts/generate-briefings.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { jsonrepair } from 'jsonrepair';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  GATHERING_SYSTEM,
  WRITING_SYSTEM,
  NATIVE_JOURNALISM_SYSTEM,
  GRADING_SYSTEM,
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
type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';

interface BriefingArticle { genre: string; headline: string; body: string; }

interface CrossReferenceScore {
  total: number;
  outlets_covering: string[];
  rank: number;
}

interface FactbaseStory {
  genre: string;
  slug: string;
  cross_reference_score?: CrossReferenceScore; // GLOBAL NEWS only
  what_happened: string[];
  attribution: string[];
  verified: string[];
  contested: string[];
  numbers: string[];
  proper_nouns: string[];
  key_terms: string[];
}

interface GatherResult {
  factbase: FactbaseStory[];
  source: 'gemini' | 'claude';
  durationMs: number;
  estimatedCostUSD?: number;
}

interface GeneratedBriefing {
  articles: BriefingArticle[]; date: string;
  language: LanguageCode; level: LanguageLevel; length: ArticleLength;
  generatedAt: number;
}

interface NativeArticle {
  genre: string;
  slug: string;
  headline: string;
  body: string;
}

interface GradingAssessment {
  genre: string;
  slug: string;
  level: string; // A1 | A2 | B1 | B2 | C1 | C2
  length: 'short' | 'medium' | 'longer';
  reasoning: string;
}

interface DailyBundle {
  date: string;
  generatedAt: number;
  factbase: FactbaseStory[];
  gatherSource: 'gemini' | 'claude'; // which model gathered today's factbase
  briefings: { [lang: string]: { [level: string]: { [length: string]: GeneratedBriefing } } };
  nativeJournalism: { [lang: string]: NativeArticle[] };  // Prompt 3 output
  grading: { [lang: string]: GradingAssessment[] };        // Prompt 4 output
}

// ── Story validator ───────────────────────────────────────────────────────────
// Coerces any missing/non-array fields to [] and logs a warning.
// cross_reference_score is an optional object (GLOBAL NEWS only) — not coerced.

const FACTBASE_ARRAY_FIELDS = [
  'what_happened', 'attribution', 'verified', 'contested',
  'numbers', 'proper_nouns', 'key_terms',
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
  // Warn if GLOBAL NEWS story has no cross_reference_score
  if (story.genre?.toUpperCase() === 'GLOBAL NEWS' &&
      (!story.cross_reference_score || typeof story.cross_reference_score.total !== 'number')) {
    console.warn(`[validate] story[${index}] "${story.slug}" is GLOBAL NEWS but has no cross_reference_score`);
  }
  return story as FactbaseStory;
}

// ── Combinations ──────────────────────────────────────────────────────────────
// Per-language level lists (must match LEVELS_BY_LANG in SettingsScreen.tsx):
//   en → C1, C2, Native  (testing phase — A2/B1/B2 removed until pipeline is stable)
//   fr → A1, A2, B1, B2, C1, C2
//   de → A1, A2, B1  (learners don't typically reach C1 in German)
// A1/A2 → short only; B1/C1/C2/Native → medium + longer
// C1 = Advanced; C2 = Challenge; Native = C1/Native label (same prompt tier as C1)

const LANGUAGE_LEVELS: Record<LanguageCode, LanguageLevel[]> = {
  en: ['C1', 'C2', 'Native'],
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
// en: C1–Native(6) = 6 | fr: A1–A2(2)+B1–C2(8) = 10 | de: A1–A2(2)+B1(2) = 4 → 20 writing requests

// ── Model routing ─────────────────────────────────────────────────────────────
// A1/A2 → Haiku  (shorter articles, simpler prose — quality holds, cost drops)
// B1+   → Sonnet (richer writing needed for intermediate through scholar levels)
//
// CACHE NAMESPACE NOTE: Haiku and Sonnet maintain SEPARATE prompt-cache stores.
// Block 1 (factbase) and Block 2 (WRITING_SYSTEM) must be byte-identical within each tier.
// Variables ({LANGUAGE}, {LEVEL}, {WORD_COUNT}) are injected via the user message only.

// App-facing labels — matches the label table in the prompts reference doc.
const LEVEL_LABELS: Record<LanguageLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper Intermediate',
  C1: 'Advanced',
  C2: 'Challenge',
  Native: 'Native',
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

// ── Gemini gathering call ─────────────────────────────────────────────────────
// Primary gather model — uses Google Search grounding automatically.
// Do NOT set responseMimeType: 'application/json' — this disables search grounding.

async function callGemini(systemPrompt: string, userMessage: string): Promise<{ raw: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set — required for gathering');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }] as any,
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }],
    generationConfig: { temperature: 0.1 },
  } as any);

  const raw = result.response.text();
  const usage = result.response.usageMetadata;
  return {
    raw,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
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

  // Block 1: factbase — STATIC across all requests in this run.
  // (${date} and ${factbase.length} are identical for every call in the batch.)
  // Written to cache once per model tier; read for every subsequent call in that tier.
  const factbaseBlock =
    `TODAY'S FACT-BASE (${date}) — ${factbase.length} stories:\n` +
    JSON.stringify(factbase, null, 2) +
    `\n\nThese are the only facts to use. Do not add events, figures, or claims not present above.`;

  // Block 2: writing instructions — NO variable substitution → byte-identical for every
  // call using the same model tier.
  //   Sonnet tier: one cache entry shared by all B1/B2/C1/C2/Native requests
  //   Haiku tier:  one cache entry shared by all A1/A2 requests (separate namespace)
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

// ── Real-time Anthropic call (non-batch) ─────────────────────────────────────
// Used for Prompts 3 and 4 — small number of calls, no batch overhead needed.

async function callAnthropicMessage(model: string, system: string, user: string): Promise<string> {
  const data = await callAnthropicAPI(
    {
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    },
    { 'anthropic-version': '2023-06-01' },
  );
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

// ── Stage 3: Native journalism (Prompt 3) ────────────────────────────────────
// One Sonnet call per language, run in parallel alongside the writing batch.
// Produces unconstrained native journalism from the factbase.

async function runAllNativeJournalism(
  factbase: FactbaseStory[],
): Promise<{ [lang: string]: NativeArticle[] }> {
  const factbaseJSON = JSON.stringify(factbase, null, 2);

  const results = await Promise.all(
    LANGUAGES.map(async (language) => {
      const system = NATIVE_JOURNALISM_SYSTEM.replace(/\{LANGUAGE\}/g, LANGUAGE_NAMES[language]);
      const user =
        `Write every story in ${LANGUAGE_NAMES[language]}. ` +
        `Include the "slug" from the corresponding fact-base story in each article.\n\n` +
        `Today's fact-base:\n${factbaseJSON}`;
      try {
        const raw = await callAnthropicMessage('claude-sonnet-4-6', system, user);
        const parsed = parseServerJSON(raw);
        if (!parsed?.articles || !Array.isArray(parsed.articles)) {
          console.error(`[native:${language}] Parse failed. Raw (first 300):`, raw.slice(0, 300));
          return { language, articles: [] as NativeArticle[] };
        }
        console.log(`[native:${language}] ${parsed.articles.length} articles`);
        return { language, articles: parsed.articles as NativeArticle[] };
      } catch (e) {
        console.error(`[native:${language}] Error:`, String(e).slice(0, 200));
        return { language, articles: [] as NativeArticle[] };
      }
    }),
  );

  const output: { [lang: string]: NativeArticle[] } = {};
  for (const { language, articles } of results) output[language] = articles;
  return output;
}

// ── Stage 4: Grading (Prompt 4) ───────────────────────────────────────────────
// One Haiku call per language, runs after Stage 3 completes.
// Assesses each native article's CEFR level and length band.
// Note: Prompt 4 header in prompts doc says Sonnet — testing config table says Haiku.
// Using Haiku per testing config (grading is pattern-matching, Haiku is sufficient).

async function runAllGrading(
  nativeJournalism: { [lang: string]: NativeArticle[] },
): Promise<{ [lang: string]: GradingAssessment[] }> {
  const languages = Object.keys(nativeJournalism).filter(
    (lang) => nativeJournalism[lang].length > 0,
  );

  const results = await Promise.all(
    languages.map(async (language) => {
      const system = GRADING_SYSTEM.replace(/\{LANGUAGE\}/g, LANGUAGE_NAMES[language]);
      const user = JSON.stringify({ articles: nativeJournalism[language] }, null, 2);
      try {
        const raw = await callAnthropicMessage('claude-haiku-4-5-20251001', system, user);
        const parsed = parseServerJSON(raw);
        if (!parsed?.assessments || !Array.isArray(parsed.assessments)) {
          console.error(`[grade:${language}] Parse failed. Raw (first 300):`, raw.slice(0, 300));
          return { language, assessments: [] as GradingAssessment[] };
        }
        console.log(`[grade:${language}] ${parsed.assessments.length} assessments`);
        return { language, assessments: parsed.assessments as GradingAssessment[] };
      } catch (e) {
        console.error(`[grade:${language}] Error:`, String(e).slice(0, 200));
        return { language, assessments: [] as GradingAssessment[] };
      }
    }),
  );

  const output: { [lang: string]: GradingAssessment[] } = {};
  for (const { language, assessments } of results) output[language] = assessments;
  return output;
}

// ── Stage 1: Gather ───────────────────────────────────────────────────────────
// Gemini Flash (primary) — fails the run if Gemini parse fails.

async function gatherFactbase(date: string): Promise<GatherResult> {
  const gatherSystem = GATHERING_SYSTEM.replace(/\{DATE\}/g, date);
  const user = `Today is ${date}. Search for today's top news stories across all genres and produce the factbase JSON.`;

  console.log('[gather] Stage 1 — Gemini Flash + Google Search…');
  const start = Date.now();

  const { raw, inputTokens, outputTokens } = await callGemini(gatherSystem, user);
  // Gemini Flash pricing: $0.10/M input, $0.40/M output (non-cached)
  const estimatedCostUSD = (inputTokens / 1e6) * 0.10 + (outputTokens / 1e6) * 0.40;
  console.log(`[gather:gemini] tokens — input:${inputTokens} output:${outputTokens} estimated cost: $${estimatedCostUSD.toFixed(4)}`);

  const parsed = parseServerJSON(raw);
  if (!parsed?.factbase || !Array.isArray(parsed.factbase)) {
    throw new Error(`[gather:gemini] Parse failed. Raw (first 500): ${raw.slice(0, 500)}`);
  }

  const factbase: FactbaseStory[] = parsed.factbase.map((r: any, i: number) => validateStory(r, i));
  console.log(`[gather:gemini] ${factbase.length} stories parsed (${Date.now() - start}ms)`);
  return { factbase, source: 'gemini', durationMs: Date.now() - start, estimatedCostUSD };
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

  // ── Cache diagnostic ──────────────────────────────────────────────────────
  const block2Bytes = Buffer.byteLength(WRITING_SYSTEM, 'utf8');
  const haikuCalls  = COMBINATIONS.filter(c => c.level === 'A1' || c.level === 'A2').length;
  const sonnetCalls = COMBINATIONS.filter(c => c.level !== 'A1' && c.level !== 'A2').length;
  console.log(`[cache-diag] Block 2 (WRITING_SYSTEM) bytes: ${block2Bytes} — fully static, zero variables`);
  console.log(`[cache-diag] Haiku  (A1/A2): ${haikuCalls} calls — Block 2 shared across all ${haikuCalls}`);
  console.log(`[cache-diag] Sonnet (B1+):   ${sonnetCalls} calls — Block 2 shared across all ${sonnetCalls}`);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Stage 1: Gather ────────────────────────────────────────────────────────
  const { factbase, source: gatherSource } = await gatherFactbase(date);
  console.log(`[bilinguist] Gather complete — source: ${gatherSource}, ${factbase.length} stories`);

  const bundle: DailyBundle = {
    date, generatedAt: Date.now(), factbase, gatherSource,
    briefings: {}, nativeJournalism: {}, grading: {},
  };

  // ── Stages 2+3: writing batch + native journalism run in parallel ───────────
  // Prompt 2 (writing batch) and Prompt 3 (native journalism) are both independent
  // of each other — they both only need the factbase. Submit simultaneously.
  console.log('[bilinguist] Stage 2 (writing batch) + Stage 3 (native journalism) — running in parallel…');
  const [briefings, nativeJournalism] = await Promise.all([
    writeBriefingsBatch(factbase, date),
    runAllNativeJournalism(factbase),
  ]);

  for (const briefing of briefings) {
    const { language, level, length } = briefing;
    bundle.briefings[language] ??= {};
    bundle.briefings[language][level] ??= {};
    bundle.briefings[language][level][length] = briefing;
  }
  bundle.nativeJournalism = nativeJournalism;
  console.log(`[bilinguist] ${briefings.length}/${COMBINATIONS.length} briefings generated`);
  console.log(`[bilinguist] Native journalism: ${Object.entries(nativeJournalism).map(([l, a]) => `${l}:${a.length}`).join(' ')}`);

  // ── Stage 4: Grading — depends on Stage 3 output ──────────────────────────
  console.log('[bilinguist] Stage 4 (grading)…');
  bundle.grading = await runAllGrading(nativeJournalism);
  console.log(`[bilinguist] Grading: ${Object.entries(bundle.grading).map(([l, a]) => `${l}:${a.length}`).join(' ')}`);

  const outputDir = path.join(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const json = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(path.join(outputDir, `${date}.json`), json, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'latest.json'), json, 'utf8');

  const approxKB = Math.round(Buffer.byteLength(json, 'utf8') / 1024);
  console.log(`[bilinguist] Done — output/${date}.json (${approxKB} KB) — gathered by ${gatherSource}`);
}

main().catch((err) => {
  console.error('[bilinguist] Fatal:', err);
  process.exit(1);
});

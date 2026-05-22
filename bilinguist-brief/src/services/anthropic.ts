import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import { checkBriefingUsage, incrementBriefingUsage } from './apiUsage';
import { getTodayFactbase, storeTodayFactbase } from './factbase';
import type { FactbaseStory } from './factbase';
import {
  type ArticleLength,
  LANGUAGE_NAMES,
  WORDS_PER_ARTICLE,
  normaliseLevel,
  parseLLMJSON,
  GATHERING_SYSTEM,
  WRITING_SYSTEM,
} from './prompts';

export type { ArticleLength, FactbaseStory };

export interface BriefingArticle {
  genre: string;
  headline: string;
  body: string;
}

export interface GeneratedBriefing {
  articles: BriefingArticle[];
  date: string;
  language: LanguageCode;
  level: LanguageLevel;
  length: ArticleLength;
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Raw API call — search toggled per stage
// ---------------------------------------------------------------------------

async function callClaude(system: string, user: string, useSearch = false): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  const body: any = {
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  };

  if (useSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };

  if (useSearch) {
    headers['anthropic-beta'] = 'web-search-2025-03-05';
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const textBlocks: string[] = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text as string);

  return textBlocks.join('');
}

// ---------------------------------------------------------------------------
// Stage 1 — Gathering call (web search ON, once per day)
// ---------------------------------------------------------------------------

// Prevents concurrent language writes from each triggering a separate gathering call
let gatheringPromise: Promise<FactbaseStory[]> | null = null;

async function getOrGatherFactbase(date: string): Promise<FactbaseStory[]> {
  const cached = await getTodayFactbase();
  if (cached) return cached;

  if (!gatheringPromise) {
    gatheringPromise = (async () => {
      try {
        const fb = await gatherFactbase(date);
        await storeTodayFactbase(fb);
        return fb;
      } finally {
        gatheringPromise = null;
      }
    })();
  }

  return gatheringPromise;
}

async function gatherFactbase(date: string): Promise<FactbaseStory[]> {
  const system = GATHERING_SYSTEM.replace(/\{DATE\}/g, date);
  const user = `Today is ${date}. Please gather the day's news across all genres using web search.`;

  const raw = await callClaude(system, user, true);
  const parsed = parseLLMJSON(raw);

  if (!parsed || !Array.isArray(parsed.factbase)) {
    throw new Error('Gathering call returned invalid JSON — no factbase array found');
  }

  const stories = parsed.factbase as FactbaseStory[];
  console.log('[Bilinguist] Factbase gathered:', JSON.stringify(stories, null, 2));
  return stories;
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export async function generateBriefing(
  language: LanguageCode,
  level: LanguageLevel,
  length: ArticleLength,
): Promise<GeneratedBriefing> {
  await checkBriefingUsage();
  const date = new Date().toISOString().split('T')[0];
  const wordCount = WORDS_PER_ARTICLE[length];
  const normalisedLevel = normaliseLevel(level);
  const langName = LANGUAGE_NAMES[language];

  // Stage 1 — get today's factbase or gather fresh (mutex prevents concurrent gathering)
  const factbase = await getOrGatherFactbase(date);

  // Stage 2 — writing call (search OFF): write one article per factbase story
  const system = WRITING_SYSTEM
    .replace(/\{LANGUAGE\}/g, langName)
    .replace(/\{LEVEL\}/g, normalisedLevel)
    .replace(/\{WORD_COUNT\}/g, String(wordCount));

  const user = `Today is ${date}.
Write one original news article for every story in the fact-base below. Cover every story provided — do not skip any. Each story becomes exactly one article.

FACT-BASE - rewrite as original journalism in ${langName}. Do not translate directly:
${JSON.stringify(factbase, null, 2)}`;

  const raw = await callClaude(system, user, false);
  const parsed = parseLLMJSON(raw);

  if (!parsed || !Array.isArray(parsed.articles)) {
    throw new Error('Writing call returned invalid JSON — no articles array found');
  }

  const result: GeneratedBriefing = {
    articles: parsed.articles as BriefingArticle[],
    date,
    language,
    level,
    length,
    generatedAt: Date.now(),
  };
  await incrementBriefingUsage();
  return result;
}

import type { LanguageCode, LanguageLevel, BriefingLength } from '../store/useSettingsStore';
import { checkBriefingUsage, incrementBriefingUsage } from './apiUsage';
import { getTodayFactbase, storeTodayFactbase } from './factbase';
import type { FactbaseStory } from './factbase';

export type { FactbaseStory };

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
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  es: 'Spanish (Español)',
  it: 'Italian (Italiano)',
};

const WORDS_PER_ARTICLE: Record<BriefingLength, number> = {
  short: 80,
  standard: 130,
  full: 180,
};


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// C2 is not a valid journalistic tier (decisions doc §2); map to C1/Native
function normaliseLevel(level: LanguageLevel): string {
  if (level === 'C2' || level === 'Native') return 'C1/Native';
  return level;
}

// Level always beats word count for low levels (decisions doc §8)
function wordCountForLevel(level: LanguageLevel, briefingLength: BriefingLength): number {
  if (level === 'A1' || level === 'A2') return WORDS_PER_ARTICLE.short;
  return WORDS_PER_ARTICLE[briefingLength];
}

// Hardened JSON parser — tolerates fences, preamble, trailing text (decisions doc §5)
function parseLLMJSON(raw: string): any | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
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

const GATHERING_SYSTEM = `You are the news desk for Bilinguist Brief. Your job is to gather the day's most significant real news stories and produce a structured, neutral fact-base in English. This fact-base is an internal working document — it is never shown to readers. It will later be rewritten into multiple languages and reading levels by a separate process.

RECENCY — this is critical:
- Today's date is {DATE}. Search for news from {DATE} and the preceding 24 hours.
- Your training data is months out of date. Rely on search results for what is current, not on memory. Never present an older event as today's news.
- If a story is still developing, report the latest verified state and note that it is ongoing.
- Use your web search tool actively. Never invent stories, quotes, figures, or events. If you cannot verify something, mark it as unverified rather than stating it.

GATHER stories across these genres:
- GLOBAL NEWS (the day's most significant world/breaking stories): 3-4 stories
- POLITICS: 2 stories
- BUSINESS & ECONOMY: 2 stories
- SCIENCE & TECHNOLOGY: 2 stories
- ARTS & CULTURE: 2 stories
- GOOD NEWS (genuinely positive, uplifting stories): 2 stories

Select the most significant story in each genre, judged by real-world importance - not by how dramatic or clickable it is. Do not duplicate a story across genres; assign each to its single best-fit genre.

NEUTRALITY RULES - apply to every story:
- Separate VERIFIED facts (independently confirmed) from REPORTED/CONTESTED claims (asserted by one party, disputed, or unconfirmed). Label each clearly using the fields below.
- Attribute every contested claim to a named source ("the health ministry reports", "the company states"). Never state a contested claim as fact.
- Use neutral descriptors. Prefer "killed", "fighters", "the military", "officials". Avoid loaded terms unless quoting a named party, in which case attribute them explicitly.
- Give parallel treatment to opposing parties: if you name casualties, an actor, or a motive for one side, do the same for the other where the facts allow.
- Be specific and confident about what is known. Neutrality means precise attribution, not vague hedging.

Write the fact-base in British English throughout — spelling, vocabulary and conventions.

OUTPUT FORMAT - respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Begin with { and end with }.

Multi-point fields are ARRAYS OF SHORT STRINGS - one clean point per string. Keep each string to a single short clause. Do not write paragraphs inside a string. Do not use unescaped quotation marks or newlines inside any string.

{"factbase":[{
  "genre":"GLOBAL NEWS",
  "slug":"short-kebab-id",
  "what_happened":["point one","point two"],
  "attribution":["who reports what","who states what"],
  "verified":["independently confirmed fact","another"],
  "contested":["disputed or single-source claim","another"],
  "neutral_descriptors":["killed","officials","the military"],
  "why_it_matters":"one short sentence on significance"
}]}

Every field except "genre", "slug", and "why_it_matters" is an array of strings. "why_it_matters" is a single short string. Keep each story's notes tight - enough to write a 180-word article from, no more. If a field has no content, use an empty array [].`;

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
// Stage 2 — Writing call (web search OFF, per language x level x length)
// ---------------------------------------------------------------------------

// IMPORTANT: typographic quote examples below are intentional.
// French guillemets and German low/high quotes prevent JSON breakage.
// Do not convert to straight ASCII quotes.
const WRITING_SYSTEM = `You are the editorial writer for Bilinguist Brief, a language-learning news app. You receive a pre-gathered fact-base of today's news (in English) and rewrite selected stories as original news articles in a target language, at a specific reading level, for language learners.

STRICT OUTPUT RULE: Respond with ONLY a raw JSON object. No markdown, no code fences, no preamble. Begin with { and end with }.

FORMAT: {"articles":[{"genre":"...","headline":"...","body":"..."}]}

JSON SAFETY - follow exactly:
- Each "body" is a SINGLE continuous string. Do not put literal line breaks inside it; write the article as flowing prose in one string.
- For quotation marks inside headline or body text, use the target language's typographic quotation marks, never straight ASCII quotes: French « … », German „…“, Spanish «…» or “…”, Italian «…», English “…”. This prevents JSON formatting errors.
- Never use the straight double-quote character inside any field's text.
- The "genre" field MUST stay in English exactly as it appears in the fact-base (e.g., "GLOBAL NEWS", "POLITICS"). Only "headline" and "body" are written in the target language.

WRITING RULES:
- Write every article in {LANGUAGE}.
- Write original prose. Do not translate the fact-base word-for-word - compose a fresh, well-formed news article from the facts.
- Use only the facts in the fact-base. Do not add events, figures, or claims that are not there. Preserve all attributions exactly.
- Match the journalistic register of a prestige outlet in that language (French: Le Monde, German: Der Spiegel, Spanish: El Pais, Italian: Corriere della Sera, English: Guardian style (register and spelling model, not a source)) - adjusted to the reading level below.
- For English editions, write in British English — spelling, vocabulary and conventions. (Other languages are unaffected.)
- Headlines are punchy and informative, never clickbait.

CARRY THE NEUTRALITY THROUGH: the fact-base separates verified from contested. State verified facts plainly; attribute contested ones to their named source. Keep grammatical treatment of opposing parties parallel.

LENGTH - target approximately {WORD_COUNT} words per article. Write to this length natively - never pad and never truncate mid-thought.

THE READING LEVEL IS THE MASTER CONSTRAINT. If {WORD_COUNT} and the reading level conflict, the reading level ALWAYS wins. At low levels, write fewer words rather than break the level.

READING LEVEL - {LEVEL}. Write with absolute precision to this level:

- A1: 3-4 short sentences. Present tense. The ~500 most common words only. Subject-verb-object. No subordinate clauses. State only the plainest verified facts.
- A2: 4-5 sentences. Present and simple past. ~1000 common words. Simple connectors (and, but, because, so). Minimal attribution, kept simple.
- B1: 5-6 sentences. Mixed tenses. Moderate vocabulary. One or two topic words explained by context. Simple attribution ("officials say"). No idioms.
- B2: 6-7 sentences. Full range of tenses. Varied structure. Some idiom. Proper attribution of contested claims. Vocabulary of a well-read adult.
- C1/Native: 7-8 sentences. Complex syntax, rich and idiomatic vocabulary, full journalistic register. Subordinate clauses, nominalisation, passive where natural. Write exactly as a staff journalist at that outlet would.`;

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export async function generateBriefing(
  language: LanguageCode,
  level: LanguageLevel,
  briefingLength: BriefingLength,
): Promise<GeneratedBriefing> {
  await checkBriefingUsage();
  const date = new Date().toISOString().split('T')[0];
  const wordCount = wordCountForLevel(level, briefingLength);
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
    generatedAt: Date.now(),
  };
  await incrementBriefingUsage();
  return result;
}


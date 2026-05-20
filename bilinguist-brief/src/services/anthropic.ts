import type { LanguageCode, LanguageLevel, BriefingLength } from '../store/useSettingsStore';

export interface BriefingArticle {
  section: string;
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

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  es: 'Spanish (Español)',
  it: 'Italian (Italiano)',
};

const LEVEL_DESCRIPTIONS: Record<LanguageLevel, string> = {
  A1: 'absolute beginner — use only the 500 most common words, present tense only, very short simple sentences',
  A2: 'elementary — everyday vocabulary, short sentences, basic past and future tenses',
  B1: 'intermediate — general vocabulary, moderate sentence complexity, mix of tenses',
  B2: 'upper-intermediate — varied vocabulary, complex sentences, occasional idioms',
  C1: 'advanced — rich vocabulary, long complex sentences, nuanced expression',
  C2: 'near-native — full journalistic register, complex structures, idiomatic throughout',
  Native: 'native journalistic register — write as if for The Times, Le Monde, or Der Spiegel',
};

const ARTICLE_COUNTS: Record<BriefingLength, number> = {
  short: 4,
  standard: 7,
  full: 11,
};

const WORDS_PER_ARTICLE: Record<BriefingLength, number> = {
  short: 80,
  standard: 130,
  full: 180,
};

function buildSystemPrompt(language: LanguageCode, level: LanguageLevel): string {
  return `You are the editor of Bilinguist Brief, a language learning newspaper app.

Your task is to write today's news briefing. The reader is learning ${LANGUAGE_NAMES[language]} at ${level} level (${LEVEL_DESCRIPTIONS[level]}).

Rules:
1. Write ENTIRELY in ${LANGUAGE_NAMES[language]}. Every single word in every headline and article body must be in ${LANGUAGE_NAMES[language]}.
2. Use vocabulary and grammar appropriate for ${level} level as described above.
3. Search for REAL, CURRENT news stories from today or this week. Prioritise: Reuters, AP News, BBC, The Guardian, Financial Times.
4. NEVER reproduce article text verbatim. Always rewrite stories entirely in your own words.
5. Each article section label must be one of the requested topic names, in English.
6. Keep articles engaging, factual, and educational.

Return ONLY a valid JSON object with no markdown fencing, no preamble, no explanation. Exactly this structure:
{"articles":[{"section":"World News","headline":"...","body":"..."}]}`;
}

function buildUserPrompt(
  topics: string[],
  articleCount: number,
  wordsPerArticle: number,
  date: string
): string {
  return `Today's date: ${date}

Generate ${articleCount} news articles covering these topics (distribute evenly): ${topics.join(', ')}.

Each article body should be approximately ${wordsPerArticle} words.

Search for real current news and write each article at the correct language level.`;
}

async function callClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    system,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: user }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Extract all text blocks (search results + final response are all returned in one call)
  const textBlocks: string[] = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text as string);

  return textBlocks.join('');
}

function extractJSON(raw: string): BriefingArticle[] {
  // Strip any accidental markdown fencing
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // Find the JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in response');

  const json = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(json.articles)) throw new Error('Invalid briefing JSON structure');

  return json.articles as BriefingArticle[];
}

export async function generateBriefing(
  language: LanguageCode,
  level: LanguageLevel,
  briefingLength: BriefingLength,
  enabledTopics: string[]
): Promise<GeneratedBriefing> {
  const date = new Date().toISOString().split('T')[0];
  const articleCount = ARTICLE_COUNTS[briefingLength];
  const wordsPerArticle = WORDS_PER_ARTICLE[briefingLength];

  const topics = enabledTopics.length > 0 ? enabledTopics : ['World News'];

  const system = buildSystemPrompt(language, level);
  const user = buildUserPrompt(topics, articleCount, wordsPerArticle, date);

  const raw = await callClaude(system, user);
  const articles = extractJSON(raw);

  return {
    articles,
    date,
    language,
    level,
    generatedAt: Date.now(),
  };
}

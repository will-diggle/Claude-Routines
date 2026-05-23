/**
 * Client-side types only.
 *
 * All briefing generation happens server-side (GitHub Actions + Anthropic API).
 * The app fetches pre-built bundles from the Cloudflare Worker — no API key
 * is needed or stored in the app.
 */
import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';
import type { ArticleLength } from './prompts';
import type { FactbaseStory } from './factbase';

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

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

export interface TokenMapEntry {
  position: number;          // zero-indexed word position (article-global, words only)
  surface: string;           // word as it appears in text
  lemma: string;             // dictionary/citation form
  pos: string;               // NOUN | VERB | PART | ADJ | ADV | PRON | DET | ...
  linked_positions: number[]; // positions of tokens forming the same lexical unit
  gender?: 'm' | 'f' | 'n'; // for gendered nouns
}

export interface BriefingArticle {
  genre: string;
  slug?: string;
  headline: string;
  body: string;
  wordCount?: number; // word count of headline + body, added by Python at generation time
  tokenMap?: TokenMapEntry[]; // P5 token analysis — undefined for older bundles
}

export interface GeneratedBriefing {
  articles: BriefingArticle[];
  date: string;
  language: LanguageCode;
  level: LanguageLevel;
  length: ArticleLength;
  generatedAt: number;
}

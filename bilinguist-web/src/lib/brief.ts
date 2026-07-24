import { WORKER_BASE, type LanguageCode, type LanguageLevel, type ReadLength } from './config';

export interface BriefArticle {
  genre: string;
  slug?: string;
  headline: string;
  body: string;
}

export interface BriefLength {
  articles: BriefArticle[];
  date: string;
  language: string;
  level: string;
  length: string;
  generatedAt: number;
}

export interface FilteredBriefResponse {
  date: string;
  generatedAt: number;
  language: string;
  level: string;
  lengths: Record<string, BriefLength>;
}

export type BriefFetchResult =
  | { ok: true; brief: BriefLength; date: string }
  | { ok: false; reason: 'not_found' | 'network' | 'http'; status?: number };

// Falls back through this order if the user's preferred length isn't
// published for this lang/level — no length restriction pre-paywall.
const LENGTH_FALLBACK = ['longer', 'medium', 'short'];

export async function fetchBrief(
  language: LanguageCode,
  level: LanguageLevel,
  preferredLength: ReadLength,
): Promise<BriefFetchResult> {
  try {
    const url = `${WORKER_BASE}/latest?lang=${encodeURIComponent(language)}&level=${encodeURIComponent(level)}&t=${Date.now()}`;
    const res = await fetch(url);

    if (res.status === 404) return { ok: false, reason: 'not_found' };
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };

    const data: FilteredBriefResponse = await res.json();
    const availableLengths = Object.keys(data.lengths ?? {});
    const preference = [preferredLength, ...LENGTH_FALLBACK];
    const chosen =
      preference.find((l) => availableLengths.includes(l)) ?? availableLengths[0];

    if (!chosen) return { ok: false, reason: 'not_found' };

    return { ok: true, brief: data.lengths[chosen], date: data.date };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

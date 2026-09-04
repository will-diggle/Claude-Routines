import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeneratedBriefing } from './anthropic';
import type { FactbaseStory } from './factbase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyBundle {
  date: string;
  generatedAt: number;
  volume?: number;
  daily_notification?: string;
  // No longer sent by the Worker's public /latest — internal pipeline material,
  // stripped server-side. Stays optional so old cached local copies still parse.
  factbase?: FactbaseStory[];
  briefings: {
    [lang: string]: {
      [level: string]: {
        [length: string]: GeneratedBriefing;
      };
    };
  };
  // P3 native journalism — articles per language per length variant.
  nativeJournalism: {
    [lang: string]: {
      [length: string]: Array<{ genre: string; headline: string; body: string; slug?: string }>;
    };
  };
  // P4a output — CEFR reading level of native journalism per language.
  nativeGrades: {
    [lang: string]: string;
  };
  // Prompt 4 grading — array of assessment objects per language. Legacy fallback
  // only: nativeGrades covers every current bundle, so this rarely arrives —
  // no longer sent by the Worker's public /latest (raw editorial reasoning,
  // stripped server-side). Stays optional for old cached local copies/archives.
  grading?: {
    [language: string]: Array<{
      genre: string;
      slug: string;
      level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
      length: 'short' | 'longer';
      reasoning: string;
    }>;
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Primary: EXPO_PUBLIC_DATA_URL lets you override (e.g. a Cloudflare Worker).
// Default: GitHub raw content from the bilinguist-data repo (no extra infra
// needed — raw.githubusercontent.com is publicly accessible and the ?t= param
// busts the CDN cache so we always get the freshest file).
const DATA_BASE = (
  process.env.EXPO_PUBLIC_DATA_URL ??
  'https://raw.githubusercontent.com/will-diggle/bilinguist-data/main'
).replace(/\/+$/, '');

// The Cloudflare Worker exposes /latest (no .json extension).
// The raw GitHub fallback uses /latest.json — but that repo is private so
// only the Worker path actually works in production.
const BUNDLE_URL = process.env.EXPO_PUBLIC_DATA_URL
  ? `${DATA_BASE}/latest`
  : `${DATA_BASE}/latest.json`;

// ─── Meta ─────────────────────────────────────────────────────────────────────

export interface BundleMeta {
  date: string;
  generatedAt: number;
}

// Lightweight endpoint that returns only { date, generatedAt } — ~50 bytes.
// Only available when using the Cloudflare Worker (EXPO_PUBLIC_DATA_URL set).
const META_URL = process.env.EXPO_PUBLIC_DATA_URL
  ? `${DATA_BASE}/latest/meta`
  : null;

export async function fetchBundleMeta(): Promise<BundleMeta | null> {
  if (!META_URL) return null;
  try {
    const res = await fetch(`${META_URL}?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = await res.json() as { date?: string; generatedAt?: number };
    if (!data.date || data.generatedAt == null) return null;
    return { date: data.date, generatedAt: data.generatedAt };
  } catch {
    return null;
  }
}

// ─── Fetch result ─────────────────────────────────────────────────────────────

export type BundleFetchResult =
  | { ok: true; bundle: DailyBundle }
  | { ok: false; reason: 'network' | 'http' | 'date-mismatch'; status?: number; bundleDate?: string };

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchTodayBundle(): Promise<BundleFetchResult> {
  const today = new Date().toISOString().split('T')[0];
  try {
    const res = await fetch(`${BUNDLE_URL}?t=${Date.now()}`);
    if (!res.ok) {
      console.warn(`[bilinguist] fetchTodayBundle HTTP ${res.status} from ${BUNDLE_URL}`);
      return { ok: false, reason: 'http', status: res.status };
    }
    const bundle: DailyBundle = await res.json();
    if (bundle.date !== today) {
      console.warn(`[bilinguist] fetchTodayBundle: server returned bundle from ${bundle.date} (today is ${today}) — treating as not yet ready`);
      return { ok: false, reason: 'http', status: 503 };
    }
    return { ok: true, bundle };
  } catch (err) {
    console.warn('[bilinguist] fetchTodayBundle network error:', err);
    return { ok: false, reason: 'network' };
  }
}

// ─── Cache population ─────────────────────────────────────────────────────────

export async function applyBundleToCache(bundle: DailyBundle): Promise<void> {
  const pairs: [string, string][] = [];

  for (const [lang, levels] of Object.entries(bundle.briefings)) {
    for (const [level, lengths] of Object.entries(levels)) {
      for (const [length, briefing] of Object.entries(lengths)) {
        const key = `briefing_${bundle.date}_${lang}_${level}_${length}`;
        pairs.push([key, JSON.stringify(briefing)]);
      }
    }
  }

  // Cache native journalism — each language now has short + longer variants
  for (const [lang, lengths] of Object.entries(bundle.nativeJournalism ?? {})) {
    for (const [length, articles] of Object.entries(lengths as Record<string, any[]>)) {
      if (!Array.isArray(articles) || !articles.length) continue;
      const key = `briefing_${bundle.date}_${lang}_Native_${length}`;
      const briefing = {
        articles: articles.map((a: any) => ({ genre: a.genre, headline: a.headline, body: a.body })),
        date: bundle.date,
        language: lang,
        level: 'Native',
        length,
        generatedAt: bundle.generatedAt,
      };
      pairs.push([key, JSON.stringify(briefing)]);
    }
  }

  if (pairs.length > 0) await AsyncStorage.multiSet(pairs);

  await AsyncStorage.setItem(
    `bilinguist_factbase_${bundle.date}`,
    JSON.stringify({ date: bundle.date, factbase: bundle.factbase }),
  );
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

// Retention is per language/level/length, not per day. A bundle can publish
// without covering every combination — a language configured Native-only has no
// CEFR levels at all — so binning everything that isn't today's would empty the
// screen for those readers on a day the pipeline succeeded. Each combination
// keeps its newest brief until a newer one actually replaces it.
export async function clearPreviousDaysBriefings(today: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();

    const briefKeys = allKeys.filter((k) => k.startsWith('briefing_'));
    const newestByCombo = new Map<string, string>();   // combo → newest date seen
    const parsed: Array<{ key: string; combo: string; date: string }> = [];

    for (const key of briefKeys) {
      // briefing_<date>_<language>_<level>_<length>
      const rest = key.slice('briefing_'.length);
      const sep = rest.indexOf('_');
      if (sep === -1) continue;
      const date = rest.slice(0, sep);
      const combo = rest.slice(sep + 1);
      parsed.push({ key, combo, date });
      const seen = newestByCombo.get(combo);
      if (!seen || date > seen) newestByCombo.set(combo, date);
    }

    // Drop everything except each combination's newest brief.
    const old = parsed
      .filter(({ combo, date }) => date !== newestByCombo.get(combo))
      .map(({ key }) => key);
    if (old.length > 0) await AsyncStorage.multiRemove(old);

    const oldFactbases = allKeys.filter(
      (k) => k.startsWith('bilinguist_factbase_') && k !== `bilinguist_factbase_${today}`,
    );
    if (oldFactbases.length > 0) await AsyncStorage.multiRemove(oldFactbases);
  } catch {
    // Non-fatal
  }
}

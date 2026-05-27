import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeneratedBriefing } from './anthropic';
import type { FactbaseStory } from './factbase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyBundle {
  date: string;
  generatedAt: number;
  factbase: FactbaseStory[];
  briefings: {
    [lang: string]: {
      [level: string]: {
        [length: string]: GeneratedBriefing;
      };
    };
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
      console.warn(`[bilinguist] fetchTodayBundle date mismatch: bundle=${bundle.date} today=${today}`);
      return { ok: false, reason: 'date-mismatch', status: res.status, bundleDate: bundle.date };
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

  if (pairs.length > 0) await AsyncStorage.multiSet(pairs);

  await AsyncStorage.setItem(
    `bilinguist_factbase_${bundle.date}`,
    JSON.stringify({ date: bundle.date, factbase: bundle.factbase }),
  );
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export async function clearPreviousDaysBriefings(today: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const old = allKeys.filter(
      (k) => k.startsWith('briefing_') && !k.startsWith(`briefing_${today}_`),
    );
    if (old.length > 0) await AsyncStorage.multiRemove(old);

    const oldFactbases = allKeys.filter(
      (k) => k.startsWith('bilinguist_factbase_') && k !== `bilinguist_factbase_${today}`,
    );
    if (oldFactbases.length > 0) await AsyncStorage.multiRemove(oldFactbases);
  } catch {
    // Non-fatal
  }
}

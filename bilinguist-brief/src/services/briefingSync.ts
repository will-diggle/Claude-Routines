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

// TODO (pre-launch): move to authenticated Cloudflare Workers endpoint.
// Currently public GitHub raw URL — sufficient for development.
const BUNDLE_URL = 'https://raw.githubusercontent.com/will-diggle/bilinguist-data/main/latest.json';

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchTodayBundle(): Promise<DailyBundle | null> {
  const today = new Date().toISOString().split('T')[0];
  try {
    // Cache-bust so the CDN doesn't serve yesterday's file
    const res = await fetch(`${BUNDLE_URL}?t=${Date.now()}`);
    if (!res.ok) return null;
    const bundle: DailyBundle = await res.json();
    // Reject stale bundles (server hasn't generated today's yet)
    if (bundle.date !== today) return null;
    return bundle;
  } catch {
    return null;
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

  // Also cache the factbase so dev tools can inspect it
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
    // Non-fatal — stale keys linger but don't break anything
  }
}

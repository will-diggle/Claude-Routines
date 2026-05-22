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

// Set EXPO_PUBLIC_WORKER_URL in your .env after deploying bilinguist-worker/
// e.g. EXPO_PUBLIC_WORKER_URL=https://bilinguist-brief.YOUR-ACCOUNT.workers.dev
const WORKER_BASE = process.env.EXPO_PUBLIC_WORKER_URL ?? '';
const BUNDLE_URL = WORKER_BASE ? `${WORKER_BASE}/latest` : '';

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchTodayBundle(): Promise<DailyBundle | null> {
  console.log('[sync] WORKER_BASE:', WORKER_BASE || '(not set)');
  console.log('[sync] BUNDLE_URL:', BUNDLE_URL || '(not set)');
  if (!BUNDLE_URL) {
    console.log('[sync] No worker URL configured — skipping server fetch');
    return null;
  }
  const today = new Date().toISOString().split('T')[0];
  console.log('[sync] Fetching bundle for', today);
  try {
    const res = await fetch(`${BUNDLE_URL}?t=${Date.now()}`);
    console.log('[sync] Response status:', res.status);
    if (!res.ok) return null;
    const bundle: DailyBundle = await res.json();
    console.log('[sync] Bundle date:', bundle.date, '— today:', today, '— match:', bundle.date === today);
    if (bundle.date !== today) return null;
    return bundle;
  } catch (e) {
    console.log('[sync] Fetch error:', String(e));
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

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FactbaseStory {
  genre: string;
  slug: string;
  what_happened: string[];
  attribution: string[];
  verified: string[];
  contested: string[];
  neutral_descriptors: string[];
  numbers?: string[];
  proper_nouns?: string[];
  key_terms?: string[];
  why_it_matters: string;
}

interface StoredFactbase {
  date: string;
  factbase: FactbaseStory[];
}

const KEY_PREFIX = 'bilinguist_factbase_';

function todayKey(): string {
  return KEY_PREFIX + new Date().toISOString().split('T')[0];
}

export async function getTodayFactbase(): Promise<FactbaseStory[] | null> {
  try {
    const raw = await AsyncStorage.getItem(todayKey());
    if (!raw) return null;
    const stored: StoredFactbase = JSON.parse(raw);
    return Array.isArray(stored.factbase) ? stored.factbase : null;
  } catch {
    return null;
  }
}

export async function storeTodayFactbase(factbase: FactbaseStory[]): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await AsyncStorage.setItem(todayKey(), JSON.stringify({ date: today, factbase }));
}

export async function clearTodayFactbase(): Promise<void> {
  try { await AsyncStorage.removeItem(todayKey()); } catch { /* ignore */ }
}

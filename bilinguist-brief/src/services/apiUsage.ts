import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_AUDIO_CAP, MONTHLY_TRANSLATION_CAP } from '../constants/limits';

// ─── Daily briefing quota ─────────────────────────────────────────────────────

const DAILY_BRIEFING_LIMIT = 20;
const STORAGE_KEY = 'bilinguist_api_usage';

interface DailyUsage {
  date: string;
  briefingCalls: number;
}

async function getDailyUsageRecord(): Promise<DailyUsage> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: DailyUsage = JSON.parse(raw);
      const today = new Date().toISOString().split('T')[0];
      if (parsed.date === today) return parsed;
    }
  } catch { /* fall through */ }
  return { date: new Date().toISOString().split('T')[0], briefingCalls: 0 };
}

export async function checkBriefingUsage(): Promise<void> {
  const usage = await getDailyUsageRecord();
  if (usage.briefingCalls >= DAILY_BRIEFING_LIMIT) {
    throw new Error(`Daily briefing limit of ${DAILY_BRIEFING_LIMIT} reached.`);
  }
}

export async function incrementBriefingUsage(): Promise<void> {
  const usage = await getDailyUsageRecord();
  usage.briefingCalls = Math.min(usage.briefingCalls + 1, DAILY_BRIEFING_LIMIT);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export async function getDailyUsage(): Promise<{ used: number; limit: number }> {
  const usage = await getDailyUsageRecord();
  return { used: usage.briefingCalls, limit: DAILY_BRIEFING_LIMIT };
}

export async function resetDailyUsage(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, briefingCalls: 0 }));
}

// ─── Monthly usage (audio + translation) ─────────────────────────────────────

const MONTHLY_AUDIO_KEY = 'bilinguist_monthly_audio';
const MONTHLY_TRANSLATION_KEY = 'bilinguist_monthly_translation';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

interface MonthlyUsage {
  month: string;
  count: number;
}

async function getMonthlyUsageRecord(storageKey: string): Promise<MonthlyUsage> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) {
      const parsed: MonthlyUsage = JSON.parse(raw);
      if (parsed.month === currentMonth()) return parsed;
    }
  } catch { /* fall through */ }
  return { month: currentMonth(), count: 0 };
}

async function incrementMonthlyUsage(storageKey: string, cap: number): Promise<boolean> {
  const record = await getMonthlyUsageRecord(storageKey);
  if (record.count >= cap) return false; // cap reached
  record.count = record.count + 1;
  await AsyncStorage.setItem(storageKey, JSON.stringify(record));
  return true;
}

// ── Audio (ElevenLabs) — daily cap ──

const DAILY_AUDIO_KEY = 'bilinguist_daily_audio';

interface DailyAudioUsage {
  date: string;
  count: number;
}

async function getDailyAudioRecord(): Promise<DailyAudioUsage> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_AUDIO_KEY);
    if (raw) {
      const parsed: DailyAudioUsage = JSON.parse(raw);
      const today = new Date().toISOString().split('T')[0];
      if (parsed.date === today) return parsed;
    }
  } catch { /* fall through */ }
  return { date: new Date().toISOString().split('T')[0], count: 0 };
}

/** Returns { used, limit, remaining } for today. */
export async function getMonthlyAudioUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  const record = await getDailyAudioRecord();
  return { used: record.count, limit: DAILY_AUDIO_CAP, remaining: Math.max(0, DAILY_AUDIO_CAP - record.count) };
}

/**
 * Attempt to consume one audio play.
 * Returns true if counted (daily cap not exceeded), false if cap reached.
 */
export async function consumeAudioPlay(): Promise<boolean> {
  const record = await getDailyAudioRecord();
  if (record.count >= DAILY_AUDIO_CAP) return false;
  record.count += 1;
  await AsyncStorage.setItem(DAILY_AUDIO_KEY, JSON.stringify(record));
  return true;
}

// ── Translation (DeepL) ──

/** Returns { used, limit, remaining } for the current calendar month. */
export async function getMonthlyTranslationUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  const record = await getMonthlyUsageRecord(MONTHLY_TRANSLATION_KEY);
  const used = record.count;
  return { used, limit: MONTHLY_TRANSLATION_CAP, remaining: Math.max(0, MONTHLY_TRANSLATION_CAP - used) };
}

/**
 * Attempt to consume one translation.
 * Returns true if counted, false if the monthly cap has been reached.
 */
export async function consumeTranslation(): Promise<boolean> {
  return incrementMonthlyUsage(MONTHLY_TRANSLATION_KEY, MONTHLY_TRANSLATION_CAP);
}

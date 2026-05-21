import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bilinguist_api_usage';
const DAILY_BRIEFING_LIMIT = 20;

interface UsageRecord {
  date: string;
  briefingCalls: number;
}

async function getRecord(): Promise<UsageRecord> {
  const today = new Date().toISOString().split('T')[0];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const record: UsageRecord = JSON.parse(raw);
      if (record.date === today) return record;
    }
  } catch {
    // fall through to fresh record
  }
  return { date: today, briefingCalls: 0 };
}

async function saveRecord(record: UsageRecord): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

// Check only — does not consume quota. Call at start of generation.
export async function checkBriefingUsage(): Promise<void> {
  const record = await getRecord();
  if (record.briefingCalls >= DAILY_BRIEFING_LIMIT) {
    throw new Error(
      `Daily limit reached — you've generated ${DAILY_BRIEFING_LIMIT} briefings today. ` +
      'The limit resets at midnight.'
    );
  }
}

// Increment — call only after a successful generation.
export async function incrementBriefingUsage(): Promise<void> {
  const record = await getRecord();
  record.briefingCalls = Math.min(record.briefingCalls + 1, DAILY_BRIEFING_LIMIT);
  await saveRecord(record);
}

export async function resetDailyUsage(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await saveRecord({ date: today, briefingCalls: 0 });
}

export async function getDailyUsage(): Promise<{ used: number; limit: number }> {
  const record = await getRecord();
  return { used: record.briefingCalls, limit: DAILY_BRIEFING_LIMIT };
}

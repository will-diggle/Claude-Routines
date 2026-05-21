import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bilinguist_api_usage';
const DAILY_BRIEFING_LIMIT = 5;

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

export async function checkAndIncrementBriefingUsage(): Promise<void> {
  const record = await getRecord();
  if (record.briefingCalls >= DAILY_BRIEFING_LIMIT) {
    throw new Error(
      `Daily limit reached — you've generated ${DAILY_BRIEFING_LIMIT} briefings today. ` +
      'The limit resets at midnight.'
    );
  }
  record.briefingCalls += 1;
  await saveRecord(record);
}

export async function getDailyUsage(): Promise<{ used: number; limit: number }> {
  const record = await getRecord();
  return { used: record.briefingCalls, limit: DAILY_BRIEFING_LIMIT };
}

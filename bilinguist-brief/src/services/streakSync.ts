import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreakSnapshot {
  streak: number;
  lastPracticedDate: string | null;
  totalSessionsCompleted: number;
  speedSnapHighScore: number;
  readingStreaks: Record<string, number>;
  lastReadDates: Record<string, string>;
  readingHistory: Record<string, string[]>;
  readingTimeSecs: Record<string, number>;
  freezeDatesUsed: Record<string, string[]>;
  fullSweepDate: string | null;
}

// ── Migration tracking ────────────────────────────────────────────────────────

// Stores the userId whose AsyncStorage data has been pushed to Supabase.
// Cleared on sign-out is not needed — we only ever push up, never overwrite.
const MIGRATION_KEY = 'bilinguist-streak-migration-user';

async function hasMigrated(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MIGRATION_KEY)) === userId;
  } catch {
    return false;
  }
}

async function markMigrated(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(MIGRATION_KEY, userId);
  } catch {}
}

// ── Merge (streaks and history never decrease) ────────────────────────────────

export function mergeSnapshots(local: StreakSnapshot, remote: StreakSnapshot): StreakSnapshot {
  // Practice streak: take whichever side is higher. If tied, take the more recent date.
  let streak = local.streak;
  let lastPracticedDate = local.lastPracticedDate;
  if (remote.streak > local.streak) {
    streak = remote.streak;
    lastPracticedDate = remote.lastPracticedDate;
  } else if (
    remote.streak === local.streak &&
    remote.lastPracticedDate &&
    (!local.lastPracticedDate || remote.lastPracticedDate > local.lastPracticedDate)
  ) {
    lastPracticedDate = remote.lastPracticedDate;
  }

  // Per-language reading streaks: max per language, keep the last_read_date
  // paired with whichever side had the higher streak count.
  const allLangs = new Set([
    ...Object.keys(local.readingStreaks),
    ...Object.keys(remote.readingStreaks),
  ]);
  const readingStreaks: Record<string, number> = {};
  const lastReadDates: Record<string, string> = { ...local.lastReadDates };
  for (const lang of allLangs) {
    const lStreak = local.readingStreaks[lang] ?? 0;
    const rStreak = remote.readingStreaks[lang] ?? 0;
    if (rStreak > lStreak) {
      readingStreaks[lang] = rStreak;
      if (remote.lastReadDates[lang]) lastReadDates[lang] = remote.lastReadDates[lang];
    } else {
      readingStreaks[lang] = lStreak;
      // local.lastReadDates[lang] is already in lastReadDates via the spread above
    }
  }

  // Reading history: union of all date arrays per language, sorted ascending.
  const allHistoryLangs = new Set([
    ...Object.keys(local.readingHistory),
    ...Object.keys(remote.readingHistory),
  ]);
  const readingHistory: Record<string, string[]> = {};
  for (const lang of allHistoryLangs) {
    const merged = new Set(local.readingHistory[lang] ?? []);
    for (const d of remote.readingHistory[lang] ?? []) merged.add(d);
    readingHistory[lang] = [...merged].sort();
  }

  // Freeze dates: union per language. Prevents a freeze being "reused" after
  // reconcile because one device hadn't seen the other device's consumption.
  const allFreezeLangs = new Set([
    ...Object.keys(local.freezeDatesUsed),
    ...Object.keys(remote.freezeDatesUsed),
  ]);
  const freezeDatesUsed: Record<string, string[]> = {};
  for (const lang of allFreezeLangs) {
    const merged = new Set(local.freezeDatesUsed[lang] ?? []);
    for (const d of remote.freezeDatesUsed[lang] ?? []) merged.add(d);
    freezeDatesUsed[lang] = [...merged].sort();
  }

  // fullSweepDate: most recent wins (milestones can only advance forward)
  const localSweep = local.fullSweepDate;
  const remoteSweep = remote.fullSweepDate;
  const fullSweepDate =
    localSweep && remoteSweep
      ? localSweep >= remoteSweep
        ? localSweep
        : remoteSweep
      : localSweep ?? remoteSweep;

  return {
    streak,
    lastPracticedDate,
    totalSessionsCompleted: Math.max(local.totalSessionsCompleted, remote.totalSessionsCompleted),
    speedSnapHighScore: Math.max(local.speedSnapHighScore, remote.speedSnapHighScore),
    readingStreaks,
    lastReadDates,
    readingHistory,
    readingTimeSecs: local.readingTimeSecs, // ephemeral 7-day window — local always wins
    freezeDatesUsed,
    fullSweepDate,
  };
}

// ── Push ──────────────────────────────────────────────────────────────────────

// Regular write-behind pushes only send the last 90 days of reading history to
// keep payload size constant over time. Full history is pushed once on migration.
const RECENT_HISTORY_DAYS = 90;

function recentCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_HISTORY_DAYS);
  return d.toISOString().split('T')[0];
}

async function pushToSupabase(
  userId: string,
  snapshot: StreakSnapshot,
  fullHistory = false,
): Promise<void> {
  if (!supabase) return;

  const { error: streakError } = await supabase.from('user_streaks').upsert(
    {
      user_id: userId,
      practice_streak: snapshot.streak,
      last_practiced_date: snapshot.lastPracticedDate ?? null,
      total_sessions: snapshot.totalSessionsCompleted,
      speed_snap_high_score: snapshot.speedSnapHighScore,
      reading_streaks: snapshot.readingStreaks,
      last_read_dates: snapshot.lastReadDates,
      freeze_dates_used: snapshot.freezeDatesUsed,
      full_sweep_date: snapshot.fullSweepDate ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (streakError) {
    console.warn('[streakSync] user_streaks upsert error:', streakError.message);
    return;
  }

  const cutoff = fullHistory ? '1970-01-01' : recentCutoff();
  const rows: Array<{ user_id: string; lang_code: string; read_date: string; time_secs: number }> =
    [];

  for (const [lang, dates] of Object.entries(snapshot.readingHistory)) {
    for (const date of dates) {
      if (date < cutoff) continue;
      rows.push({
        user_id: userId,
        lang_code: lang,
        read_date: date,
        time_secs: snapshot.readingTimeSecs[`${lang}_${date}`] ?? 0,
      });
    }
  }

  if (rows.length === 0) return;

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('reading_history')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,lang_code,read_date' });
    if (error) console.warn('[streakSync] reading_history upsert error:', error.message);
  }
}

// ── Pull ──────────────────────────────────────────────────────────────────────

async function pullFromSupabase(userId: string): Promise<StreakSnapshot | null> {
  if (!supabase) return null;

  const [{ data: row, error: streakErr }, { data: historyRows, error: historyErr }] =
    await Promise.all([
      supabase.from('user_streaks').select('*').eq('user_id', userId).maybeSingle(),
      supabase
        .from('reading_history')
        .select('lang_code, read_date, time_secs')
        .eq('user_id', userId)
        .limit(20000), // generous cap; revisit if users hit this
    ]);

  if (streakErr) console.warn('[streakSync] user_streaks fetch error:', streakErr.message);
  if (historyErr) console.warn('[streakSync] reading_history fetch error:', historyErr.message);
  if (!row) return null;

  const readingHistory: Record<string, string[]> = {};
  const readingTimeSecs: Record<string, number> = {};

  for (const h of historyRows ?? []) {
    const lang = h.lang_code as string;
    const date = String(h.read_date);
    if (!readingHistory[lang]) readingHistory[lang] = [];
    readingHistory[lang].push(date);
    if (h.time_secs) readingTimeSecs[`${lang}_${date}`] = h.time_secs as number;
  }

  return {
    streak: (row.practice_streak as number) ?? 0,
    lastPracticedDate: (row.last_practiced_date as string | null) ?? null,
    totalSessionsCompleted: (row.total_sessions as number) ?? 0,
    speedSnapHighScore: (row.speed_snap_high_score as number) ?? 0,
    readingStreaks: (row.reading_streaks as Record<string, number>) ?? {},
    lastReadDates: (row.last_read_dates as Record<string, string>) ?? {},
    freezeDatesUsed: (row.freeze_dates_used as Record<string, string[]>) ?? {},
    fullSweepDate: (row.full_sweep_date as string | null) ?? null,
    readingHistory,
    readingTimeSecs,
  };
}

// ── Write-behind (debounced) ──────────────────────────────────────────────────

let _pushTimer: ReturnType<typeof setTimeout> | null = null;

// Call this after any streak mutation. It debounces and fires a background push
// 2 s after the last call. Safe to call from sync Zustand actions — never throws.
export function scheduleStreakSync(snapshot: StreakSnapshot): void {
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(async () => {
    _pushTimer = null;
    if (!supabase) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      await pushToSupabase(session.user.id, snapshot);
    } catch (e) {
      console.warn('[streakSync] write-behind push error:', e);
    }
  }, 2000);
}

// ── Reconcile ─────────────────────────────────────────────────────────────────

// Pull remote state, merge with local (streaks never decrease), push merged result back.
// Returns the merged snapshot so the caller can apply it to the local store.
export async function reconcileStreaks(
  userId: string,
  localSnapshot: StreakSnapshot,
): Promise<StreakSnapshot> {
  try {
    const remote = await pullFromSupabase(userId);
    if (!remote) {
      // First time this user's data is in Supabase — push local and return unchanged
      await pushToSupabase(userId, localSnapshot);
      return localSnapshot;
    }
    const merged = mergeSnapshots(localSnapshot, remote);
    await pushToSupabase(userId, merged);
    return merged;
  } catch (e) {
    console.warn('[streakSync] reconcile error:', e);
    return localSnapshot; // fall back to local — never block the user
  }
}

// ── Anonymous migration (one-time) ────────────────────────────────────────────

// Called on first sign-in. Pushes the full local history to Supabase (not just
// the recent 90-day window), then reconciles to pick up any server-side data.
// On subsequent sign-ins it falls through to a regular reconcile.
export async function migrateAnonymousData(
  userId: string,
  localSnapshot: StreakSnapshot,
): Promise<StreakSnapshot> {
  try {
    if (await hasMigrated(userId)) {
      return reconcileStreaks(userId, localSnapshot);
    }
    // Pull remote first so a reinstall (AsyncStorage cleared, hasMigrated=false,
    // but server already has data) doesn't overwrite the server with an empty local state.
    const remote = await pullFromSupabase(userId);
    const toUpload = remote ? mergeSnapshots(localSnapshot, remote) : localSnapshot;
    await pushToSupabase(userId, toUpload, true /* fullHistory */);
    await markMigrated(userId);
    return toUpload;
  } catch (e) {
    console.warn('[streakSync] migration error:', e);
    return localSnapshot;
  }
}

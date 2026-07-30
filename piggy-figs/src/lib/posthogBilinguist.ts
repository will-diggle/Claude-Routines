// Client-side counterpart to posthog-dashboard/fetch_data.py — pulls the
// same 90-day daily aggregates for the Bilinguist Brief event schema, but
// runs directly on-device (like src/lib/posthog.ts) instead of via a CI
// cron writing a shared data.json. Produces the exact data shape
// bilinguistAssets.ts's embedded dashboard.js expects:
// { range_days, generated_at, events: { <event_name>: [rows...] } }.
import type { Connection } from './connections';

const RANGE_DAYS = 90;

interface EventConfig {
  name: string;
  dims: string[];
  extra?: Record<string, string>;
}

const EVENT_CONFIG: EventConfig[] = [
  { name: 'brief_completed', dims: ['language', 'level'], extra: { sum_time_spent_seconds: 'sum(toFloat(properties.time_spent_seconds))' } },
  { name: 'word_tapped', dims: ['language', 'level'] },
  { name: 'word_saved', dims: ['language', 'level'] },
  { name: 'tell_me_more_opened', dims: ['language', 'level'] },
  { name: 'audio_played', dims: ['language'] },
  { name: 'game_opened', dims: ['game_name', 'language'] },
  { name: 'game_completed', dims: ['game_name', 'language'] },
  { name: 'streak_incremented', dims: ['language'] },
  { name: 'streak_lost', dims: ['language'] },
  { name: 'streak_freeze_used', dims: ['language'] },
  { name: 'all_languages_read', dims: [] },
  { name: 'anonymous_session_started', dims: [] },
  { name: 'user_signed_up', dims: [] },
  { name: 'paywall_shown', dims: [] },
  { name: 'subscription_started', dims: [] },
];

async function runQuery(conn: Connection, apiKey: string, hogql: string): Promise<{ columns: string[]; results: any[][] }> {
  const url = `${conn.host}/api/projects/${conn.projectId}/query/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PostHog query failed (${res.status}) for "${hogql.slice(0, 60)}...": ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return { columns: json.columns ?? [], results: json.results ?? [] };
}

async function fetchEventRows(conn: Connection, apiKey: string, cfg: EventConfig): Promise<Record<string, any>[]> {
  const selectDims = cfg.dims.map((d) => `properties.${d} AS ${d}`).join(', ');
  const selectExtra = cfg.extra ? Object.entries(cfg.extra).map(([key, expr]) => `${expr} AS ${key}`).join(', ') : '';
  const selectParts = ['toDate(timestamp) AS day'];
  if (selectDims) selectParts.push(selectDims);
  selectParts.push('count() AS event_count', 'count(DISTINCT distinct_id) AS unique_users');
  if (selectExtra) selectParts.push(selectExtra);

  const groupParts = ['day', ...cfg.dims];

  const hogql =
    `SELECT ${selectParts.join(', ')} FROM events ` +
    `WHERE event = '${cfg.name}' AND timestamp > now() - INTERVAL ${RANGE_DAYS} DAY ` +
    `GROUP BY ${groupParts.join(', ')} ORDER BY day`;

  const { columns, results } = await runQuery(conn, apiKey, hogql);
  return results.map((row) => {
    const obj: Record<string, any> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.day = String(obj.day);
    return obj;
  });
}

export interface BilinguistData {
  range_days: number;
  generated_at: string;
  events: Record<string, Record<string, any>[]>;
}

export async function fetchBilinguistOverview(
  conn: Connection,
  apiKey: string,
  onProgress?: (done: number, total: number) => void
): Promise<BilinguistData> {
  const events: Record<string, Record<string, any>[]> = {};
  let done = 0;
  for (const cfg of EVENT_CONFIG) {
    try {
      events[cfg.name] = await fetchEventRows(conn, apiKey, cfg);
    } catch (e) {
      // One malformed/renamed event shouldn't take down the whole dashboard —
      // matches fetch_data.py's behavior of skipping and logging per-event.
      console.warn(`[piggy-figs] skipping ${cfg.name}:`, e);
      events[cfg.name] = [];
    }
    done += 1;
    onProgress?.(done, EVENT_CONFIG.length);
  }
  return { range_days: RANGE_DAYS, generated_at: new Date().toISOString(), events };
}

// Client-side PostHog HogQL Query API client. Runs directly on-device using
// the user's own Personal API Key (never bundled in the app, never sent
// anywhere but the PostHog host they configured) — no backend of ours is
// involved. This is a generic dashboard (works for any PostHog project),
// not tailored to a specific app's event schema.
import type { Connection } from './connections';

export interface OverviewData {
  generated_at: string;
  range_days: number;
  unique_users: number;
  unique_users_prev: number;
  total_events: number;
  total_events_prev: number;
  sessions: number;
  sessions_prev: number;
  dau_series: { date: string; value: number }[];
  top_events: { name: string; count: number }[];
  top_pages: { path: string; views: number; users: number }[];
}

class PostHogQueryError extends Error {}

async function runQuery(conn: Connection, apiKey: string, hogql: string): Promise<any[][]> {
  const url = `${conn.host}/api/projects/${conn.projectId}/query/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PostHogQueryError(`PostHog query failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.results ?? [];
}

async function scalar(conn: Connection, apiKey: string, hogql: string): Promise<number> {
  const rows = await runQuery(conn, apiKey, hogql);
  return rows[0]?.[0] ?? 0;
}

// Cheap credential check used by AddAppScreen — one query, not the full
// overview fetch (or the 15-query Bilinguist fetch), so "Test & Save"
// doesn't take as long as actually opening the dashboard.
export async function testConnection(conn: Connection, apiKey: string): Promise<void> {
  await runQuery(conn, apiKey, 'SELECT count() FROM events WHERE timestamp > now() - INTERVAL 1 DAY');
}

export const TIMEFRAME_OPTIONS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

export async function fetchOverview(conn: Connection, apiKey: string, days: number = 30): Promise<OverviewData> {
  const prevStart = days * 2;
  const [
    uniqueUsers,
    uniqueUsersPrev,
    totalEvents,
    totalEventsPrev,
    sessions,
    sessionsPrev,
    dauRows,
    topEventRows,
    topPageRows,
  ] = await Promise.all([
    scalar(conn, apiKey, `SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - INTERVAL ${days} DAY`),
    scalar(
      conn,
      apiKey,
      `SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - INTERVAL ${prevStart} DAY AND timestamp <= now() - INTERVAL ${days} DAY`
    ),
    scalar(conn, apiKey, `SELECT count() FROM events WHERE timestamp > now() - INTERVAL ${days} DAY`),
    scalar(
      conn,
      apiKey,
      `SELECT count() FROM events WHERE timestamp > now() - INTERVAL ${prevStart} DAY AND timestamp <= now() - INTERVAL ${days} DAY`
    ),
    scalar(
      conn,
      apiKey,
      `SELECT count(DISTINCT properties.$session_id) FROM events WHERE timestamp > now() - INTERVAL ${days} DAY`
    ),
    scalar(
      conn,
      apiKey,
      `SELECT count(DISTINCT properties.$session_id) FROM events WHERE timestamp > now() - INTERVAL ${prevStart} DAY AND timestamp <= now() - INTERVAL ${days} DAY`
    ),
    runQuery(
      conn,
      apiKey,
      `SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS dau FROM events WHERE timestamp > now() - INTERVAL ${days} DAY GROUP BY day ORDER BY day`
    ),
    runQuery(
      conn,
      apiKey,
      `SELECT event, count() AS c FROM events WHERE timestamp > now() - INTERVAL ${days} DAY GROUP BY event ORDER BY c DESC LIMIT 10`
    ),
    runQuery(
      conn,
      apiKey,
      `SELECT properties.$pathname AS path, count() AS views, count(DISTINCT person_id) AS users FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY GROUP BY path ORDER BY views DESC LIMIT 10`
    ),
  ]);

  return {
    generated_at: new Date().toISOString(),
    range_days: days,
    unique_users: uniqueUsers,
    unique_users_prev: uniqueUsersPrev,
    total_events: totalEvents,
    total_events_prev: totalEventsPrev,
    sessions,
    sessions_prev: sessionsPrev,
    dau_series: dauRows.map((r) => ({ date: String(r[0]), value: Number(r[1]) })),
    top_events: topEventRows.map((r) => ({ name: String(r[0]), count: Number(r[1]) })),
    top_pages: topPageRows.map((r) => ({
      path: r[0] ? String(r[0]) : '(unknown)',
      views: Number(r[1]),
      users: Number(r[2]),
    })),
  };
}

export { PostHogQueryError };

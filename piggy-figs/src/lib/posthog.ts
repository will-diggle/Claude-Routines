// Client-side PostHog HogQL Query API client. Runs directly on-device using
// the user's own Personal API Key (never bundled in the app, never sent
// anywhere but the PostHog host they configured) — no backend of ours is
// involved. This is a generic dashboard (works for any PostHog project),
// not tailored to a specific app's event schema.
import type { Connection } from './connections';

export interface OverviewData {
  generated_at: string;
  unique_users_30d: number;
  unique_users_prev30d: number;
  total_events_30d: number;
  total_events_prev30d: number;
  sessions_30d: number;
  sessions_prev30d: number;
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

export async function fetchOverview(conn: Connection, apiKey: string): Promise<OverviewData> {
  const [
    uniqueUsers30d,
    uniqueUsersPrev30d,
    totalEvents30d,
    totalEventsPrev30d,
    sessions30d,
    sessionsPrev30d,
    dauRows,
    topEventRows,
    topPageRows,
  ] = await Promise.all([
    scalar(conn, apiKey, 'SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - INTERVAL 30 DAY'),
    scalar(
      conn,
      apiKey,
      'SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - INTERVAL 60 DAY AND timestamp <= now() - INTERVAL 30 DAY'
    ),
    scalar(conn, apiKey, 'SELECT count() FROM events WHERE timestamp > now() - INTERVAL 30 DAY'),
    scalar(
      conn,
      apiKey,
      'SELECT count() FROM events WHERE timestamp > now() - INTERVAL 60 DAY AND timestamp <= now() - INTERVAL 30 DAY'
    ),
    scalar(
      conn,
      apiKey,
      "SELECT count(DISTINCT properties.$session_id) FROM events WHERE timestamp > now() - INTERVAL 30 DAY"
    ),
    scalar(
      conn,
      apiKey,
      "SELECT count(DISTINCT properties.$session_id) FROM events WHERE timestamp > now() - INTERVAL 60 DAY AND timestamp <= now() - INTERVAL 30 DAY"
    ),
    runQuery(
      conn,
      apiKey,
      'SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS dau FROM events WHERE timestamp > now() - INTERVAL 30 DAY GROUP BY day ORDER BY day'
    ),
    runQuery(
      conn,
      apiKey,
      'SELECT event, count() AS c FROM events WHERE timestamp > now() - INTERVAL 30 DAY GROUP BY event ORDER BY c DESC LIMIT 10'
    ),
    runQuery(
      conn,
      apiKey,
      "SELECT properties.$pathname AS path, count() AS views, count(DISTINCT person_id) AS users FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY path ORDER BY views DESC LIMIT 10"
    ),
  ]);

  return {
    generated_at: new Date().toISOString(),
    unique_users_30d: uniqueUsers30d,
    unique_users_prev30d: uniqueUsersPrev30d,
    total_events_30d: totalEvents30d,
    total_events_prev30d: totalEventsPrev30d,
    sessions_30d: sessions30d,
    sessions_prev30d: sessionsPrev30d,
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

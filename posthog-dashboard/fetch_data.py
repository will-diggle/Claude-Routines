"""
Pulls a small analytics snapshot from PostHog and writes posthog-dashboard/data.json.

Requires env vars:
  POST_HOG_API      - PostHog Personal API key (read scopes: insight, event, query)
  POSTHOG_PROJECT_ID - numeric project id (e.g. 208705)
  POSTHOG_HOST        - e.g. https://eu.posthog.com

All queries use the HogQL Query endpoint (POST /api/projects/:id/query/), which is
stable across PostHog plans and doesn't require pre-built Insights to exist.

Event/property names assume PostHog's default autocapture ($pageview, $current_url,
$session_id). If the app sends custom events, adjust EVENT_NAMES / PAGEVIEW_EVENT below.
"""
import json
import os
import sys
import urllib.request
import urllib.error

API_KEY = os.environ["POST_HOG_API"]
PROJECT_ID = os.environ["POSTHOG_PROJECT_ID"]
HOST = os.environ.get("POSTHOG_HOST", "https://eu.posthog.com").rstrip("/")

PAGEVIEW_EVENT = "$pageview"
OUT_PATH = os.path.join(os.path.dirname(__file__), "data.json")


def query(hogql: str):
    url = f"{HOST}/api/projects/{PROJECT_ID}/query/"
    body = json.dumps({"query": {"kind": "HogQLQuery", "query": hogql}}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HogQL query failed ({e.code}): {e.read().decode()[:500]}", file=sys.stderr)
        raise


def scalar(hogql: str, default=0):
    res = query(hogql)
    rows = res.get("results", [])
    return rows[0][0] if rows and rows[0] else default


def rows(hogql: str):
    res = query(hogql)
    return res.get("results", [])


def main():
    data = {}

    # KPIs — last 30d vs prior 30d
    data["unique_users_30d"] = scalar(
        "SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - INTERVAL 30 DAY"
    )
    data["unique_users_prev30d"] = scalar(
        "SELECT count(DISTINCT person_id) FROM events "
        "WHERE timestamp > now() - INTERVAL 60 DAY AND timestamp <= now() - INTERVAL 30 DAY"
    )
    data["total_events_30d"] = scalar(
        "SELECT count() FROM events WHERE timestamp > now() - INTERVAL 30 DAY"
    )
    data["total_events_prev30d"] = scalar(
        "SELECT count() FROM events "
        "WHERE timestamp > now() - INTERVAL 60 DAY AND timestamp <= now() - INTERVAL 30 DAY"
    )
    data["sessions_30d"] = scalar(
        "SELECT count(DISTINCT properties.$session_id) FROM events "
        "WHERE timestamp > now() - INTERVAL 30 DAY"
    )
    data["sessions_prev30d"] = scalar(
        "SELECT count(DISTINCT properties.$session_id) FROM events "
        "WHERE timestamp > now() - INTERVAL 60 DAY AND timestamp <= now() - INTERVAL 30 DAY"
    )

    # Daily active users, last 30 days
    dau_rows = rows(
        "SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS dau "
        "FROM events WHERE timestamp > now() - INTERVAL 30 DAY "
        "GROUP BY day ORDER BY day"
    )
    data["dau_series"] = [{"date": str(r[0]), "value": r[1]} for r in dau_rows]

    # Top events by volume, last 30 days
    top_events = rows(
        "SELECT event, count() AS c FROM events "
        "WHERE timestamp > now() - INTERVAL 30 DAY "
        "GROUP BY event ORDER BY c DESC LIMIT 10"
    )
    data["top_events"] = [{"name": r[0], "count": r[1]} for r in top_events]

    # Top pages by views, last 30 days (autocapture $pageview only)
    top_pages = rows(
        f"SELECT properties.$pathname AS path, count() AS views, "
        f"count(DISTINCT person_id) AS users FROM events "
        f"WHERE event = '{PAGEVIEW_EVENT}' AND timestamp > now() - INTERVAL 30 DAY "
        f"GROUP BY path ORDER BY views DESC LIMIT 10"
    )
    data["top_pages"] = [
        {"path": r[0] or "(unknown)", "views": r[1], "users": r[2]} for r in top_pages
    ]

    with open(OUT_PATH, "w") as f:
        json.dump(data, f, indent=2, default=str)

    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()

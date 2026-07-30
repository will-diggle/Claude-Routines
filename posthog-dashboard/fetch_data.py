"""
Pulls daily-granularity event aggregates from PostHog (last 90 days) and writes
posthog-dashboard/data.json. The dashboard itself does all filtering/aggregation
client-side from this one file, so CI only needs to run this on a schedule.

Requires env vars:
  POST_HOG_API       - PostHog Personal/Project API key (read scopes: Event, Query)
  POSTHOG_PROJECT_ID - numeric project id
  POSTHOG_HOST        - e.g. https://eu.posthog.com

Schema reference: Bilinguist Brief · Analytics build spec (July 2026).
"""
import json
import os
import sys
import urllib.request
import urllib.error

API_KEY = os.environ["POST_HOG_API"]
PROJECT_ID = os.environ["POSTHOG_PROJECT_ID"]
HOST = os.environ.get("POSTHOG_HOST", "https://eu.posthog.com").rstrip("/")
RANGE_DAYS = 90

OUT_PATH = os.path.join(os.path.dirname(__file__), "dist", "data.json")

# Each entry: (event_name, [extra groupby dims], extra_select_exprs)
# extra_select_exprs is a dict of {output_key: HogQL expr} beyond count()/uniq.
EVENT_CONFIG = [
    ("brief_completed", ["language", "level"], {"sum_time_spent_seconds": "sum(toFloat(properties.time_spent_seconds))"}),
    ("word_tapped", ["language", "level"], {}),
    ("word_saved", ["language", "level"], {}),
    ("tell_me_more_opened", ["language", "level"], {}),
    ("audio_played", ["language"], {}),
    ("game_opened", ["game_name", "language"], {}),
    ("game_completed", ["game_name", "language"], {}),
    ("streak_incremented", ["language"], {}),
    ("streak_lost", ["language"], {}),
    ("streak_freeze_used", ["language"], {}),
    ("all_languages_read", [], {}),
    ("anonymous_session_started", [], {}),
    ("user_signed_up", [], {}),
    ("paywall_shown", [], {}),
    ("subscription_started", [], {}),
]


def query(hogql: str):
    url = f"{HOST}/api/projects/{PROJECT_ID}/query/"
    body = json.dumps({"query": {"kind": "HogQLQuery", "query": hogql}}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HogQL query failed ({e.code}) for: {hogql}\n{e.read().decode()[:500]}", file=sys.stderr)
        raise


def fetch_event(event_name, dims, extra):
    select_dims = ", ".join(f"properties.{d} AS {d}" for d in dims)
    select_extra = ", ".join(f"{expr} AS {key}" for key, expr in extra.items())
    select_parts = ["toDate(timestamp) AS day"]
    if select_dims:
        select_parts.append(select_dims)
    select_parts.append("count() AS event_count")
    select_parts.append("count(DISTINCT distinct_id) AS unique_users")
    if select_extra:
        select_parts.append(select_extra)

    group_parts = ["day"] + dims

    hogql = (
        f"SELECT {', '.join(select_parts)} FROM events "
        f"WHERE event = '{event_name}' AND timestamp > now() - INTERVAL {RANGE_DAYS} DAY "
        f"GROUP BY {', '.join(group_parts)} ORDER BY day"
    )

    res = query(hogql)
    cols = res.get("columns", [])
    rows = []
    for r in res.get("results", []):
        row = dict(zip(cols, r))
        row["day"] = str(row["day"])
        rows.append(row)
    return rows


def main():
    out = {"range_days": RANGE_DAYS, "events": {}}
    for event_name, dims, extra in EVENT_CONFIG:
        try:
            out["events"][event_name] = fetch_event(event_name, dims, extra)
            print(f"{event_name}: {len(out['events'][event_name])} rows")
        except Exception as e:
            print(f"WARNING: skipping {event_name} due to error: {e}", file=sys.stderr)
            out["events"][event_name] = []

    from datetime import datetime, timezone
    out["generated_at"] = datetime.now(timezone.utc).isoformat()

    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()

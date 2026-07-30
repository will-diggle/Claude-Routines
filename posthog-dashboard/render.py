"""
Renders posthog-dashboard/dist/index.html from posthog-dashboard/data.json
using template.html. Pure stdlib, no dependencies.
"""
import json
import os
from datetime import datetime, timezone

BASE = os.path.dirname(__file__)


def fmt(n):
    try:
        return f"{int(n):,}"
    except (TypeError, ValueError):
        return str(n)


def delta(current, previous):
    if not previous:
        return None
    pct = (current - previous) / previous
    return pct


def delta_parts(current, previous):
    d = delta(current, previous)
    if d is None:
        return "", "", ""
    cls = "up" if d >= 0 else "down"
    arrow = "▲" if d >= 0 else "▼"
    pct = f"{abs(d) * 100:.1f}%"
    return cls, arrow, pct


def build_dau_chart(series):
    if not series:
        return '<div class="empty-note">No pageview/event data in this window yet.</div>'
    values = [p["value"] for p in series]
    vmax = max(values) or 1
    n = len(values)
    w, h, pad_b = 640, 220, 26
    step = w / max(n - 1, 1)
    pts = []
    for i, v in enumerate(values):
        x = i * step
        y = (h - pad_b) - (v / vmax) * (h - pad_b - 20)
        pts.append(f"{x:.1f},{y:.1f}")
    points = " ".join(pts)
    first_date = series[0]["date"]
    last_date = series[-1]["date"]
    return f'''<svg width="100%" height="{h}" viewBox="0 0 {w} {h}">
  <line x1="0" y1="{h-pad_b}" x2="{w}" y2="{h-pad_b}" stroke="var(--baseline)" stroke-width="1"/>
  <polyline fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="{points}"/>
  <text x="0" y="{h-4}" class="axis-label">{first_date}</text>
  <text x="{w-60}" y="{h-4}" class="axis-label">{last_date}</text>
</svg>'''


def build_rows(items, keys, fmt_keys=()):
    rows = []
    for item in items:
        cells = []
        for k in keys:
            v = item.get(k, "")
            if k in fmt_keys:
                v = fmt(v)
            cls = ' class="num"' if k in fmt_keys else ""
            cells.append(f"<td{cls}>{v}</td>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return "\n".join(rows) if rows else '<tr><td colspan="4" class="empty-note">No data yet</td></tr>'


def main():
    with open(os.path.join(BASE, "data.json")) as f:
        data = json.load(f)

    users_cls, users_arrow, users_pct = delta_parts(data["unique_users_30d"], data["unique_users_prev30d"])
    events_cls, events_arrow, events_pct = delta_parts(data["total_events_30d"], data["total_events_prev30d"])
    sessions_cls, sessions_arrow, sessions_pct = delta_parts(data["sessions_30d"], data["sessions_prev30d"])

    events_per_session = (
        round(data["total_events_30d"] / data["sessions_30d"], 1) if data.get("sessions_30d") else "—"
    )

    with open(os.path.join(BASE, "template.html")) as f:
        html = f.read()

    replacements = {
        "{{PROJECT_NAME}}": os.environ.get("PROJECT_NAME", "MyApp · Production"),
        "{{PROJECT_ID}}": os.environ.get("POSTHOG_PROJECT_ID", ""),
        "{{GENERATED_AT}}": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "{{UNIQUE_USERS}}": fmt(data["unique_users_30d"]),
        "{{USERS_DELTA_CLASS}}": users_cls,
        "{{USERS_DELTA_ARROW}}": users_arrow,
        "{{USERS_DELTA_PCT}}": users_pct,
        "{{TOTAL_EVENTS}}": fmt(data["total_events_30d"]),
        "{{EVENTS_DELTA_CLASS}}": events_cls,
        "{{EVENTS_DELTA_ARROW}}": events_arrow,
        "{{EVENTS_DELTA_PCT}}": events_pct,
        "{{SESSIONS}}": fmt(data["sessions_30d"]),
        "{{SESSIONS_DELTA_CLASS}}": sessions_cls,
        "{{SESSIONS_DELTA_ARROW}}": sessions_arrow,
        "{{SESSIONS_DELTA_PCT}}": sessions_pct,
        "{{EVENTS_PER_SESSION}}": str(events_per_session),
        "{{DAU_CHART}}": build_dau_chart(data.get("dau_series", [])),
        "{{TOP_EVENTS_ROWS}}": build_rows(data.get("top_events", []), ["name", "count"], fmt_keys=("count",)),
        "{{TOP_PAGES_ROWS}}": build_rows(
            data.get("top_pages", []), ["path", "views", "users"], fmt_keys=("views", "users")
        ),
    }

    for token, value in replacements.items():
        html = html.replace(token, str(value))

    os.makedirs(os.path.join(BASE, "dist"), exist_ok=True)
    out_path = os.path.join(BASE, "dist", "index.html")
    with open(out_path, "w") as f:
        f.write(html)

    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()

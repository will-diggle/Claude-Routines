// Generic PostHog analytics dashboard — HTML + JS, rendered inside a
// react-native-webview via source={{ html }}. Data is injected by
// DashboardScreen.tsx as window.__INITIAL_DATA__ (a WebView loaded from an
// HTML string has no origin, so it can't fetch() a same-origin data.json —
// same reasoning as posthog-dashboard's app-integration attempt, this time
// built fresh for a project that isn't tied to bilinguist-brief).
//
// Timeframe changes are round-tripped through React Native rather than
// handled purely client-side: unlike the Bilinguist dashboard (which
// pre-fetches 90 days of daily aggregates up front and slices them in the
// browser), this dashboard queries PostHog fresh for whatever window is
// selected, so DashboardScreen.tsx needs to know which one to fetch. Buttons
// here call window.ReactNativeWebView.postMessage(...); DashboardScreen
// listens via WebView's onMessage and re-fetches.

export const DASHBOARD_JS = `
let DATA = window.__INITIAL_DATA__ || null;
let selectedDays = (DATA && DATA.range_days) || 30;

function fmt(n) {
  const v = Number(n) || 0;
  return v.toLocaleString();
}

function deltaParts(current, previous) {
  if (!previous) return { cls: "", arrow: "", pct: "" };
  const d = (current - previous) / previous;
  return {
    cls: d >= 0 ? "up" : "down",
    arrow: d >= 0 ? "\\u25b2" : "\\u25bc",
    pct: (Math.abs(d) * 100).toFixed(1) + "%",
  };
}

function svgLineChart(series) {
  if (!series || series.length === 0) return '<div class="empty-note">No data yet for this window.</div>';
  const w = 640, h = 220, padB = 26, padT = 10;
  const maxVal = Math.max(1, ...series.map((p) => p.value));
  const step = w / Math.max(series.length - 1, 1);
  const points = series.map((p, i) => {
    const x = i * step;
    const y = (h - padB) - (p.value / maxVal) * (h - padB - padT);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<line x1="0" y1="' + (h - padB) + '" x2="' + w + '" y2="' + (h - padB) + '" stroke="var(--baseline)" stroke-width="1"/>' +
    '<polyline fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + points + '"/>' +
    '<text x="0" y="' + (h - 4) + '" class="axis-label">' + (series[0] ? series[0].date : "") + '</text>' +
    '<text x="' + (w - 70) + '" y="' + (h - 4) + '" class="axis-label">' + (series[series.length - 1] ? series[series.length - 1].date : "") + '</text>' +
  '</svg>';
}

function horizontalBars(items) {
  if (!items || items.length === 0) return '<div class="empty-note">No data yet for this window.</div>';
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((i) =>
    '<div class="hbar-row"><div class="hbar-label">' + i.label + '</div>' +
    '<div class="hbar-track"><div class="hbar-fill" style="width:' + ((i.value / max) * 100).toFixed(1) + '%"></div></div>' +
    '<div class="hbar-value">' + fmt(i.value) + '</div></div>'
  ).join("");
}

function tableRows(items, cols) {
  if (!items || items.length === 0) return '<tr><td colspan="' + cols.length + '" class="empty-note">No data yet</td></tr>';
  return items.map((row) =>
    '<tr>' + cols.map((c) => '<td class="' + (c.num ? 'num' : '') + '">' + (c.num ? fmt(row[c.key]) : row[c.key]) + '</td>').join("") + '</tr>'
  ).join("");
}

const TIMEFRAME_LABELS = { 1: "Today", 7: "7 days", 30: "30 days", 90: "90 days" };

function renderTimeframeButtons() {
  const el = document.getElementById("timeframe-row");
  el.innerHTML = [1, 7, 30, 90].map((days) =>
    '<button class="tf-btn' + (days === selectedDays ? ' active' : '') + '" data-days="' + days + '">' + TIMEFRAME_LABELS[days] + '</button>'
  ).join("");
  el.querySelectorAll(".tf-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const days = Number(btn.dataset.days);
      if (days === selectedDays) return;
      selectedDays = days;
      renderTimeframeButtons();
      setLoading(true);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "setRange", days: days }));
      }
    });
  });
}

function setLoading(isLoading) {
  document.getElementById("main-content").style.opacity = isLoading ? "0.4" : "1";
}

function render() {
  renderTimeframeButtons();
  setLoading(false);
  if (!DATA) return;

  const label = TIMEFRAME_LABELS[selectedDays] || (selectedDays + "d");
  document.getElementById("kpi-users-label").textContent = "Unique users (" + label + ")";
  document.getElementById("kpi-events-label").textContent = "Total events (" + label + ")";
  document.getElementById("kpi-sessions-label").textContent = "Sessions (" + label + ")";

  const users = deltaParts(DATA.unique_users, DATA.unique_users_prev);
  const events = deltaParts(DATA.total_events, DATA.total_events_prev);
  const sessions = deltaParts(DATA.sessions, DATA.sessions_prev);

  document.getElementById("kpi-users").textContent = fmt(DATA.unique_users);
  document.getElementById("kpi-users-delta").textContent = users.arrow + " " + users.pct;
  document.getElementById("kpi-users-delta").className = "kpi-delta " + users.cls;

  document.getElementById("kpi-events").textContent = fmt(DATA.total_events);
  document.getElementById("kpi-events-delta").textContent = events.arrow + " " + events.pct;
  document.getElementById("kpi-events-delta").className = "kpi-delta " + events.cls;

  document.getElementById("kpi-sessions").textContent = fmt(DATA.sessions);
  document.getElementById("kpi-sessions-delta").textContent = sessions.arrow + " " + sessions.pct;
  document.getElementById("kpi-sessions-delta").className = "kpi-delta " + sessions.cls;

  const perSession = DATA.sessions ? (DATA.total_events / DATA.sessions).toFixed(1) : "\\u2013";
  document.getElementById("kpi-per-session").textContent = perSession;

  document.getElementById("dau-chart").innerHTML = svgLineChart(DATA.dau_series);
  document.getElementById("top-events").innerHTML = horizontalBars(
    (DATA.top_events || []).map((e) => ({ label: e.name, value: e.count }))
  );
  document.getElementById("top-pages-body").innerHTML = tableRows(DATA.top_pages || [], [
    { key: "path" }, { key: "views", num: true }, { key: "users", num: true },
  ]);

  document.getElementById("last-synced").textContent = DATA.generated_at
    ? new Date(DATA.generated_at).toUTCString().replace(" GMT", " UTC")
    : "unknown";
}

window.__setData__ = function (newData) {
  DATA = newData;
  selectedDays = newData.range_days || selectedDays;
  render();
};

render();
`;

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Analytics</title>
<style>
  .viz-root {
    color-scheme: dark;
    --surface-1: #1a1a19; --page: #0d0d0d; --surface-2: #202020;
    --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781;
    --grid: #2c2c2a; --baseline: #383835; --border: rgba(255,255,255,0.10);
    --good: #0ca30c; --critical: #d03b3b; --series-1: #3987e5;
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .viz-root { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--page); color: var(--text-primary); min-height: 100vh; }
  .main { padding: 18px 24px 50px; max-width: 1400px; margin: 0 auto; }
  .timeframe-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .tf-btn {
    font-family: inherit; font-size: 12.5px; color: var(--text-secondary);
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px;
    padding: 7px 14px; cursor: pointer;
  }
  .tf-btn.active { color: var(--text-primary); font-weight: 600; box-shadow: inset 0 0 0 1px var(--series-1); }
  #main-content { transition: opacity 0.15s ease; }
  .kpi-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
  @media (min-width: 640px) { .kpi-row { grid-template-columns: repeat(4, 1fr); } }
  .panel-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 900px) { .panel-grid { grid-template-columns: 1fr 1fr; align-items: start; } }
  .kpi-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
  .kpi-label { font-size: 11.5px; color: var(--text-muted); margin-bottom: 6px; }
  .kpi-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .kpi-delta { font-size: 11.5px; margin-top: 4px; }
  .kpi-delta.up { color: var(--good); }
  .kpi-delta.down { color: var(--critical); }
  .panel { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
  .panel-title { font-size: 13.5px; font-weight: 600; margin-bottom: 12px; }
  .axis-label { font-size: 10px; fill: var(--text-muted); }
  .empty-note { font-size: 12px; color: var(--text-muted); padding: 24px 0; text-align: center; }
  .hbar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; font-size: 12px; }
  .hbar-label { width: 40%; flex-shrink: 0; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hbar-track { flex: 1; background: var(--grid); border-radius: 4px; height: 9px; overflow: hidden; }
  .hbar-fill { height: 100%; background: var(--series-1); border-radius: 4px; }
  .hbar-value { width: 54px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: var(--text-muted); font-weight: 600; font-size: 10.5px; text-transform: uppercase; padding: 5px 6px; border-bottom: 1px solid var(--grid); }
  td { padding: 8px 6px; border-bottom: 1px solid var(--grid); color: var(--text-secondary); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-primary); }
  #last-synced-row { font-size: 11px; color: var(--text-muted); margin-top: 14px; text-align: right; }
</style>
</head>
<body>
<div class="viz-root">
  <div class="main">
    <div class="timeframe-row" id="timeframe-row"></div>

    <div id="main-content">
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label" id="kpi-users-label">Unique users</div><div class="kpi-value" id="kpi-users">–</div><div class="kpi-delta" id="kpi-users-delta"></div></div>
        <div class="kpi-card"><div class="kpi-label" id="kpi-events-label">Total events</div><div class="kpi-value" id="kpi-events">–</div><div class="kpi-delta" id="kpi-events-delta"></div></div>
        <div class="kpi-card"><div class="kpi-label" id="kpi-sessions-label">Sessions</div><div class="kpi-value" id="kpi-sessions">–</div><div class="kpi-delta" id="kpi-sessions-delta"></div></div>
        <div class="kpi-card"><div class="kpi-label">Events / session</div><div class="kpi-value" id="kpi-per-session">–</div></div>
      </div>

      <div class="panel">
        <div class="panel-title">Daily active users</div>
        <div id="dau-chart"></div>
      </div>

      <div class="panel-grid">
        <div class="panel">
          <div class="panel-title">Top events</div>
          <div id="top-events"></div>
        </div>

        <div class="panel">
          <div class="panel-title">Top pages</div>
          <table>
            <thead><tr><th>Page</th><th>Views</th><th>Users</th></tr></thead>
            <tbody id="top-pages-body"></tbody>
          </table>
        </div>
      </div>

      <div id="last-synced-row">Last synced: <span id="last-synced">–</span></div>
    </div>
  </div>
</div>
</body>
</html>`;

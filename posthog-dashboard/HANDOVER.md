# Bilinguist Brief · Analytics Dashboard — Handover

## What this is

An interactive analytics dashboard built against the Bilinguist Brief PostHog
event schema: timeframe presets + custom range, language multi-select (9
languages), CEFR level multi-select, an events-vs-unique-users toggle, and a
**Compare** mode on most charts that splits it into two independently-filtered
panels (e.g. "French A1 vs French A2"). It ships in two places:

1. **Web** — `posthog-dashboard/dist/index.html`, not yet embedded in the
   live website (integration task below).
2. **iOS/iPad app** — an admin-only screen inside `bilinguist-brief`
   (Settings → Admin → Analytics, gated by email), using the same dashboard
   HTML/JS inlined into a WebView. See "iOS app integration" below — this is
   built and typechecks, but **not yet wired to live data** (needs a backend
   endpoint that doesn't exist yet) and has never run on a device or in a
   real TestFlight build.

## How it works

```
posthog-dashboard/
  fetch_data.py        - pulls 90 days of daily aggregates from PostHog
                          (HogQL Query API) into dist/data.json
  dist/index.html       - the dashboard shell + all filter UI (static)
  dist/dashboard.js      - loads data.json, does ALL filtering/aggregation/
                            rendering client-side (no further PostHog calls)
  dist/data.json          - latest fetched data (generated, committed by CI)
```

`.github/workflows/posthog-dashboard.yml` runs `fetch_data.py` every 6 hours
(cron), on manual dispatch, and on a `repository_dispatch` event named
`refresh-posthog` (for the in-page "Refresh now" button — see below), then
commits the regenerated `dist/data.json`. The page itself is 100% static;
only the JSON changes. This is why filtering is instant in the browser: no
PostHog query happens on click, only on the data.json fetch at page load.

**Note on `.gitignore`:** the repo has a blanket `dist/` ignore rule (for
Node/Expo build output elsewhere). `posthog-dashboard/dist/` is real
checked-in source + CI-generated data, not a build artifact, so it's
explicitly un-ignored via `!posthog-dashboard/dist/` / `!posthog-dashboard/dist/**`
near the top of `.gitignore`. If you add new generated files under that
directory, they'll be tracked correctly — no `-f` needed.

## Required repo secrets (already set)

- `POST_HOG_API` — PostHog **Personal API Key** (read scopes: Event, Query)
- `POSTHOG_PROJECT_ID` — `208705`
- `POSTHOG_HOST` — `https://eu.posthog.com`

## What's NOT built yet — the integration task

The site (`bilinguist-web`, Astro on Cloudflare) doesn't serve this dashboard
yet. Pick one:

1. **Simplest — static copy at build/deploy time.** Copy
   `posthog-dashboard/dist/` (both files) into
   `bilinguist-web/public/analytics/`, served as a static route
   (`yoursite.com/analytics`). **Gate it** behind Cloudflare Access or a
   Worker auth check — it's internal data, not public marketing content.
2. **Native Astro page.** Port `dashboard.js`'s logic into an Astro
   component; fetch `data.json` client-side same as now. Cleaner long-term
   if the team wants to keep iterating on the design system.

Recommend option 1 for a fast first pass.

### Wiring the "Refresh now" button

The button in `dist/index.html` calls `POST /api/refresh-posthog` (see
`refreshBtn` handler in `dashboard.js`). That endpoint doesn't exist yet —
**this needs a small addition to `bilinguist-worker`** (the existing
Cloudflare Worker), because triggering a GitHub Action requires a GitHub
token, which must never sit in client-side JS. Sketch:

```js
// bilinguist-worker — new route
if (url.pathname === "/api/refresh-posthog" && request.method === "POST") {
  const res = await fetch(
    "https://api.github.com/repos/will-diggle/Claude-Routines/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, // fine-grained PAT, Actions:write only
        Accept: "application/vnd.github+json",
        "User-Agent": "bilinguist-worker",
      },
      body: JSON.stringify({ event_type: "refresh-posthog" }),
    }
  );
  return new Response(null, { status: res.ok ? 204 : 502 });
}
```

The workflow already listens for `repository_dispatch: types: [refresh-posthog]`,
so once this Worker route + a scoped `GITHUB_DISPATCH_TOKEN` secret exist, the
button works end to end. Until then it will show "Refresh unavailable" — that's
expected, not a bug, since `/api/refresh-posthog` currently 404s.

## iOS app integration (bilinguist-brief)

```
bilinguist-brief/src/
  constants/admin.ts                       - email allowlist (isAdminEmail)
  screens/SettingsScreen.tsx                - "Admin → Analytics" row (only
                                               rendered when isAdminEmail(userEmail))
  screens/analyticsDashboard/
    AnalyticsScreen.tsx                     - full-screen Modal, WebView host
    generatedAssets.ts                      - GENERATED, do not hand-edit
    emptyData.ts                            - honest all-zero fallback dataset
posthog-dashboard/sync-app-assets.mjs        - regenerates generatedAssets.ts
```

**Why the WebView needed dashboard.js changes.** A WebView given raw HTML via
`source={{ html }}` (rather than a real URL) has no origin, so the page's own
`<script src="dashboard.js">` and its `fetch("data.json")` both fail silently.
`dashboard.js` (in `posthog-dashboard/dist/`, shared by web and app) now
checks `window.__INITIAL_DATA__` first and only falls back to
`fetch("data.json")` if that's absent — see `init()` near the bottom of the
file. `window.__setData__(newData)` is also exposed so the app can push a
live refresh into an already-rendered page without a full WebView reload.

**Keeping the app in sync with the web dashboard.** `generatedAssets.ts` is a
byte-for-byte snapshot of `dist/index.html` + `dist/dashboard.js` (the
`<script src="dashboard.js">` tag is stripped and the JS inlined instead,
since there's no file to point it at). **After editing anything in
`posthog-dashboard/dist/`, run:**

```bash
node posthog-dashboard/sync-app-assets.mjs
```

and commit the regenerated `generatedAssets.ts` alongside your dashboard
change — nothing enforces this automatically (no pre-commit hook or CI
check), so it's easy to forget and let the app silently drift from web.

### What's still needed before this is real on a device

1. **A data endpoint the app can call.** `AnalyticsScreen.tsx` reads
   `process.env.EXPO_PUBLIC_ANALYTICS_DATA_URL` — unset today, so the screen
   shows the bundled all-empty placeholder with an on-screen notice
   explaining why. This needs a `bilinguist-worker` route that serves
   `posthog-dashboard/dist/data.json`'s contents (proxy from GitHub, or read
   from KV synced by the same Action) — no credentials should ship in the
   app bundle. Same underlying gap as the refresh-button endpoint above;
   worth building both in the same pass.
2. **Set the env vars** in `bilinguist-brief`'s EAS build config (`eas.json`,
   same pattern as the existing `EXPO_PUBLIC_*` keys already injected there)
   once the endpoint exists:
   - `EXPO_PUBLIC_ANALYTICS_DATA_URL`
   - `EXPO_PUBLIC_ANALYTICS_REFRESH_URL` (optional — button degrades to
     "Refresh unavailable" without it)
   - `EXPO_PUBLIC_ADMIN_EMAILS` (optional — defaults to the owner's email
     hardcoded in `constants/admin.ts` if unset)
3. **Never actually run on a device or in TestFlight.** Verification so far
   is: `tsc --noEmit` clean on every new/changed file, and the *exact* HTML
   string the WebView will load was rendered in a headless browser (Playwright)
   confirming it shows a correct empty state with zero fabricated numbers
   and that `window.__setData__` live-updates without a reload. That is not
   the same as confirming it works inside `react-native-webview` on iOS —
   test on a real build (`npx eas-cli build --platform ios --profile
   production`, the same command the existing TestFlight workflow uses)
   before considering this done.
4. **iPad-specific layout check.** The dashboard's CSS grid (`.kpi-row`,
   `.grid-2`) was designed for desktop web widths; it wasn't tuned against
   an iPad viewport specifically. Worth a visual pass once it's running on
   an actual iPad/simulator — likely fine given the grid is responsive, but
   unverified.

## Chart-by-chart notes (read before changing anything)

- **Briefs read over time** — one line per selected language (or all 9,
  folding `ar` to a muted "Other" swatch since the categorical palette only
  cleanly supports 8 simultaneous series — see `dataviz` skill's palette
  notes if you add a 9th real slot).
- **Level breakdown per language** — stacked by CEFR level using an ordinal
  blue ramp (`--lvl-a1` … `--lvl-native` in `dist/index.html`), not the
  categorical palette — these are ordered, not independent identities.
- **Word engagement funnel / Subscription funnel** — these show **per-step
  totals in the selected window, not a true sequential per-user funnel**.
  A real ordered funnel (did user X do step 1 *then* step 2) needs either
  PostHog's native Funnels insight API or a HogQL window-function query
  keyed on `distinct_id`/`person_id` ordering — deliberately not built here
  per the spec's own caveat list; ask the product owner before doing this,
  since a "true" funnel with PostHog's person-merge across the anonymous→
  signed-up boundary is nontrivial to get right silently.
- **Active readers KPI** — labelled "(≈)" in the UI. It's the sum of daily
  unique-user counts, which **overcounts** anyone active on more than one day
  in the window. True cross-day dedup isn't derivable from daily aggregates;
  it needs either raw event-level `distinct_id` lists (expensive to fetch
  for a dashboard) or a HogQL query with `count(DISTINCT person_id)` over
  the *whole* range rather than per-day (doable — see "possible upgrades").
- **Game scores** are intentionally **not charted** — the spec says score
  scale varies per game (`game_name`) and must never be averaged or compared
  across types. Only volume (`game_opened`) and completion rate
  (`game_completed ÷ game_opened`) are shown.
- **`subscription_status` is not available** on word/game events (person
  property, not event property) — not attempted here; would need a
  separate PostHog Persons query if ever needed.

## Possible upgrades (not done, scoping notes only)

- Swap the per-day "Active readers" approximation for a true
  `count(DISTINCT person_id)` over the full selected range — doable in
  `fetch_data.py` as one more query per timeframe preset, but the current
  client-side-slicing architecture means the range is chosen in the browser
  *after* the CI fetch, so this would require either fetching several
  precomputed ranges or moving that one KPI to a live query (defeats the
  "no PostHog call per click" design). Flagging, not solving.
- Real ordered funnels via PostHog's Funnels API once step definitions are
  confirmed with the product owner.

## Security note

`POST_HOG_API` is a **Personal API Key** (read-only scopes: Event/Query). If
it's ever exposed, revoke and rotate it from PostHog → Settings → Personal
API Keys immediately. The proposed `GITHUB_DISPATCH_TOKEN` for the refresh
button should be a fine-grained PAT scoped to **this repo only**, with
`Actions: write` and nothing else.

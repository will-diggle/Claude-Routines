# PostHog Analytics Dashboard — Handover

## What this is

A self-refreshing analytics dashboard, styled after Amplitude/Mixpanel, that pulls
live data from PostHog (EU Cloud, project `208705`) and renders a static HTML page.
It is **not yet embedded in the live website** — that's the integration task.

## How it works

```
posthog-dashboard/
  fetch_data.py     - calls PostHog's HogQL Query API, writes data.json
  render.py         - turns data.json + template.html into dist/index.html
  template.html     - the dashboard markup/styles (edit this to restyle)
  data.json          - latest fetched data (generated, committed by CI)
  dist/index.html    - the rendered dashboard (generated, committed by CI)
```

`.github/workflows/posthog-dashboard.yml` runs both scripts every 6 hours (and on
manual trigger) and commits the regenerated `data.json` + `dist/index.html` back to
the repo. That keeps `posthog-dashboard/dist/index.html` always reasonably fresh
without needing a live backend.

## Required repo secrets (already set)

- `POST_HOG_API` — PostHog **Personal API Key** (read scopes: Insight, Event, Query)
- `POSTHOG_PROJECT_ID` — `208705`
- `POSTHOG_HOST` — `https://eu.posthog.com`

## What's NOT built yet — the integration task

The site (`bilinguist-web`, Astro on Cloudflare) doesn't serve this dashboard yet.
Pick one of these approaches:

1. **Simplest — static copy at build time.** In the Astro build, copy
   `posthog-dashboard/dist/index.html` into `bilinguist-web/public/analytics/index.html`
   (or wherever it should live), so it's served as a static route,
   e.g. `yoursite.com/analytics`. Gate it behind auth/basic-auth at the edge
   (Cloudflare Access or a Worker check) since it's internal data, not public marketing content.

2. **Native Astro page.** Turn `template.html` into an `.astro` page/component that
   reads `data.json` at build time (`import data from '../../posthog-dashboard/data.json'`)
   and renders with Astro's templating instead of string replacement. Cleaner
   long-term if the site team wants to keep iterating on the design.

3. **Client-side fetch.** Have an Astro page fetch `data.json` directly (it can be
   copied to `public/`) and render client-side with a small script. Keeps the page
   itself cacheable/static while data updates independently.

Recommend **option 1** for a fast first pass, **option 2** if this becomes a
long-lived internal tool.

## Known limitations / things to extend

- **Funnel and retention are not wired up yet.** They need PostHog-specific funnel
  step definitions (which events count as which funnel stage) that only the
  product owner can specify — ask before building; don't guess event names.
- **Top pages relies on PostHog's default autocapture** (`$pageview` /
  `$current_url`). If the app uses custom pageview tracking, update
  `PAGEVIEW_EVENT` and the property name in `fetch_data.py`.
- **Data freshness is 6-hourly, not real-time.** A published Claude-artifact
  version of this dashboard was also built for quick viewing, but Claude artifacts
  cannot call arbitrary external APIs (PostHog isn't a connector), so that version
  can only ever show a static snapshot — this repo-based pipeline is the
  source of truth going forward.
- The workflow pushes to whatever branch it runs on. Once this is merged to the
  site's default/production branch, confirm the cron job still targets the right
  branch (add `ref:` in the checkout step if it should run against a specific one).

## Security note

`POST_HOG_API` is a **Personal API Key** tied to a PostHog user account (read-only
scopes: Insight/Event/Query). If it's ever exposed, revoke and rotate it from
PostHog → Settings → Personal API Keys immediately.

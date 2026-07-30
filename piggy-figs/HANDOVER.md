# Piggy Figs — Handover

## What this is

A standalone iOS/iPad app — **completely separate from `bilinguist-brief`**,
its own Expo project, its own bundle identifier, its own TestFlight track —
that shows PostHog analytics for any number of apps as home-screen tiles.
Tap a tile → its dashboard. Tap "Add app" → connect another PostHog project
directly from the device, no backend required.

This exists because an earlier attempt put an analytics screen inside
`bilinguist-brief` without being asked to — that was reverted in full. This
app is the correct, isolated alternative: it shares nothing with
`bilinguist-brief`'s code, build, or App Store listing.

## Architecture — no backend, on-device only

Unlike `posthog-dashboard/` (the web version, which relies on a GitHub
Actions cron pulling data server-side), this app queries PostHog **directly
from the device** using a Personal API Key the user enters and stores
locally:

```
src/
  lib/connections.ts   - stores each connected app's name/project id/host in
                          AsyncStorage, and its API key separately in
                          SecureStore (iOS Keychain) — never in plain text
  lib/posthog.ts        - HogQL Query API client (fetch, no SDK dependency)
  dashboard/assets.ts    - the dashboard HTML/JS rendered in a WebView,
                            generic (works for any PostHog project — KPIs,
                            DAU trend, top events, top pages)
  screens/HomeScreen.tsx      - grid of app tiles + "Add app" button
  screens/AddAppScreen.tsx     - form: name, project ID, region/host, API key
                                  (tests the credentials against PostHog
                                  before saving, so a typo doesn't create a
                                  dead tile)
  screens/DashboardScreen.tsx  - WebView host, pull-to-refresh via header icon
```

**Why generic, not Bilinguist Brief's specific event schema.** The
Bilinguist-specific dashboard (`posthog-dashboard/`) charts events like
`brief_completed`, `word_saved`, CEFR levels, etc. — meaningless for a
project we know nothing about. This app instead uses only PostHog's
autocapture defaults (`$pageview`, `$session_id`) so it works for *any*
connected project out of the box: unique users, total events, sessions,
DAU trend, top events, top pages. If you want Bilinguist Brief's tile to
show its specialized charts instead, that's a real upgrade path (see below)
— not built here, to keep this app decoupled from that app's schema.

## Status

- `npx tsc --noEmit` passes clean.
- **Confirmed working on a real device**, via Expo Go, with a live Bilinguist
  Brief PostHog project: adding a connection, testing credentials, and
  pulling real KPI/event data all work end to end.
- One real bug was found and fixed this way (not caught by any headless
  test): AsyncStorage's native module isn't present in the Expo Go build
  used, which broke "Test & Save" with "Native module is null, cannot access
  legacy storage." Fixed by moving the connection list to `expo-secure-store`
  — see the git history on `src/lib/connections.ts` for the full story.
- Two dashboard types now exist per connection (`kind: 'generic' |
  'bilinguist'`), chosen on Add App. Bilinguist mode's exact embedded HTML
  (with `window.__EMBEDDED__`, no initial data, then a live `__setData__`
  push) was verified in a headless browser — correct rendering, no console
  errors — but **not yet confirmed on-device**, unlike the generic dashboard.

### Liquid Glass buttons — needs a dev client, not Expo Go

Buttons now use `expo-glass-effect`'s `GlassView` (Apple's real native
Liquid Glass API, iOS 26+) via `src/components/GlassButton.tsx`. **This is a
native module Expo Go does not bundle** — running `npx expo start --ios` as
before will very likely fail to find it on iOS (Android silently falls back
to a plain `View`, since `GlassView`'s non-iOS implementation doesn't touch
the native module at all).

To actually run this now, switch from Expo Go to a **development build**:

```bash
npx expo prebuild --platform ios   # generates ios/ from app.json, first time only
npx expo run:ios                    # builds a custom dev client and launches it
```

(`expo-dev-client` is already installed.) This needs Xcode installed and
will take longer than Expo Go's instant reload the first time, but supports
the same fast-refresh workflow afterward. Alternatively, `eas build
--profile development` builds it in the cloud instead of locally.

`GlassButton` degrades gracefully (a plain tinted `View`, not a crash) on
anything pre-iOS-26 or on Android — `isLiquidGlassAvailable()` gates the
fallback styling — but the *module itself* still needs to be present in the
binary, which is the part Expo Go can't provide.

## What's needed before TestFlight

1. **Apple Developer + EAS setup, done once, interactively.** This is a
   brand-new bundle ID (`com.williamdiggz.piggyfigs`) that doesn't exist in
   App Store Connect yet. Run `eas build --platform ios --profile
   production` locally/interactively — EAS will prompt to log into your
   Apple Developer account and can register the bundle ID + provisioning
   profile automatically. I can't do this from here: it needs your Apple ID
   / 2FA, which isn't available in this sandbox.
2. **Register the app in App Store Connect** (or let `eas submit` do it on
   first submit) to get an `ascAppId`, then add it to `eas.json`'s
   `submit.production.ios.ascAppId` — left out for now since it doesn't
   exist yet (unlike `bilinguist-brief/eas.json`, which already has one).
3. **On-device test of the dev-client build** (see Liquid Glass section
   above) — the production TestFlight build uses the same native module, so
   this needs to actually work in a dev client before shipping.
4. **App icon / branding assets.** A logo was shared in chat (pig-in-mud,
   "Piggy Figs" branding) but I have no way to save a pasted-in-chat image
   to disk in this environment — still using Expo's placeholder icon. Send
   it as a file attachment, or drop it at `assets/icon.png` yourself, and
   I'll wire up the full icon set (adaptive icon, favicon, splash).

## Security notes

- Each PostHog Personal API Key is stored in `expo-secure-store`
  (iOS Keychain), scoped per-connection, never logged, never sent anywhere
  except the PostHog host the user configured for that connection.
- `AddAppScreen` requires the key to actually authenticate (a real HogQL
  query) before saving — bad credentials never get persisted.
- Long-press a tile on the home screen to remove a connection; this deletes
  both the AsyncStorage entry and the Keychain secret.

## Possible upgrades (not done — scoping notes)

- A specialized dashboard variant for Bilinguist Brief's actual event
  schema (reusing `posthog-dashboard/dist/dashboard.js`'s chart logic),
  selected automatically when the connected project ID matches `208705`.
  Skipped for now to keep this app fully generic and decoupled.
- Biometric lock (Face ID) on app open, since this holds API keys and
  business metrics — worth considering given it'll live on a personal iPad.
- Android was scaffolded (Expo supports both) but not verified at all;
  this was scoped iOS/iPad-first per the original request.

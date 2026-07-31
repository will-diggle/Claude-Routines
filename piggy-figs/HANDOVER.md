# Piggy Figs — Handover

Written for whoever (human or another Claude Code session) picks this up
next, running locally on the owner's Mac rather than in a cloud sandbox.

## What this is

A standalone iOS/iPad app — **completely separate from `bilinguist-brief`**,
its own Expo project (`piggy-figs/`), its own bundle identifier
(`com.williamdiggz.piggyfigs`), its own future TestFlight track — that shows
PostHog analytics for any number of apps as home-screen tiles. Tap a tile →
its dashboard. Tap "Add app" → connect another PostHog project directly from
the device. No backend, no server of ours involved anywhere.

This exists because an earlier attempt put an analytics screen inside
`bilinguist-brief` without being asked to — that was reverted in full (see
that repo's git history if curious). **Never add anything to
`bilinguist-brief` as part of Piggy Figs work** — the owner was explicit and
frustrated about this once already.

## Repo / branch

- Repo: `will-diggle/Claude-Routines` (monorepo — `piggy-figs/` is one
  subdirectory among several unrelated apps: `bilinguist-brief`,
  `bilinguist-web`, `bilinguist-worker`, `bilinguist-native`,
  `posthog-dashboard`). **Only touch `piggy-figs/`** unless explicitly asked
  otherwise.
- Branch: `claude/posthog-analytics-dashboard-uile48` — this is where all
  Piggy Figs work has happened so far. Confirm with the owner whether to
  keep committing here or cut a fresh branch before continuing.
- A zip snapshot of the code was also sent to the owner directly in chat at
  one point. **Treat the git branch as the source of truth** unless told
  otherwise — the zip was a point-in-time export, not a synced copy.

## Architecture — on-device only, no backend

Every dashboard queries PostHog **directly from the device**, using a
Personal API Key the user enters and that's stored only in
`expo-secure-store` (iOS Keychain):

```
src/
  lib/connections.ts        - CRUD for saved connections. Everything lives
                               in expo-secure-store (NOT AsyncStorage — see
                               "Known gotchas" below for why that matters).
                               list = one key; each connection's API key =
                               its own separate key.
  lib/posthog.ts             - Generic dashboard's HogQL Query API client.
                                fetchOverview(conn, apiKey, days) is
                                parameterized by timeframe (1/7/30/90 days).
  lib/posthogBilinguist.ts    - Bilinguist-specific client: 15 separate
                                 HogQL queries mirroring
                                 posthog-dashboard/fetch_data.py's event
                                 schema (brief_completed, word_saved, CEFR
                                 levels, funnels, streaks, etc).
  dashboard/assets.ts          - Generic dashboard HTML/JS (WebView).
                                  Has its own timeframe buttons that
                                  postMessage back to React Native (see
                                  DashboardScreen.tsx) to trigger a refetch.
  dashboard/bilinguistAssets.ts - GENERATED FILE, do not hand-edit. Mirrors
                                   posthog-dashboard/dist/index.html +
                                   dashboard.js. Regenerate via
                                   `node ../posthog-dashboard/sync-piggyfigs-assets.mjs`
                                   after editing the source in
                                   posthog-dashboard/dist/.
  components/GlassButton.tsx    - Plain Pressable + Animated.View button:
                                   spring squeeze-and-bounce press, haptics.
                                   NOT native Liquid Glass — see below.
  components/SegmentedControl.tsx - Generic <T extends string> segmented
                                     control matching the design brief's spec.
  theme/tokens.ts               - Color/spacing/radius/font tokens from the
                                   Bilinguist Brief design system reference
                                   (White + Night themes only — Cream/Navy
                                   were explicitly descoped by the owner).
  screens/HomeScreen.tsx         - Tile grid + Add app button. Long-press a
                                    tile → Edit or Remove.
  screens/AddAppScreen.tsx        - Add/Edit form. Tests credentials against
                                     PostHog before saving.
  screens/DashboardScreen.tsx      - WebView host for either dashboard kind,
                                      native refresh button, onMessage
                                      bridge for the generic dashboard's
                                      timeframe filter.
```

Each saved connection has a `kind: 'generic' | 'bilinguist'` chosen at
Add/Edit time, which decides which dashboard assets + fetcher get used.

## Status — what's actually confirmed working

Real device testing (Expo Go on the owner's Mac Simulator, against a live
Bilinguist Brief PostHog project) has confirmed:
- Adding a connection, credential testing, saving
- Editing an existing connection
- Generic dashboard: KPIs, DAU chart, top events/pages, timeframe filter
  buttons (Today/7/30/90 days) round-tripping through the WebView↔RN
  postMessage bridge
- Bilinguist dashboard: **not yet confirmed on-device** — its exact
  embedded HTML was verified correct in a headless browser (Playwright),
  but nobody has actually opened it on the phone/simulator yet. Do that
  before assuming it's fine.

`npx tsc --noEmit` is clean as of every commit on this branch.

## Liquid Glass — tried, reverted; don't re-attempt lightly

An earlier version used `expo-glass-effect`'s native `GlassView` (Apple's
real Liquid Glass API, iOS 26+). It required a custom dev client instead of
plain Expo Go, and its build tooling — a nested `xcodebuild` call hand-
assembling an `.xcframework` with its own caching — kept failing in ways
that ate a huge amount of the owner's time (Swift compiler ambiguity bugs,
cache invalidation surviving `expo prebuild --clean`, opaque `-quiet`
failures). It was fully reverted. `GlassButton` is now a plain styled
button with the same shape/animation/haptics, no native glass material.

**The app runs in plain Expo Go**: `npx expo start --ios`, no prebuild, no
dev client, no Xcode build step. If Liquid Glass comes up again, budget
real dedicated time for it and expect friction — it is not a quick add,
and the owner is (reasonably) wary of it after this experience.

## Design system

Applied from a Bilinguist Brief design-system reference doc the owner
shared (an artifact, not a file in this repo): newspaper/editorial serif
typography, the "chrome" accent-pairing concept (paired ink color for
selection instead of a generic blue), spacing/radius tokens, and a proper
Segmented Control component. Only **two** of that reference's four themes
were built — White (day) and Night (dark), auto-switching with the device's
appearance setting. Cream and Navy were explicitly descoped by the owner
("just do white and black/dark") — don't add them without being asked.

**Not ported**: the design reference's "Floating Pill Bar" navigation and
true "Bottom Sheet" modals (large top-corner radius, no drag handle,
swipe-to-dismiss). Piggy Figs uses standard React Navigation stack/modal
presentation instead — judged as reasonable scope control for a utility
app, not an oversight. Revisit only if explicitly asked.

## Known gotchas (read before touching storage or native modules)

1. **Storage must stay on `expo-secure-store`, not AsyncStorage.** An
   earlier version used `@react-native-async-storage/async-storage` for the
   non-secret connection list and it broke with "Native module is null,
   cannot access legacy storage" — that Expo Go build didn't bundle the
   module. Don't reintroduce AsyncStorage without checking this still holds
   for whatever Expo SDK version is current then.
2. **Any new native module needs a real Expo Go compatibility check before
   committing to it.** `expo-glass-effect` (above) is the cautionary tale.
   If a package's docs mention "requires a development build," that's Expo
   CLI-speak for "won't work in plain Expo Go" — flag that to the owner
   *before* building on top of it, not after.
3. **A stale dev-client app can get stuck on the Simulator** after any
   `expo run:ios`/`expo prebuild` experiment, and Expo CLI will then assume
   the project needs a dev client even after the dependency is removed. Fix:
   `xcrun simctl uninstall booted com.williamdiggz.piggyfigs`, delete
   `.expo/` and any local `ios/`/`android/` folders, retry.
4. **`piggy-figs/package.json` can end up with local-only changes** (e.g.
   from `npm audit fix`) that block a clean `git pull`. If pull says
   "can be fast-forwarded" but doesn't seem to apply, check `git status` —
   uncommitted local changes to a file a new commit also touches will block
   it silently.

## What's needed before TestFlight

1. **Apple Developer + EAS setup, done once, interactively** — the bundle ID
   doesn't exist in App Store Connect yet. Run `eas build --platform ios
   --profile production` and let it prompt for Apple ID login; this needs
   the owner's actual Apple Developer credentials/2FA.
2. **Register the app in App Store Connect** (or let `eas submit` do it),
   then add the resulting `ascAppId` to `eas.json`'s
   `submit.production.ios.ascAppId` (currently absent, unlike
   `bilinguist-brief/eas.json`, which already has one).
3. **On-device test of the actual build**, including the Bilinguist
   dashboard specifically (see Status above).
4. **Real app icon.** The owner shared a pig-in-mud logo pasted directly in
   chat at least once; a pasted image can't be saved to disk by a Claude
   Code session (no file access to it) — it needs to arrive as an actual
   file attachment, or be placed at `assets/icon.png` by the owner directly.
   Once present, wire up the full icon set (adaptive icon, favicon, splash)
   in `app.json`.

## Security notes

- Each PostHog Personal API Key lives only in `expo-secure-store` (iOS
  Keychain), scoped per-connection, entered by the user, never hardcoded,
  never logged. **Audited**: a full search of this branch's git history
  (not just current source) found zero API keys anywhere in the code.
- `AddAppScreen` requires a real successful HogQL query against the
  credentials before saving — bad input never gets persisted.
- Long-press → Remove deletes both the connection's metadata and its
  Keychain secret.

## Possible upgrades (scoping notes, not started)

- Biometric (Face ID) lock on app open — this app holds API keys and
  business metrics and will live on a personal iPad; worth considering.
- Android was scaffolded (Expo supports both) but never tested at all —
  this was explicitly iOS/iPad-first.
- Letting the user pick which widgets/charts appear per dashboard (raised
  once, not pursued — the timeframe-filter work was prioritized instead).

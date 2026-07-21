# bilinguist-web

Companion website for the Bilinguist Brief iOS app — replicates the app's
broadsheet reading experience in a browser. Built with [Astro](https://astro.build)
(static output), styled with CSS custom-property design tokens mirrored from
`bilinguist-brief/src/theme`.

## Content source

The daily brief is fetched client-side, live, from the same Cloudflare
Worker the iOS app uses (`bilinguist-worker`):

```
GET https://bilinguist-brief.williamdiggz.workers.dev/latest?lang={code}&level={level}
```

This is a filtered slice of the Worker's `/latest` bundle (added alongside
this site — see `bilinguist-worker/src/index.ts`), scoped to one
language/level instead of the full multi-language payload. The Worker sets
`Access-Control-Allow-Origin: *` and needs no key — the underlying private
GitHub data repo token stays server-side inside the Worker.

## Preferences

Language, CEFR level, theme, and font are stored in `localStorage` only
(`src/lib/preferences.ts`) — no accounts, no cookies, no sync. Defaults to
Newsprint theme, English, A2, Lora.

## Development

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # astro check + static build to dist/
npm run preview   # serve the built dist/ locally
```

## Deploying to Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- No environment variables required (the Worker URL is a public endpoint,
  hardcoded in `src/lib/config.ts`).

## Next phases (not in this build)

- Accounts / auth
- Paywall (currently all languages, levels, and full brief length are shown)
- Privacy Policy / Terms of Service content (currently placeholder stubs in
  `src/pages/privacy.astro` and `src/pages/terms.astro`)

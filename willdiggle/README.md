# willdiggle.co.uk

Static rebuild of the Wix site, hosted on Cloudflare Pages.

## Status

- [x] Contact form backend (`functions/api/contact.js`)
- [] Page markup + styles — blocked: this session's egress proxy denies
      `www.willdiggle.co.uk`, so the original design could not be read.
      Allow that domain (and `static.wixstatic.com` for the photos) in the
      environment's network policy, then the pages can be copied over.

## Layout

```
public/          static site (HTML/CSS/images) — Pages build output
functions/api/   Cloudflare Pages Functions (server-side routes)
```

## Deploying

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this repo.
2. Build command: none. Build output directory: `willdiggle/public`.
3. Settings → Environment variables, add:
   - `RESEND_API_KEY` (secret) — sign up at resend.com, free tier is plenty
   - `CONTACT_TO` — `williamdiggz@gmail.com`
   - `CONTACT_FROM` — e.g. `site@willdiggle.co.uk`, once the domain is verified
     in Resend. Until then the form falls back to Resend's test sender.
4. Custom domain: add `willdiggle.co.uk` and `www` under the Pages project's
   Custom domains tab. Do this only once the site looks right — pointing the
   domain here takes it off Wix.

## Local preview

```
npx wrangler pages dev willdiggle/public
```

## Contact form contract

`POST /api/contact`, form-encoded or JSON:
`name`, `email`, `message`, optional `subject`, plus a hidden `website`
honeypot field that must stay empty. Responds `{ ok: true }` or
`{ ok: false, error }`.

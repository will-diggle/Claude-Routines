# willdiggle.co.uk

Static rebuild of the Wix site, hosted on Cloudflare Pages.

## Status

- [x] Contact form backend (`functions/api/contact.js`)
- [] Page markup + styles — blocked: this session's egress proxy denies
      `www.willdiggle.co.uk`, so the original design could not be read.
      Allow that domain (and `static.wixstatic.com` for the photos) in the
      environment's network policy, then the pages can be copied over.

## Layout

Same shape as `bilinguist-web`: a Worker serving static assets, so the site
and the contact endpoint live in one deployment.

```
public/        static site (HTML/CSS/images), served via the ASSETS binding
src/worker.js  Worker entry — routes /api/contact, else falls through to assets
src/contact.js contact form handler
wrangler.toml  Worker config
```

## Deploying

Deploys run from GitHub Actions (`.github/workflows/deploy-willdiggle.yml`) on
every push to the working branch. Two repository secrets are required —
GitHub → Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens → Create,
  using the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare dashboard sidebar, Workers & Pages

The Resend key is a Worker secret rather than a repo secret, set once:

```
npx wrangler secret put RESEND_API_KEY --name willdiggle
```

Deploys land on `willdiggle.<subdomain>.workers.dev` for review. Going live is
a separate, deliberate step: uncomment the `routes` block in `wrangler.toml`
and deploy again. That is what takes the domain off Wix, so don't do it until
the site looks right.

## Local preview

```
npx wrangler dev
```

## Contact form contract

`POST /api/contact`, form-encoded or JSON:
`name`, `email`, `message`, optional `subject`, plus a hidden `website`
honeypot field that must stay empty. Responds `{ ok: true }` or
`{ ok: false, error }`.

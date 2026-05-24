/**
 * Bilinguist Brief — Cloudflare Worker proxy
 *
 * Sits between the app and the private bilinguist-data GitHub repo.
 * The GitHub token lives only in Cloudflare secrets — never in the app.
 *
 * Routes:
 *   GET /latest                      → latest.json (today's full bundle)
 *   GET /briefings/YYYY-MM-DD        → briefings/YYYY-MM-DD.json (archive)
 */

interface Env {
  GITHUB_TOKEN: string;
}

const REPO = 'will-diggle/bilinguist-data';
const BRANCH = 'main';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { pathname } = new URL(request.url);

    let filePath: string | null = null;

    if (pathname === '/latest') {
      filePath = 'latest.json';
    } else {
      const archive = pathname.match(/^\/briefings\/(\d{4}-\d{2}-\d{2})$/);
      if (archive) filePath = `briefings/${archive[1]}.json`;
    }

    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }

    const upstream = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${filePath}`;

    const githubRes = await fetch(upstream, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Bilinguist-Brief-Worker/1.0',
      },
      // Always fetch fresh from GitHub — data changes once a day and staleness
      // (serving yesterday's bundle) breaks the app's date-match check.
      cf: { cacheEverything: false },
    } as RequestInit & { cf: { cacheEverything: boolean } });

    if (!githubRes.ok) {
      const status = githubRes.status === 404 ? 404 : 502;
      return new Response(status === 404 ? 'Not found' : 'Upstream error', { status });
    }

    const body = await githubRes.text();

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        // no-cache: clients must revalidate; no stale bundles survive a new deploy
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};

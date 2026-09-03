/* ============================================================
   willdiggle — Worker entry
   Serves the static site from ./public and handles the contact
   form at /api/contact.
   ============================================================ */

import { handleContact } from "./contact.js";

/* The Diary page is hidden for now. diary.html and its images stay in the
   repo, so putting it back is a matter of deleting this list, restoring the
   nav item on the six pages, and dropping the noindex meta tag.

   These are 302s on purpose: a 301 would be cached by browsers and would
   keep redirecting visitors long after the page is switched back on. */
const HIDDEN = new Set([
  "/diary", "/diary.html", "/items",
  "/de/diary", "/de/diary.html", "/de/items",
]);

/* ── Language ──────────────────────────────────────────────────────────────
   A first-time visitor arriving at the bare "/" from a German-speaking
   country is sent to /de/. Deliberately narrow:

   - Only "/" redirects. A link to /about stays on /about, so nothing anyone
     shares can bounce the person who follows it somewhere unexpected.
   - A choice made with the EN | DE switch wins, and is remembered for a year.
     Nobody should have to fight the site to read it in their own language.
   - Always a 302. The two versions are different pages, and a cached
     permanent redirect would be near-impossible to undo from here.       */

const GERMAN_SPEAKING = new Set(["DE", "AT", "LI"]);
const LANG_COOKIE = "lang";
const YEAR = 60 * 60 * 24 * 365;

function chosenLanguage(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)lang=(en|de)(?:;|$)/);
  return match ? match[1] : null;
}

function prefersGerman(request) {
  const country = request.cf && request.cf.country;
  if (GERMAN_SPEAKING.has(country)) return true;

  // Switzerland is only partly German-speaking, so ask the browser rather
  // than handing a French or Italian speaker a German page.
  if (country === "CH") {
    const accept = (request.headers.get("Accept-Language") || "").toLowerCase();
    return accept.startsWith("de");
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }
      return handleContact(request, env);
    }

    // The EN | DE switch appends ?lang=xx. Record the choice, then send the
    // visitor to the clean URL so the parameter never sticks around.
    const asked = url.searchParams.get("lang");
    if (asked === "en" || asked === "de") {
      const to = new URL(url);
      to.searchParams.delete("lang");
      return new Response(null, {
        status: 302,
        headers: {
          Location: to.pathname + to.search + to.hash,
          "Set-Cookie": `${LANG_COOKIE}=${asked}; Path=/; Max-Age=${YEAR}; SameSite=Lax; Secure`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Trailing slashes so /diary/ lands here too.
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (HIDDEN.has(path)) {
      // Keep German visitors on the German side of the site.
      const home = path.startsWith("/de/") ? "/de/" : "/";
      return Response.redirect(new URL(home, url).toString(), 302);
    }

    if (path === "/") {
      const chosen = chosenLanguage(request);
      const german = chosen ? chosen === "de" : prefersGerman(request);
      if (german) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/de/", Vary: "Cookie", "Cache-Control": "no-store" },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};

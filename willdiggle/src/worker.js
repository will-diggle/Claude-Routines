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

    // Trailing slashes so /diary/ lands here too.
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (HIDDEN.has(path)) {
      // Keep German visitors on the German side of the site.
      const home = path.startsWith("/de/") ? "/de/" : "/";
      return Response.redirect(new URL(home, url).toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};

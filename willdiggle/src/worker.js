/* ============================================================
   willdiggle — Worker entry
   Serves the static site from ./public and handles the contact
   form at /api/contact.
   ============================================================ */

import { handleContact } from "./contact.js";

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

    return env.ASSETS.fetch(request);
  },
};

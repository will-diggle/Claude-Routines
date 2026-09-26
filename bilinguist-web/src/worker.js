/* ============================================================
   bilinguist-web — Worker entry
   Serves the static Astro site, answers /api/locale-price and
   /api/entitlement, and hosts the race rooms for Die
   Kartoffel-Regatta at /api/race/<CODE>.
   ============================================================ */

// EU member states — priced in euros. GB gets pounds, everyone else (US
// included) gets dollars as the catch-all.
const EUR_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

function priceForCountry(country) {
  if (country === "GB") return { currency: "GBP", symbol: "£", amount: "3.99" };
  if (EUR_COUNTRIES.has(country)) return { currency: "EUR", symbol: "€", amount: "3.99" };
  return { currency: "USD", symbol: "$", amount: "4.99" };
}

// ── Paid status ─────────────────────────────────────────────────
// The app decides paid vs free from RevenueCat (its app_user_id is the
// Supabase user id, via Purchases.logIn), so the website asks RevenueCat
// too, through its v2 API. The secret key stays here on the server: set it
// as the Worker secret REVENUECAT_SECRET_KEY (a v2 key with read access to
// customer information and project configuration). The caller proves who
// they are with their Supabase access token, which Supabase itself checks.

const SUPABASE_URL = "https://llkufcnkpgynwkgmoxmb.supabase.co";
const ENTITLEMENT_LOOKUP_KEY = "bilinguist_brief_pro";
const RC_API = "https://api.revenuecat.com/v2";

const PRIVATE_JSON = { "content-type": "application/json", "cache-control": "private, no-store" };

async function supabaseUser(request, env) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // The anon key is public (it ships in the app); the site sends it along
  // in case the Worker hasn't been given its own copy.
  const apikey = env.SUPABASE_ANON_KEY || request.headers.get("apikey") || "";
  if (!token || !apikey) return null;
  const res = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && typeof user.id === "string" ? user : null;
}

function revenueCat(path, env) {
  return fetch(`${RC_API}${path}`, {
    headers: { authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`, accept: "application/json" },
  });
}

// A v2 key belongs to one project, so its id can be looked up rather than
// configured (REVENUECAT_PROJECT_ID overrides). Remembered per Worker instance.
let rcProjectId = null;
async function revenueCatProject(env) {
  if (env.REVENUECAT_PROJECT_ID) return env.REVENUECAT_PROJECT_ID;
  if (rcProjectId) return rcProjectId;
  const res = await revenueCat("/projects", env);
  if (!res.ok) return null;
  rcProjectId = (await res.json())?.items?.[0]?.id ?? null;
  return rcProjectId;
}

// v2 reports entitlements by RevenueCat's own id, not the app's lookup key.
let rcEntitlementId;
async function proEntitlementId(env, projectId) {
  if (rcEntitlementId !== undefined) return rcEntitlementId;
  const res = await revenueCat(`/projects/${projectId}/entitlements?limit=100`, env);
  if (!res.ok) return null;
  const items = (await res.json())?.items ?? [];
  rcEntitlementId = items.find((e) => e.lookup_key === ENTITLEMENT_LOOKUP_KEY)?.id ?? null;
  return rcEntitlementId;
}

function stillActive(item, now) {
  const until = item.expires_at;
  if (until === null || until === undefined) return true;
  const ms = typeof until === "number" ? until : Date.parse(until);
  return ms > now;
}

function entitlementReply(tier, source) {
  return new Response(JSON.stringify({ tier, source }), { headers: PRIVATE_JSON });
}

async function handleEntitlement(request, env) {
  const user = await supabaseUser(request, env);
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: PRIVATE_JSON });

  if (!env.REVENUECAT_SECRET_KEY) return entitlementReply(null, "unconfigured");

  const projectId = await revenueCatProject(env);
  if (!projectId) return entitlementReply(null, "revenuecat_error");

  const res = await revenueCat(
    `/projects/${projectId}/customers/${encodeURIComponent(user.id)}/active_entitlements`,
    env,
  );
  // Someone who has never opened a purchase in the app isn't a RevenueCat customer yet.
  if (res.status === 404) return entitlementReply("free", "revenuecat");
  if (!res.ok) return entitlementReply(null, "revenuecat_error");

  const now = Date.now();
  const active = ((await res.json())?.items ?? []).filter((item) => stillActive(item, now));
  const proId = await proEntitlementId(env, projectId);
  // The app has one entitlement; if its id can't be resolved, any active one counts.
  const premium = proId ? active.some((item) => item.entitlement_id === proId) : active.length > 0;
  return entitlementReply(premium ? "premium" : "free", "revenuecat");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/entitlement") {
      return handleEntitlement(request, env);
    }

    if (url.pathname === "/api/locale-price") {
      const country = (request.cf && request.cf.country) || "GB";
      const price = priceForCountry(country);
      return new Response(JSON.stringify({ country, ...price }), {
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    if (url.pathname.startsWith("/api/race/")) {
      const code = (url.pathname.split("/")[3] || "").toUpperCase();
      if (!/^[A-Z]{3,8}$/.test(code)) {
        return new Response("bad room code", { status: 400 });
      }
      const room = env.RACE.get(env.RACE.idFromName(code));
      return room.fetch(request);
    }

    // The link people will be given has no trailing slash; send it to the
    // directory index rather than relying on the asset server to guess.
    if (url.pathname === "/kartoffel-regatta") {
      const to = new URL(request.url);
      to.pathname = "/kartoffel-regatta/";
      return Response.redirect(to.toString(), 301);
    }

    // the game moved to /kartoffel-regatta/; keep the old links working
    if (url.pathname.startsWith("/kartoffeln-race")) {
      const to = new URL(request.url);
      to.pathname = url.pathname.replace("/kartoffeln-race", "/kartoffel-regatta");
      return Response.redirect(to.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};

/* ------------------------------------------------------------
   One room. It holds the connections and relays; it deliberately
   runs no game logic of its own. Every player simulates their own
   boat, which is what keeps steering free of lag, and the room
   just gathers everyone's position and fans out one combined
   snapshot at a fixed rate.
   ------------------------------------------------------------ */

const TICK_MS = 66;          // ~15 snapshots a second
const MAX_PLAYERS = 13;
const IDLE_CLOSE_MS = 15 * 60 * 1000;

export class RaceRoom {
  constructor(state) {
    this.state = state;
    this.players = new Map();   // id -> { ws, name, char, ready, state, finished, time }
    this.nextId = 1;
    this.hostId = null;
    this.racing = false;
    this.startedAt = 0;
    this.timer = null;
    this.lastSeen = Date.now();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket", { status: 426 });
    }
    if (this.players.size >= MAX_PLAYERS) {
      return new Response("room full", { status: 503 });
    }

    const pair = new WebSocketPair();
    this.join(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  join(ws) {
    ws.accept();
    const id = this.nextId++;
    const p = { ws, id, name: "", char: null, ready: false, state: null,
                finished: false, time: 0, fat: 0 };
    this.players.set(id, p);
    if (this.hostId === null) this.hostId = id;

    ws.addEventListener("message", (ev) => {
      this.lastSeen = Date.now();
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this.handle(p, m);
    });

    const drop = () => this.leave(id);
    ws.addEventListener("close", drop);
    ws.addEventListener("error", drop);

    this.send(p, { t: "welcome", id, host: this.hostId === id, racing: this.racing });
    this.broadcastRoster();
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.hostId === id) {
      this.hostId = this.players.size ? [...this.players.keys()][0] : null;
      const nh = this.players.get(this.hostId);
      if (nh) this.send(nh, { t: "host" });
    }
    if (!this.players.size) { this.stopTicking(); this.racing = false; }
    this.broadcastRoster();
    if (this.racing) this.checkOver();
  }

  handle(p, m) {
    switch (m.t) {
      case "join":
        p.name = String(m.name || "").slice(0, 24);
        p.char = typeof m.char === "string" ? m.char.slice(0, 24) : null;
        this.broadcastRoster();
        break;

      case "pick":
        // first come, first served; a taken character is simply refused
        if (typeof m.char === "string" &&
            ![...this.players.values()].some(o => o !== p && o.char === m.char)) {
          p.char = m.char.slice(0, 24);
        }
        this.broadcastRoster();
        break;

      case "ready":
        p.ready = !!m.ready;
        this.broadcastRoster();
        break;

      case "start":
        if (p.id !== this.hostId) break;
        this.racing = true;
        this.startedAt = Date.now();
        for (const o of this.players.values()) { o.finished = false; o.time = 0; o.fat = 0; }
        this.broadcast({
          t: "start",
          seed: (Math.random() * 0x7fffffff) | 0,
          laps: Math.min(9, Math.max(1, m.laps | 0 || 2)),
          bots: !!m.bots,
          field: Math.min(MAX_PLAYERS, Math.max(1, m.field | 0 || 8)),
        });
        this.startTicking();
        break;

      case "s":   // this player's boat, as they see it
        p.state = [m.x, m.y, m.a, m.f, m.u, m.l, m.z];
        break;

      case "fin":
        if (!p.finished) {
          p.finished = true;
          p.time = Number(m.time) || 0;
          p.fat = m.fat | 0;
          this.broadcast({ t: "fin", id: p.id, time: p.time, fat: p.fat });
          this.checkOver();
        }
        break;

      case "again":
        if (p.id === this.hostId) {
          this.racing = false;
          this.stopTicking();
          for (const o of this.players.values()) {
            o.finished = false; o.time = 0; o.fat = 0; o.ready = false; o.state = null;
          }
          this.broadcast({ t: "lobby" });
          this.broadcastRoster();
        }
        break;
    }
  }

  checkOver() {
    const all = [...this.players.values()];
    if (all.length && all.every(o => o.finished)) {
      this.racing = false;
      this.stopTicking();
      this.broadcast({
        t: "over",
        results: all.slice().sort((a, b) => a.time - b.time)
                    .map(o => ({ id: o.id, name: o.name, char: o.char,
                                 time: o.time, fat: o.fat | 0 })),
      });
    }
  }

  startTicking() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (Date.now() - this.lastSeen > IDLE_CLOSE_MS) { this.stopTicking(); return; }
      const p = [];
      for (const o of this.players.values()) {
        if (o.state) p.push([o.id, ...o.state]);
      }
      if (p.length) this.broadcast({ t: "snap", p });
    }, TICK_MS);
  }

  stopTicking() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  roster() {
    return [...this.players.values()].map(o => ({
      id: o.id, name: o.name, char: o.char, ready: o.ready,
      host: o.id === this.hostId, finished: o.finished, time: o.time,
    }));
  }

  broadcastRoster() { this.broadcast({ t: "roster", players: this.roster() }); }

  send(p, msg) {
    try { p.ws.send(JSON.stringify(msg)); } catch { /* gone */ }
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const o of this.players.values()) {
      try { o.ws.send(s); } catch { /* gone */ }
    }
  }
}

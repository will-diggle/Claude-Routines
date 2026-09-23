/* Bilinguist Brief · Analytics dashboard — client-side filter/aggregate/render.
   Loads data.json (written by fetch_data.py on a 6h CI cron) and does all
   slicing (timeframe/language/level/count mode/compare) in the browser. */

const PALETTE = {
  fr: "var(--series-1)", de: "var(--series-2)", it: "var(--series-3)",
  es: "var(--series-4)", en: "var(--series-5)", sv: "var(--series-6)",
  tr: "var(--series-7)", hu: "var(--series-8)", ar: "var(--muted-series)",
};
const LANG_LABEL = { fr: "French", de: "German", it: "Italian", es: "Spanish", en: "English", sv: "Swedish", tr: "Turkish", hu: "Hungarian", ar: "Arabic" };
const LANG_FLAG = { fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", es: "🇪🇸", en: "🇬🇧", sv: "🇸🇪", tr: "🇹🇷", hu: "🇭🇺", ar: "🇸🇦" };
// Real circular flag artwork (MIT-licensed, github.com/HatScripts/circle-flags)
// embedded inline rather than loaded from a CDN — this file gets synced into
// Piggy Figs' WebView, which has no guarantee of network access to a
// third-party host. LANG_FLAG (the plain emoji, above) is kept only for the
// one spot that can't render HTML at all — see flagChip's comment below.
const LANG_FLAG_SVG = {
  fr: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#eee\" d=\"M167 0h178l25.9 252.3L345 512H167l-29.8-253.4z\"/><path fill=\"#0052b4\" d=\"M0 0h167v512H0z\"/><path fill=\"#d80027\" d=\"M345 0h167v512H345z\"/></g></svg>",
  de: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#ffda44\" d=\"m0 345 256.7-25.5L512 345v167H0z\"/><path fill=\"#d80027\" d=\"m0 167 255-23 257 23v178H0z\"/><path fill=\"#333\" d=\"M0 0h512v167H0z\"/></g></svg>",
  it: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#eee\" d=\"M167 0h178l25.9 252.3L345 512H167l-29.8-253.4z\"/><path fill=\"#6da544\" d=\"M0 0h167v512H0z\"/><path fill=\"#d80027\" d=\"M345 0h167v512H345z\"/></g></svg>",
  es: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#ffda44\" d=\"m0 128 256-32 256 32v256l-256 32L0 384Z\"/><path fill=\"#eee\" d=\"M196 168q-11 1-15 11l-5-1q-15 1-16 16c-1 15 7 16 16 16q11 0 15-11a16 16 0 0 0 17-4 16 16 0 0 0 17 4 16 16 0 1 0 10-20 16 16 0 0 0-27-5q-4-6-12-6m0 8q8 1 8 8 0 8-8 8-7 0-8-8 1-7 8-8m24 0q8 1 8 8 0 8-8 8-7 0-8-8 1-7 8-8m-44 10 4 1 4 8q-1 7-8 7-9 0-8-8 1-7 8-8m64 0q8 1 8 8 0 8-8 8-7 0-8-7l4-8zm-112 38v80h16v-80zm80 0v40c-26 0-48 14-48 32s22 32 48 32 48-14 48-32v-72zm64 0v80h16v-80z\"/><path fill=\"#ff9811\" d=\"M200 160h16v32h-16z\"/><path fill=\"#d80027\" d=\"M0 0v128h512V0zm208 184c-22 0-40 11-40 24l8 8h64l8-8c0-13-18-24-40-24m-72 8a8 8 0 0 0-8 8v8a8 8 0 1 0 16 0v-8a8 8 0 0 0-8-8m144 0a8 8 0 0 0-8 8v8a8 8 0 1 0 16 0v-8a8 8 0 0 0-8-8m-120 32v24h-38a4 4 0 0 0-4 4 4 4 0 0 0 4 4h38v40a24 24 0 0 0 24 24 24 24 0 0 0 24-24 24 24 0 0 0 24 24 24 24 0 0 0 24-24v-24h-48v-48zm72 8a10 10 0 0 0-10 10v12a10 10 0 1 0 20 0v-12a10 10 0 0 0-10-10m24 16v8h38a4 4 0 0 0 4-4 4 4 0 0 0-4-4zm-134 24a4 4 0 0 0-4 4 4 4 0 0 0 4 4h28a4 4 0 0 0 4-4 4 4 0 0 0-4-4zm144 0a4 4 0 0 0-4 4 4 4 0 0 0 4 4h28a4 4 0 0 0 4-4 4 4 0 0 0-4-4zM0 384v128h512V384z\"/><path fill=\"#ffda44\" d=\"M186 196a6 6 0 0 0-6 6 6 6 0 0 0 6 6 6 6 0 0 0 6-6 6 6 0 0 0-6-6m22 0a6 6 0 0 0-6 6 6 6 0 0 0 6 6 6 6 0 0 0 6-6 6 6 0 0 0-6-6m22 0a6 6 0 0 0-6 6 6 6 0 0 0 6 6 6 6 0 0 0 6-6 6 6 0 0 0-6-6\"/><path fill=\"#ff9811\" d=\"M128 208a8 8 0 1 0 0 16h16a8 8 0 1 0 0-16zm144 0a8 8 0 1 0 0 16h16a8 8 0 1 0 0-16zm-96 8v8h64v-8zm-8 16v8h8v16h-8v8h32v-8h-8v-16h8v-8zm-8 40v24q1 12 9 19v-43zm19 0v47h10v-47zm20 0v43q9-7 9-19v-24zm-71 32a8 8 0 1 0 0 16h16a8 8 0 1 0 0-16zm144 0a8 8 0 1 0 0 16h16a8 8 0 1 0 0-16z\"/><path fill=\"#338af3\" d=\"M208 256a16 16 0 0 0-16 16 16 16 0 0 0 16 16 16 16 0 0 0 16-16 16 16 0 0 0-16-16m-80 64a8 8 0 1 0 0 16h16a8 8 0 1 0 0-16zm144 0a8 8 0 1 0 0 16h16a8 8 0 1 0 0-16z\"/></g></svg>",
  en: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#eee\" d=\"m0 0 8 22-8 23v23l32 54-32 54v32l32 48-32 48v32l32 54-32 54v68l22-8 23 8h23l54-32 54 32h32l48-32 48 32h32l54-32 54 32h68l-8-22 8-23v-23l-32-54 32-54v-32l-32-48 32-48v-32l-32-54 32-54V0l-22 8-23-8h-23l-54 32-54-32h-32l-48 32-48-32h-32l-54 32L68 0H0z\"/><path fill=\"#0052b4\" d=\"M336 0v108L444 0Zm176 68L404 176h108zM0 176h108L0 68ZM68 0l108 108V0Zm108 512V404L68 512ZM0 444l108-108H0Zm512-108H404l108 108Zm-68 176L336 404v108z\"/><path fill=\"#d80027\" d=\"M0 0v45l131 131h45L0 0zm208 0v208H0v96h208v208h96V304h208v-96H304V0h-96zm259 0L336 131v45L512 0h-45zM176 336 0 512h45l131-131v-45zm160 0 176 176v-45L381 336h-45z\"/></g></svg>",
  sv: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#0052b4\" d=\"M0 0h133.6l35.3 16.7L200.3 0H512v222.6l-22.6 31.7 22.6 35.1V512H200.3l-32-19.8-34.7 19.8H0V289.4l22.1-33.3L0 222.6z\"/><path fill=\"#ffda44\" d=\"M133.6 0v222.6H0v66.8h133.6V512h66.7V289.4H512v-66.8H200.3V0z\"/></g></svg>",
  tr: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#d80027\" d=\"M0 0h512v512H0z\"/><path fill=\"#eee\" d=\"M208 115a141 141 0 1 0 106 242q-25 13-54 13a114 114 0 1 1 54-215 141 141 0 0 0-106-40m142 67v56l-54 18 54 17v57l33-46 54 18-33-46 33-46-54 18z\"/></g></svg>",
  hu: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#eee\" d=\"m0 167 253.8-19.3L512 167v178l-254.9 32.3L0 345z\"/><path fill=\"#d80027\" d=\"M0 0h512v167H0z\"/><path fill=\"#6da544\" d=\"M0 345h512v167H0z\"/></g></svg>",
  ar: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><mask id=\"a\"><circle cx=\"256\" cy=\"256\" r=\"256\" fill=\"#fff\"/></mask><g mask=\"url(#a)\"><path fill=\"#496e2d\" d=\"M0 0h512v512H0Z\"/><path fill=\"#eee\" d=\"M336 356v16H128l24 24h184v16h16v-16h32v-24h-32v-16zM131.4 174v41.4h-15.8v-26.7H97.8q-6.3 0-10.8 2.3a15 15 0 0 0-6.7 6.4 22 22 0 0 0-2.3 10.5q0 6 2.3 10.3 2.3 4 6.7 6 4.5 2.1 10.8 2.1H173V174h-13v41.4h-15.8V174zm52.9 0v52.3h12.8V174zm55.3 0v41.4h-11v-31h-12.8v31h-9.3v10.9h45.9V174zm24.3 0v52.3h12.8V174zm77.8 0v41.4H326v-26.7h-17.8q-6.3 0-10.8 2.3a15 15 0 0 0-6.7 6.4 22 22 0 0 0-2.3 10.5q0 6 2.3 10.3 2.3 4 6.7 6 4.5 2.1 10.8 2.1h46.5V174zm24.2 0v52.3h12.8V174zm55.3 0v41.4h-11v-31h-12.8v31h-9.3v10.9h46V174ZM97.8 199.6h5v15.8h-5q-2.4 0-4-.4-1.5-.5-2.2-2a13 13 0 0 1-.8-5.1q0-3.7.8-5.4 1-1.8 2.5-2.3 1.5-.6 3.7-.6m210.3 0h5v15.8h-5q-2.4 0-4-.4-1.5-.5-2.2-2a13 13 0 0 1-.8-5.1q0-3.7.8-5.4 1-1.8 2.5-2.3 1.6-.6 3.7-.6M114.8 247v28.5h-10.9V257H91.6q-4.4 0-7.4 1.6-3 1.4-4.6 4.4t-1.6 7.2q0 4.3 1.6 7 1.5 2.9 4.6 4.3t7.4 1.4h51.7v-36h-8.8v28.5h-10.9V247Zm36.3 0v36h8.8v-36Zm39.7 0v35.8q0 1.5-.6 2.7t-2 2q-1.5.6-4 .7t-4.2-.7-2.4-2q-.9-1.3-.9-3.1l.2-2.8 1.5-10.8-8.7-1.1-1.2 8.4-.6 6.4q0 3.7 2 6.7a14 14 0 0 0 5.9 4.8q3.6 1.7 8.3 1.7 4.5 0 8-1.6 3.6-1.6 5.5-4.6 2-2.8 2-6.7V247Zm159.5 10a36 36 0 0 0-10 1.4 40 40 0 0 0-1.3 7.4 57 57 0 0 0 0 9.6h-11v-2a20 20 0 0 0-1.9-9.2q-1.8-3.6-5.4-5.3a20 20 0 0 0-8.7-1.8h-4.2v7.5h4.2q2.7 0 4.3.8 1.5.7 2.2 2.6.6 1.8.7 5.4v2h-12.7v7.6H434v-12.8q0-5-1.6-7.8-1.5-3-4.7-4.1-3.2-1.4-8-1.3a36 36 0 0 0-10 1.4 40 40 0 0 0-1.4 7.4 57 57 0 0 0 0 9.6h-10.9v-4.8q0-4.2-2-7.2t-5.5-4.6a18 18 0 0 0-7.9-1.7q-2.1 0-4.2.4l-4.3.8.7 7a48 48 0 0 1 6.7-.6q4 0 6 1.5 1.7 1.5 1.7 4.4v4.9h-23.9v-5.3q0-5-1.6-7.8-1.6-3-4.8-4.1-3-1.4-8-1.3m-131.7.1q-4.3 0-7.4 1.6-3 1.4-4.6 4.4t-1.6 7.2q0 4.3 1.6 7 1.6 2.9 4.6 4.3t7.4 1.4h3.5v1.6q0 2.3-1.5 3.4-1.4 1.2-4.7 1.2l-3-.2q-1.8 0-4.3-.4l-1.2 7a59 59 0 0 0 8.5 1q4.5 0 7.8-1.4 3.4-1.5 5.3-4.2a11 11 0 0 0 1.9-6.4V283h22.9a15 15 0 0 0 7.9-2q1 .6 2.2 1 2.3 1 4.7 1h13.9v-14l-.3-3.3-1.3-8.6-8.7 1.3a118 118 0 0 1 1.4 10.5v6.6h-5l-1.9-.4-.9-.5q.7-2.7.7-6.2v-8.6h-8.8v8.6q0 3-.4 4.6-.3 1.5-1 2a5 5 0 0 1-2.5.5h-3v-13h-9v13H231V257zm73.8 0v26.6q0 2.7-1 4-1 1.5-2.8 1.5h-2.8l-.2 7.3 3.1.2q3.8 0 6.6-1.7t4.3-4.6 1.6-6.7V257zm58 7.4q2.1 0 3.3.5t1.7 1.7q.4 1.3.4 3.4v5.4h-8a71 71 0 0 1 0-8.6l.2-2.3zm69.3 0q2.2 0 3.4.5t1.6 1.7q.5 1.3.5 3.4v5.4h-8a71 71 0 0 1-.1-8.6l.2-2.3zm-328.1.1H95v10.9h-3.4q-1.7 0-2.7-.3-1-.4-1.6-1.4a9 9 0 0 1-.5-3.5q0-2.6.6-3.7A3 3 0 0 1 89 265a8 8 0 0 1 2.5-.4m127 0h3.5v10.9h-3.5q-1.6 0-2.7-.3-1-.4-1.6-1.4a9 9 0 0 1-.5-3.5q0-2.6.6-3.7a3 3 0 0 1 1.7-1.6 8 8 0 0 1 2.5-.4\"/></g></svg>",
};
const ALL_LANGS = Object.keys(LANG_LABEL);

// Real circular flag SVG, already properly clipped by its own internal
// mask — no CSS clipping trick needed (see .flag-circle's CSS: the SVG
// simply fills the container). Not usable inside a <select> <option> —
// those only ever render plain text, no HTML/SVG — so the language
// dropdown (langLevelPicker) keeps the old plain emoji+name text pairing.
function flagChip(langCode) {
  const svg = LANG_FLAG_SVG[langCode] || "";
  const name = LANG_LABEL[langCode] || langCode;
  return `<span class="flag-circle" title="${name}">${svg}</span>`;
}
const ALL_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "Native"];
const LEVEL_ORDINAL_PALETTE = {
  A1: "var(--lvl-a1)", A2: "var(--lvl-a2)", B1: "var(--lvl-b1)", B2: "var(--lvl-b2)",
  C1: "var(--lvl-c1)", C2: "var(--lvl-c2)", Native: "var(--lvl-native)",
};
const TOPIC_LABEL = {
  weather: "Weather", worldNews: "World News", business: "Business & Economy",
  uk: "UK", us: "US", europe: "Europe (EU)",
};
// Design-preference person properties (see analytics build spec, Sept 2026) —
// raw stored values to display labels.
const PROP_VALUE_LABEL = {
  font_family: { lora: "Lora", garamond: "EB Garamond", playfair: "Playfair Display", times: "Times New Roman" },
  manual_background: { white: "White", cream: "Cream", softGrey: "Soft Grey", night: "Night" },
  app_icon: { White: "White", Black: "Black", Cream: "Cream", Navy: "Navy", Pride1: "Pride 1", Pride2: "Pride 2" },
};

let DATA = null;

const state = {
  timeframe: { preset: "30d", start: null, end: null },
  languages: new Set(ALL_LANGS),
  levels: new Set(ALL_LEVELS),
  countMode: "events", // "events" | "users"
  compare: {}, // chartId -> bool
};

function presetRange(preset) {
  const end = new Date();
  const start = new Date();
  if (preset === "today") start.setHours(0, 0, 0, 0);
  else if (preset === "7d") start.setDate(end.getDate() - 7);
  else if (preset === "30d") start.setDate(end.getDate() - 30);
  else if (preset === "90d") start.setDate(end.getDate() - 90);
  else if (preset === "month") start.setDate(1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function activeRange() {
  if (state.timeframe.preset === "custom") return { start: state.timeframe.start, end: state.timeframe.end };
  return presetRange(state.timeframe.preset);
}

function inRange(day, range) {
  return day >= range.start && day <= range.end;
}

function rowsFor(eventName, { languages = state.languages, levels = state.levels } = {}) {
  const range = activeRange();
  const rows = (DATA.events[eventName] || []).filter((r) => inRange(r.day, range));
  return rows.filter((r) => {
    if ("language" in r && r.language != null && !languages.has(r.language)) return false;
    if ("level" in r && r.level != null && !levels.has(r.level)) return false;
    return true;
  });
}

function metric(row) {
  return state.countMode === "users" ? row.unique_users : row.event_count;
}

function sumMetric(rows) {
  return rows.reduce((acc, r) => acc + (metric(r) || 0), 0);
}

// ---------- generic small SVG helpers ----------
function svgLineChart(seriesMap, opts = {}) {
  const w = opts.width || 640, h = opts.height || 220, padB = 26, padT = 10;
  const labelFor = opts.labelFor || ((key) => (LANG_LABEL[key] ? flagChip(key) : key));
  const colorFor = opts.colorFor || ((key) => PALETTE[key] || "var(--series-1)");
  const allDays = [...new Set(Object.values(seriesMap).flatMap((s) => s.map((p) => p.day)))].sort();
  if (allDays.length === 0) return `<div class="empty-note">No data for this filter combination.</div>`;
  const seriesEntries = Object.entries(seriesMap);
  const maxVal = Math.max(1, ...seriesEntries.flatMap(([, pts]) => pts.map((p) => p.value)));
  const step = w / Math.max(allDays.length - 1, 1);

  let svg = `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}">`;
  svg += `<line x1="0" y1="${h - padB}" x2="${w}" y2="${h - padB}" stroke="var(--baseline)" stroke-width="1"/>`;
  for (const [key, pts] of seriesEntries) {
    const byDay = Object.fromEntries(pts.map((p) => [p.day, p.value]));
    const points = allDays
      .map((d, i) => {
        const v = byDay[d] || 0;
        const x = i * step;
        const y = (h - padB) - (v / maxVal) * (h - padB - padT);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    svg += `<polyline fill="none" stroke="${colorFor(key)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${points}"/>`;
  }
  svg += `<text x="0" y="${h - 4}" class="axis-label">${allDays[0]}</text>`;
  svg += `<text x="${w - 70}" y="${h - 4}" class="axis-label">${allDays[allDays.length - 1]}</text>`;
  svg += `</svg>`;

  if (seriesEntries.length > 1) {
    svg += `<div class="legend">` + seriesEntries.map(([key]) =>
      `<div class="legend-item"><span class="legend-swatch" style="background:${colorFor(key)}"></span>${labelFor(key)}</div>`
    ).join("") + `</div>`;
  }
  return svg;
}

function svgStackedBar(byDayThenKey, keys, opts = {}) {
  const w = opts.width || 640, h = opts.height || 220, padB = 26, padT = 10;
  const days = Object.keys(byDayThenKey).sort();
  if (days.length === 0) return `<div class="empty-note">No data for this filter combination.</div>`;
  const totals = days.map((d) => keys.reduce((a, k) => a + (byDayThenKey[d][k] || 0), 0));
  const maxVal = Math.max(1, ...totals);
  const bw = (w / days.length) * 0.6;
  const gap = (w / days.length) * 0.4;

  let svg = `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}">`;
  svg += `<line x1="0" y1="${h - padB}" x2="${w}" y2="${h - padB}" stroke="var(--baseline)" stroke-width="1"/>`;
  days.forEach((d, i) => {
    let yCursor = h - padB;
    const x = i * (bw + gap) + gap / 2;
    keys.forEach((k) => {
      const v = byDayThenKey[d][k] || 0;
      const bh = (v / maxVal) * (h - padB - padT);
      if (bh > 0) {
        svg += `<rect x="${x.toFixed(1)}" y="${(yCursor - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(bh - 2, 0).toFixed(1)}" fill="${PALETTE[k] || "var(--series-1)"}" rx="2"/>`;
      }
      yCursor -= bh;
    });
  });
  svg += `<text x="0" y="${h - 4}" class="axis-label">${days[0]}</text>`;
  svg += `<text x="${w - 70}" y="${h - 4}" class="axis-label">${days[days.length - 1]}</text>`;
  svg += `</svg>`;
  svg += `<div class="legend">` + keys.map((k) =>
    `<div class="legend-item"><span class="legend-swatch" style="background:${PALETTE[k] || "var(--series-1)"}"></span>${LANG_LABEL[k] ? flagChip(k) : k}</div>`
  ).join("") + `</div>`;
  return svg;
}

function horizontalBars(items, opts = {}) {
  // items: [{label, value}]. opts.colorFor(item, index), if given, colors
  // each bar individually — omitted, every bar stays the single default
  // color (unchanged behavior for existing callers).
  if (items.length === 0) return `<div class="empty-note">No data for this filter combination.</div>`;
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((i, idx) => {
    const color = opts.colorFor ? opts.colorFor(i, idx) : null;
    return `
    <div class="hbar-row">
      <div class="hbar-label">${i.label}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${(i.value / max * 100).toFixed(1)}%${color ? `;background:${color}` : ""}"></div></div>
      <div class="hbar-value">${i.value.toLocaleString()}</div>
    </div>`;
  }).join("");
}

// Cycles through the existing 8 language-series tokens for any ≤8-category
// axis that isn't itself a language (genre, font, theme, icon, …) — per the
// analytics build spec's own note, reusing --series-1..8 is fine here rather
// than declaring a parallel palette, since none of these axes exceed 8 values.
const CATEGORICAL_PALETTE = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
function categoricalColor(_item, idx) {
  return CATEGORICAL_PALETTE[idx % CATEGORICAL_PALETTE.length];
}

function funnelChart(steps) {
  // steps: [{label, value}] in order
  if (steps.length === 0 || steps[0].value === 0) return `<div class="empty-note">No data for this filter combination.</div>`;
  const base = steps[0].value;
  return steps.map((s, i) => {
    const pct = base ? (s.value / base) * 100 : 0;
    let drop = "";
    if (i > 0) {
      const prevValue = steps[i - 1].value;
      const changePct = prevValue ? ((s.value - prevValue) / prevValue) * 100 : 0;
      const sign = changePct >= 0 ? "+" : "-";
      const color = changePct >= 0 ? "var(--good)" : "var(--critical)";
      drop = `<div class="funnel-drop" style="color:${color}">${sign}${Math.abs(changePct).toFixed(1)}%</div>`;
    }
    return `
    <div class="funnel-step">
      <div class="funnel-label">${s.label}</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.max(pct, 4).toFixed(1)}%">${s.value.toLocaleString()}</div></div>
      <div class="funnel-pct">${pct.toFixed(1)}%</div>
      ${drop}
    </div>`;
  }).join("");
}

// ---------- chart builders (data-shaping per chart) ----------
function buildBriefsOverTime(languages, levels) {
  const rows = rowsFor("brief_completed", { languages, levels });
  const series = {};
  const langSet = languages.size === ALL_LANGS.length ? ALL_LANGS : [...languages];
  for (const lang of langSet) {
    const langRows = rows.filter((r) => r.language === lang);
    const byDay = {};
    for (const r of langRows) byDay[r.day] = (byDay[r.day] || 0) + metric(r);
    series[lang] = Object.entries(byDay).map(([day, value]) => ({ day, value }));
  }
  return svgLineChart(series);
}

function buildLevelBreakdown(languages, levels) {
  const rows = rowsFor("brief_completed", { languages, levels });
  const byDay = {};
  for (const r of rows) {
    byDay[r.day] = byDay[r.day] || {};
    byDay[r.day][r.level] = (byDay[r.day][r.level] || 0) + metric(r);
  }
  const seqKeys = ALL_LEVELS;
  Object.assign(PALETTE, LEVEL_ORDINAL_PALETTE);
  return svgStackedBar(byDay, seqKeys.filter((l) => levels.has(l)));
}

function buildWordsSavedByLanguage(languages, levels) {
  const rows = rowsFor("word_saved", { languages, levels });
  const byLang = {};
  for (const r of rows) byLang[r.language] = (byLang[r.language] || 0) + metric(r);
  const items = Object.entries(byLang)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, value]) => ({ label: flagChip(lang), value }));
  return horizontalBars(items);
}

function buildWordFunnel(languages, levels) {
  const stepsEvents = ["word_tapped", "word_saved", "tell_me_more_opened", "audio_played"];
  const labels = ["Word tapped", "Word saved", "Tell me more opened", "Audio played"];
  const steps = stepsEvents.map((ev, i) => {
    const rows = rowsFor(ev, { languages, levels: ev === "audio_played" ? state.levels : levels });
    return { label: labels[i], value: sumMetric(rows) };
  });
  return funnelChart(steps);
}

function buildGameActivity() {
  const opened = rowsFor("game_opened", { languages: state.languages, levels: state.levels });
  const completed = rowsFor("game_completed", { languages: state.languages, levels: state.levels });
  const byGame = {};
  for (const r of opened) {
    byGame[r.game_name] = byGame[r.game_name] || { opened: 0, completed: 0 };
    byGame[r.game_name].opened += metric(r);
  }
  for (const r of completed) {
    byGame[r.game_name] = byGame[r.game_name] || { opened: 0, completed: 0 };
    byGame[r.game_name].completed += metric(r);
  }
  const items = Object.entries(byGame)
    .sort((a, b) => b[1].opened - a[1].opened)
    .map(([name, v]) => ({
      label: `${name} <span class="hbar-sub">(${v.opened ? Math.round((v.completed / v.opened) * 100) : 0}% completion)</span>`,
      value: v.opened,
    }));
  return horizontalBars(items);
}

function buildStreakHealth() {
  const inc = rowsFor("streak_incremented", { languages: state.languages, levels: state.levels });
  const lost = rowsFor("streak_lost", { languages: state.languages, levels: state.levels });
  const freeze = rowsFor("streak_freeze_used", { languages: state.languages, levels: state.levels });
  const all = rowsFor("all_languages_read", { languages: state.languages, levels: state.levels });

  function byDaySum(rows) {
    const d = {};
    for (const r of rows) d[r.day] = (d[r.day] || 0) + metric(r);
    return Object.entries(d).map(([day, value]) => ({ day, value }));
  }
  const colorMap = { _inc: "var(--good)", _lost: "var(--critical)", _freeze: "var(--series-4)", _all: "var(--series-1)" };
  const labelMap = { _inc: "Streak incremented", _lost: "Streak lost", _freeze: "Freeze used", _all: "All languages read" };
  const series = {
    _inc: byDaySum(inc), _lost: byDaySum(lost), _freeze: byDaySum(freeze), _all: byDaySum(all),
  };
  return svgLineChart(series, { labelFor: (k) => labelMap[k], colorFor: (k) => colorMap[k] });
}

// topic_toggled has no language/level dims (genre selection is one global
// preference, not per-language — see Topics in useSettingsStore.ts), so
// this doesn't take languages/levels params, same as buildGameActivity above.
function buildGenreSelection() {
  const rows = rowsFor("topic_toggled", { languages: state.languages, levels: state.levels });
  const enabledRows = rows.filter((r) => r.enabled === true || r.enabled === "true" || r.enabled === 1);
  const byTopic = {};
  for (const r of enabledRows) byTopic[r.topic] = (byTopic[r.topic] || 0) + metric(r);
  const items = Object.entries(byTopic)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, value]) => ({ label: TOPIC_LABEL[topic] || topic, value }));
  return horizontalBars(items);
}

function buildGenreReading(languages, levels) {
  const rows = rowsFor("article_read", { languages, levels });
  const byGenre = {};
  for (const r of rows) byGenre[r.genre] = (byGenre[r.genre] || 0) + metric(r);
  const items = Object.entries(byGenre)
    .sort((a, b) => b[1] - a[1])
    .map(([genre, value]) => ({ label: genre || "(unknown)", value }));
  return horizontalBars(items);
}

// ---------- person-property distribution charts ----------
// These read DATA.person_properties directly rather than going through
// rowsFor — it's a snapshot of CURRENT state (see fetch_data.py's
// fetch_person_property_breakdown), not a day-by-day event series, so the
// timeframe/language/level filters that apply to every chart above don't
// apply to these four.
function personPropertyItems(prop) {
  const rows = (DATA.person_properties && DATA.person_properties[prop]) || [];
  const labelMap = PROP_VALUE_LABEL[prop] || {};
  return rows
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ label: labelMap[r.value] ?? String(r.value), value: r.count }));
}

function buildFontDistribution() {
  return horizontalBars(personPropertyItems("font_family"), { colorFor: categoricalColor });
}

function buildBackgroundDistribution() {
  return horizontalBars(personPropertyItems("manual_background"), { colorFor: categoricalColor });
}

function buildAppIconDistribution() {
  return horizontalBars(personPropertyItems("app_icon"), { colorFor: categoricalColor });
}

function buildAutoNightModeUsage() {
  const rows = (DATA.person_properties && DATA.person_properties.auto_night_mode) || [];
  const on = rows.find((r) => r.value === true || r.value === "true")?.count || 0;
  const off = rows.find((r) => r.value === false || r.value === "false")?.count || 0;
  return horizontalBars([{ label: "On", value: on }, { label: "Off", value: off }], { colorFor: categoricalColor });
}

function buildSubscriptionFunnel() {
  const range = activeRange();
  const steps = [
    ["anonymous_session_started", "Anonymous session"],
    ["user_signed_up", "Signed up"],
    ["paywall_shown", "Paywall shown"],
    ["subscription_started", "Subscription started"],
  ].map(([ev, label]) => {
    const rows = (DATA.events[ev] || []).filter((r) => inRange(r.day, range));
    return { label, value: sumMetric(rows) };
  });
  return funnelChart(steps);
}

// ---------- KPI tiles ----------
function renderKpis() {
  const briefs = rowsFor("brief_completed");
  const words = rowsFor("word_saved");
  const briefsCount = sumMetric(briefs);
  const wordsCount = sumMetric(words);
  const totalTime = briefs.reduce((a, r) => a + (r.sum_time_spent_seconds || 0), 0);
  const totalEvents = briefs.reduce((a, r) => a + (r.event_count || 0), 0);
  const avgTime = totalEvents ? Math.round(totalTime / totalEvents) : 0;
  const activeReadersCount = briefs.reduce((a, r) => a + (r.unique_users || 0), 0); // approx: sum of daily uniques (upper bound, not deduped across days)

  document.getElementById("kpi-briefs").textContent = briefsCount.toLocaleString();
  document.getElementById("kpi-words").textContent = wordsCount.toLocaleString();
  document.getElementById("kpi-readers").textContent = activeReadersCount.toLocaleString();
  document.getElementById("kpi-avgtime").textContent = `${Math.floor(avgTime / 60)}m ${avgTime % 60}s`;
}

// ---------- panel rendering with compare mode ----------
const CHART_DEFS = {
  briefsOverTime: { title: "Briefs read over time", sub: "brief_completed — one line per language", build: buildBriefsOverTime, needsLangLevel: true },
  levelBreakdown: { title: "Level breakdown per language", sub: "brief_completed, stacked by CEFR level", build: buildLevelBreakdown, needsLangLevel: true },
  wordsSaved: { title: "Words saved by language", sub: "word_saved, grouped by language", build: buildWordsSavedByLanguage, needsLangLevel: true },
  wordFunnel: { title: "Word engagement funnel", sub: "tapped → saved → tell me more → audio (unordered counts, see caveats)", build: buildWordFunnel, needsLangLevel: true },
  gameActivity: { title: "Game activity", sub: "game_opened vs game_completed by game", build: buildGameActivity, needsLangLevel: false },
  streakHealth: { title: "Streak health", sub: "increments vs losses vs freezes", build: buildStreakHealth, needsLangLevel: false },
  genreSelection: { title: "Genre selection", sub: "topic_toggled (enabled), grouped by genre", build: buildGenreSelection, needsLangLevel: false },
  genreReading: { title: "Genre reading", sub: "article_read — ≥90% of that article visible + ≥30s on the page, grouped by genre", build: buildGenreReading, needsLangLevel: true },
  fontDistribution: { title: "Font", sub: "Current font_family across all users — a snapshot, not filtered by timeframe", build: buildFontDistribution, needsLangLevel: false },
  backgroundDistribution: { title: "Background / theme", sub: "Current manual_background across all users — a snapshot, not filtered by timeframe", build: buildBackgroundDistribution, needsLangLevel: false },
  autoNightModeUsage: { title: "Auto Night Mode", sub: "On vs. off across all users — a snapshot, not filtered by timeframe", build: buildAutoNightModeUsage, needsLangLevel: false },
  appIconDistribution: { title: "App icon", sub: "Current app_icon across all users — a snapshot, not filtered by timeframe", build: buildAppIconDistribution, needsLangLevel: false },
};

function langLevelPicker(idPrefix, selectedLangs, selectedLevels) {
  return `
    <div class="mini-filters">
      <select id="${idPrefix}-lang" class="mini-select">
        <option value="ALL" ${selectedLangs.size === ALL_LANGS.length ? "selected" : ""}>All languages</option>
        ${ALL_LANGS.map((l) => `<option value="${l}" ${selectedLangs.size === 1 && selectedLangs.has(l) ? "selected" : ""}>${LANG_FLAG[l]} ${LANG_LABEL[l]}</option>`).join("")}
      </select>
      <select id="${idPrefix}-level" class="mini-select">
        <option value="ALL" ${selectedLevels.size === ALL_LEVELS.length ? "selected" : ""}>All levels</option>
        ${ALL_LEVELS.map((l) => `<option value="${l}" ${selectedLevels.size === 1 && selectedLevels.has(l) ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>`;
}

function panelState(chartId, side) {
  const key = `${chartId}_${side}`;
  if (!state.compare[key]) {
    state.compare[key] = { languages: new Set(state.languages), levels: new Set(state.levels) };
  }
  return state.compare[key];
}

function renderChartPanel(chartId, side) {
  const def = CHART_DEFS[chartId];
  const ps = def.needsLangLevel ? panelState(chartId, side) : { languages: state.languages, levels: state.levels };
  const html = def.build(ps.languages, ps.levels);
  const picker = def.needsLangLevel ? langLevelPicker(`${chartId}-${side}`, ps.languages, ps.levels) : "";
  return `<div class="compare-panel">${picker}${html}</div>`;
}

function renderChart(chartId) {
  const def = CHART_DEFS[chartId];
  const container = document.getElementById(`chart-${chartId}`);
  const isCompare = !!state.compare[`${chartId}_on`];
  if (isCompare) {
    container.innerHTML = `<div class="compare-grid">${renderChartPanel(chartId, "a")}${renderChartPanel(chartId, "b")}</div>`;
  } else {
    container.innerHTML = def.build(state.languages, state.levels);
  }
  wireMiniFilters(chartId);
}

function wireMiniFilters(chartId) {
  ["a", "b"].forEach((side) => {
    const langSel = document.getElementById(`${chartId}-${side}-lang`);
    const lvlSel = document.getElementById(`${chartId}-${side}-level`);
    if (langSel) langSel.addEventListener("change", (e) => {
      const ps = panelState(chartId, side);
      ps.languages = e.target.value === "ALL" ? new Set(ALL_LANGS) : new Set([e.target.value]);
      renderChart(chartId);
    });
    if (lvlSel) lvlSel.addEventListener("change", (e) => {
      const ps = panelState(chartId, side);
      ps.levels = e.target.value === "ALL" ? new Set(ALL_LEVELS) : new Set([e.target.value]);
      renderChart(chartId);
    });
  });
}

function renderAll() {
  if (!DATA) return; // nothing injected yet (embedded shell still fetching)
  renderKpis();
  Object.keys(CHART_DEFS).forEach(renderChart);
  document.getElementById("chart-wordFunnel-static") && (document.getElementById("chart-wordFunnel-static").innerHTML = buildWordFunnel(state.languages, state.levels));
  document.getElementById("chart-subscriptionFunnel").innerHTML = buildSubscriptionFunnel();
  document.getElementById("last-synced").textContent = DATA.generated_at
    ? new Date(DATA.generated_at).toUTCString().replace(" GMT", " UTC")
    : "unknown";
}

// ---------- global filter bar wiring ----------
function wireGlobalFilters() {
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.timeframe = { preset: btn.dataset.preset, start: null, end: null };
      document.getElementById("custom-range").style.display = btn.dataset.preset === "custom" ? "flex" : "none";
      renderAll();
    });
  });
  document.getElementById("custom-start").addEventListener("change", (e) => { state.timeframe.start = e.target.value; renderAll(); });
  document.getElementById("custom-end").addEventListener("change", (e) => { state.timeframe.end = e.target.value; renderAll(); });

  const langBox = document.getElementById("lang-checkboxes");
  ALL_LANGS.forEach((l) => {
    const el = document.createElement("label");
    el.className = "check-pill";
    el.innerHTML = `<input type="checkbox" value="${l}" checked> ${flagChip(l)}`;
    el.querySelector("input").addEventListener("change", (e) => {
      e.target.checked ? state.languages.add(l) : state.languages.delete(l);
      renderAll();
    });
    langBox.appendChild(el);
  });

  const levelBox = document.getElementById("level-checkboxes");
  ALL_LEVELS.forEach((l) => {
    const el = document.createElement("label");
    el.className = "check-pill";
    el.innerHTML = `<input type="checkbox" value="${l}" checked> ${l}`;
    el.querySelector("input").addEventListener("change", (e) => {
      e.target.checked ? state.levels.add(l) : state.levels.delete(l);
      renderAll();
    });
    levelBox.appendChild(el);
  });

  document.getElementById("count-mode").addEventListener("change", (e) => {
    state.countMode = e.target.checked ? "users" : "events";
    document.getElementById("count-mode-label").textContent = state.countMode === "users" ? "Unique users" : "Total events";
    renderAll();
  });

  document.querySelectorAll("[data-compare-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chartId = btn.dataset.compareToggle;
      state.compare[`${chartId}_on`] = !state.compare[`${chartId}_on`];
      btn.classList.toggle("active", state.compare[`${chartId}_on`]);
      renderChart(chartId);
    });
  });

  const refreshBtn = document.getElementById("refresh-btn");
  if (window.__EMBEDDED__) {
    // An embedding shell (e.g. piggy-figs' WebView) has its own native
    // refresh control and calls window.__setData__ directly — the in-page
    // button would just be a confusing second control pointing at a
    // /api/refresh-posthog endpoint that doesn't exist in that context.
    refreshBtn.style.display = "none";
  } else {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      const originalText = refreshBtn.textContent;
      refreshBtn.textContent = "Refreshing…";
      try {
        const endpoint = window.__REFRESH_ENDPOINT__ || "/api/refresh-posthog";
        const res = await fetch(endpoint, { method: "POST" });
        if (!res.ok) throw new Error(`refresh endpoint returned ${res.status}`);
        refreshBtn.textContent = "Refresh queued ✓";
      } catch (err) {
        console.error(err);
        refreshBtn.textContent = "Refresh unavailable";
      } finally {
        setTimeout(() => { refreshBtn.textContent = originalText; refreshBtn.disabled = false; }, 4000);
      }
    });
  }
}

// Exposed so an embedding shell can push freshly-fetched data in without a
// full page reload (piggy-figs fetches PostHog data natively on-device and
// injects it here, since a WebView loaded from an HTML string has no origin
// to fetch("data.json") against).
window.__setData__ = function (newData) {
  DATA = newData;
  renderAll();
};

async function init() {
  wireGlobalFilters();
  if (window.__EMBEDDED__) {
    // An embedding shell always owns fetching (there's no same-origin
    // data.json to fetch("data.json") against inside a WebView) — render
    // with whatever was injected, even if that's null/empty, and rely on
    // window.__setData__ for the real data once the shell's fetch resolves.
    DATA = window.__INITIAL_DATA__ || null;
    renderAll();
    return;
  }
  if (window.__INITIAL_DATA__) {
    DATA = window.__INITIAL_DATA__;
    renderAll();
    return;
  }
  const dataUrl = window.__DATA_URL__ || "data.json";
  const res = await fetch(dataUrl);
  DATA = await res.json();
  renderAll();
}

init();

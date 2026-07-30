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
const ALL_LANGS = Object.keys(LANG_LABEL);
const ALL_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "Native"];
const LEVEL_ORDINAL_PALETTE = {
  A1: "var(--lvl-a1)", A2: "var(--lvl-a2)", B1: "var(--lvl-b1)", B2: "var(--lvl-b2)",
  C1: "var(--lvl-c1)", C2: "var(--lvl-c2)", Native: "var(--lvl-native)",
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
  const labelFor = opts.labelFor || ((key) => (LANG_LABEL[key] ? `${LANG_FLAG[key]} ${LANG_LABEL[key]}` : key));
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
    `<div class="legend-item"><span class="legend-swatch" style="background:${PALETTE[k] || "var(--series-1)"}"></span>${LANG_LABEL[k] ? LANG_FLAG[k] + " " + LANG_LABEL[k] : k}</div>`
  ).join("") + `</div>`;
  return svg;
}

function horizontalBars(items, opts = {}) {
  // items: [{label, value}]
  if (items.length === 0) return `<div class="empty-note">No data for this filter combination.</div>`;
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => `
    <div class="hbar-row">
      <div class="hbar-label">${i.label}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${(i.value / max * 100).toFixed(1)}%"></div></div>
      <div class="hbar-value">${i.value.toLocaleString()}</div>
    </div>`).join("");
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
    .map(([lang, value]) => ({ label: `${LANG_FLAG[lang] || ""} ${LANG_LABEL[lang] || lang}`, value }));
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
    el.innerHTML = `<input type="checkbox" value="${l}" checked> ${LANG_FLAG[l]} ${LANG_LABEL[l]}`;
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
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    const originalText = refreshBtn.textContent;
    refreshBtn.textContent = "Refreshing…";
    try {
      const res = await fetch("/api/refresh-posthog", { method: "POST" });
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

async function init() {
  const res = await fetch("data.json");
  DATA = await res.json();
  wireGlobalFilters();
  renderAll();
}

init();

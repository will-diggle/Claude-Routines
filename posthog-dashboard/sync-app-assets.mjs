#!/usr/bin/env node
// Regenerates bilinguist-brief's embedded copy of the dashboard HTML/JS.
// Run this after editing dist/index.html or dist/dashboard.js so the iOS
// app's WebView stays in sync with the web version. See HANDOVER.md.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, "dist", "index.html"), "utf8");
const js = readFileSync(join(HERE, "dist", "dashboard.js"), "utf8");

// Strip the <script src="dashboard.js"></script> tag — the app inlines the
// JS directly instead, since a WebView loaded from an HTML string has no
// same-origin file to resolve a relative <script src> against.
const htmlWithoutScriptTag = html.replace(
  /<script src="dashboard\.js"><\/script>/,
  "<!-- dashboard.js is inlined by AnalyticsScreen.tsx at render time -->"
);

const out = `// GENERATED FILE — do not edit by hand.
// Source of truth: posthog-dashboard/dist/index.html and dashboard.js.
// Regenerate with: node posthog-dashboard/sync-app-assets.mjs

export const DASHBOARD_HTML = ${JSON.stringify(htmlWithoutScriptTag)};

export const DASHBOARD_JS = ${JSON.stringify(js)};
`;

const outPath = join(
  HERE,
  "..",
  "bilinguist-brief",
  "src",
  "screens",
  "analyticsDashboard",
  "generatedAssets.ts"
);
writeFileSync(outPath, out);
console.log(`Wrote ${outPath}`);

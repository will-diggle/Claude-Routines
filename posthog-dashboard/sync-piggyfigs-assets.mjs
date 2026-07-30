#!/usr/bin/env node
// Regenerates piggy-figs' embedded copy of the Bilinguist-specific dashboard
// HTML/JS. Run after editing dist/index.html or dist/dashboard.js.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, "dist", "index.html"), "utf8");
const js = readFileSync(join(HERE, "dist", "dashboard.js"), "utf8");

const htmlWithoutScriptTag = html.replace(
  /<script src="dashboard\.js"><\/script>/,
  "<!-- dashboard.js is inlined by DashboardScreen.tsx at render time -->"
);

const out = `// GENERATED FILE — do not edit by hand.
// Source of truth: posthog-dashboard/dist/index.html and dashboard.js.
// Regenerate with: node posthog-dashboard/sync-piggyfigs-assets.mjs

export const BILINGUIST_DASHBOARD_HTML = ${JSON.stringify(htmlWithoutScriptTag)};

export const BILINGUIST_DASHBOARD_JS = ${JSON.stringify(js)};
`;

const outPath = join(HERE, "..", "piggy-figs", "src", "dashboard", "bilinguistAssets.ts");
writeFileSync(outPath, out);
console.log(`Wrote ${outPath}`);

/**
 * fetch-popularity.mjs
 *
 * Stores how often Google Fonts served each font on the map to websites.
 * Source: the public data behind fonts.google.com/analytics.
 *
 * Usage:
 *   node scripts/fetch-popularity.mjs [options]      (or: npm run popularity -- [options])
 *
 * Options:
 *   --range <r>    7day | 30day | 90day | year          (default: 30day)
 *   --data  <path> Map data                            (default: public/data/typography_data.json)
 *   --out   <path> Output file                         (default: public/data/popularity.json)
 *
 * A map entry stands for its merged families too (aliases share its Latin
 * glyphs), so their views are added to it.
 */

import { readFileSync, writeFileSync } from 'fs';

const STATS_URL = 'https://fonts.google.com/metadata/stats';
const RANGES = ['7day', '30day', '90day', 'year'];

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const range = opt('range', '30day');
const dataPath = opt('data', 'public/data/typography_data.json');
const outPath = opt('out', 'public/data/popularity.json');

if (!RANGES.includes(range)) {
  console.error(`Unknown range "${range}", expected one of ${RANGES.join(', ')}`);
  process.exit(1);
}

const res = await fetch(STATS_URL);
if (!res.ok) {
  console.error(`${STATS_URL} answered ${res.status}`);
  process.exit(1);
}
const body = await res.text();
// The endpoint is prefixed with an anti-JSON-hijacking guard: )]}'
const stats = JSON.parse(body.slice(body.indexOf('[')));
const byFamily = new Map(stats.map((s) => [s.family.toLowerCase(), s.viewsByDateRange?.[range]?.views ?? 0]));

const { fonts } = JSON.parse(readFileSync(dataPath, 'utf8'));
const views = {};
const missing = [];
for (const font of fonts) {
  const families = [font.name, ...(font.aliases || [])];
  const found = families.filter((f) => byFamily.has(f.toLowerCase()));
  if (!found.length) {
    missing.push(font.name);
    continue;
  }
  views[font.id] = found.reduce((sum, f) => sum + byFamily.get(f.toLowerCase()), 0);
}

const out = {
  source: STATS_URL,
  range,
  fetched: new Date().toISOString().slice(0, 10),
  views,
};
writeFileSync(outPath, JSON.stringify(out));

const total = Object.values(views).reduce((a, b) => a + b, 0);
console.log(`${Object.keys(views).length}/${fonts.length} fonts, ${range} views: ${total.toLocaleString('en-US')} -> ${outPath}`);
if (missing.length) console.log(`No stats for: ${missing.join(', ')}`);

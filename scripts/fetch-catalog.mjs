/**
 * fetch-catalog.mjs
 *
 * Stores when each font on the map joined Google Fonts and who designed it.
 * Source: fonts.google.com/metadata/fonts, the catalogue behind fonts.google.com.
 *
 * Usage:
 *   node scripts/fetch-catalog.mjs [options]      (or: npm run catalog -- [options])
 *
 * Options:
 *   --data <path>  Map data     (default: public/data/typography_data.json)
 *   --out  <path>  Output file  (default: public/data/catalog.json)
 *
 * A map entry takes its own family's metadata, or its first merged family's
 * when Google no longer lists it under that name.
 */

import { readFileSync, writeFileSync } from 'fs';

const METADATA_URL = 'https://fonts.google.com/metadata/fonts';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dataPath = opt('data', 'public/data/typography_data.json');
const outPath = opt('out', 'public/data/catalog.json');

const res = await fetch(METADATA_URL);
if (!res.ok) {
  console.error(`${METADATA_URL} answered ${res.status}`);
  process.exit(1);
}
const body = await res.text();
// The endpoint is prefixed with an anti-JSON-hijacking guard: )]}'
const { familyMetadataList } = JSON.parse(body.slice(body.indexOf('{')));
const byFamily = new Map(familyMetadataList.map((f) => [f.family.toLowerCase(), f]));

const { fonts } = JSON.parse(readFileSync(dataPath, 'utf8'));
const entries = {};
const missing = [];
for (const font of fonts) {
  const m = [font.name, ...(font.aliases || [])].map((f) => byFamily.get(f.toLowerCase())).find(Boolean);
  if (!m) {
    missing.push(font.name);
    continue;
  }
  entries[font.id] = { added: m.dateAdded, designers: m.designers };
}

writeFileSync(outPath, JSON.stringify({ source: METADATA_URL, fetched: new Date().toISOString().slice(0, 10), fonts: entries }));
console.log(`${Object.keys(entries).length}/${fonts.length} fonts -> ${outPath}`);
if (missing.length) console.log(`Not in the catalogue: ${missing.join(', ')}`);

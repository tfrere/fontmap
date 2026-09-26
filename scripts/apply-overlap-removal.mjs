/**
 * apply-overlap-removal.mjs
 *
 * Post-processes a font-map JSON file (font-map.json or typography_data.json)
 * to remove glyph overlaps using a D3 force simulation, then writes the result
 * back to the same file (or to --output).
 *
 * Usage:
 *   node scripts/apply-overlap-removal.mjs [options]
 *
 * Options:
 *   --input    <path>   Source JSON  (default: public/data/font-map.json)
 *   --output   <path>   Output JSON  (default: same as --input, overwrites in place)
 *   --radius   <px>     Collision radius in canonical pixels  (default: 10)
 *   --ticks    <n>      Simulation steps                      (default: 140)
 *   --origin   <0-1>    Pull-back strength toward UMAP origin (default: 0.03)
 *   --width    <px>     Canonical canvas width                (default: 1920)
 *   --height   <px>     Canonical canvas height               (default: 1080)
 *   --padding  <px>     Padding inside canonical canvas       (default: 40)
 *   --dry-run           Print stats but don't write the file
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const get = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : fallback;
};
const has = (flag) => args.includes(flag);

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const inputPath  = resolve(ROOT, get('--input',  'public/data/font-map.json'));
const outputPath = resolve(ROOT, get('--output', inputPath));
const RADIUS          = parseFloat(get('--radius',  '10'));
const TICKS           = parseInt(get('--ticks',   '140'), 10);
const ORIGIN_STRENGTH = parseFloat(get('--origin',  '0.03'));
const W               = parseFloat(get('--width',  '1920'));
const H               = parseFloat(get('--height', '1080'));
const PADDING         = parseFloat(get('--padding', '40'));
const DRY_RUN         = has('--dry-run');

// ---------------------------------------------------------------------------
// Load D3 force (ESM)
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
// d3-force is a CommonJS module in this version
const { forceSimulation, forceCollide, forceX, forceY } = await import('d3-force');

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------
console.log(`📂  Input:  ${inputPath}`);
let raw;
try {
  raw = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (e) {
  // Fallback to typography_data.json
  const fallback = resolve(ROOT, 'public/data/typography_data.json');
  console.warn(`⚠️  font-map.json not found, trying ${fallback}`);
  raw = JSON.parse(readFileSync(fallback, 'utf8'));
}

const fonts = raw.fonts;
console.log(`✅  Loaded ${fonts.length} fonts`);

// ---------------------------------------------------------------------------
// Map UMAP coords → canonical screen space
// ---------------------------------------------------------------------------
const xs = fonts.map(f => f.x);
const ys = fonts.map(f => f.y);
const xMin = Math.min(...xs), xMax = Math.max(...xs);
const yMin = Math.min(...ys), yMax = Math.max(...ys);

const toScreenX = x => ((x - xMin) / (xMax - xMin)) * (W - 2 * PADDING) + PADDING;
const toScreenY = y => ((yMax - y) / (yMax - yMin)) * (H - 2 * PADDING) + PADDING;

const nodes = fonts.map(f => ({
  id: f.id,
  x:  toScreenX(f.x),
  y:  toScreenY(f.y),
  ox: toScreenX(f.x),  // original position for pull-back
  oy: toScreenY(f.y),
}));

// ---------------------------------------------------------------------------
// Force simulation
// ---------------------------------------------------------------------------
console.log(`⚙️   Running simulation - radius: ${RADIUS}px  ticks: ${TICKS}  origin-strength: ${ORIGIN_STRENGTH}`);

const sim = forceSimulation(nodes)
  .force('collide', forceCollide(RADIUS).strength(1).iterations(3))
  .force('x', forceX(n => n.ox).strength(ORIGIN_STRENGTH))
  .force('y', forceY(n => n.oy).strength(ORIGIN_STRENGTH))
  .stop();

for (let i = 0; i < TICKS; i++) sim.tick();

// ---------------------------------------------------------------------------
// Measure displacement
// ---------------------------------------------------------------------------
const displacements = nodes.map(n => Math.hypot(n.x - n.ox, n.y - n.oy));
const maxD  = Math.max(...displacements).toFixed(1);
const avgD  = (displacements.reduce((a, b) => a + b, 0) / displacements.length).toFixed(1);
console.log(`📏  Displacement - avg: ${avgD}px  max: ${maxD}px  (canonical ${W}×${H})`);

// ---------------------------------------------------------------------------
// Write positions back into font objects
// The renderer normalises by min/max, so storing canonical pixel coords is fine -
// relative positions are preserved after re-scaling to actual viewport.
// ---------------------------------------------------------------------------
const nodeMap = new Map(nodes.map(n => [n.id, n]));
raw.fonts = fonts.map(f => {
  const n = nodeMap.get(f.id);
  return n ? { ...f, x: n.x, y: n.y } : f;
});

if (DRY_RUN) {
  console.log('🔍  Dry run - file not written.');
} else {
  writeFileSync(outputPath, JSON.stringify(raw, null, 2));
  console.log(`💾  Written to ${outputPath}`);
}

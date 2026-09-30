// Size by use: each font sized by its Google Fonts views on a bounded log scale, then a
// collision pass (a Dorling-style cartogram) pushes neighbours aside so big glyphs never
// cover small ones. The layout is computed once per page load and shared by the
// experiment and its preview on the index.

import { forceSimulation, forceCollide, forceX, forceY } from 'd3';

// Glyph box sizes on the reference canvas at full scale: the least used font gets
// S_MIN, Roboto S_MAX. GAMMA > 1 keeps the long tail small so the leaders stand out.
const S_MIN = 13;
const S_MAX = 120;
const GAMMA = 3;
// Collision radius as a share of the glyph box: the A covers about 60% of it.
const INK_RADIUS = 0.31;
const GAP = 0.6;

let cached = null;

// Annotates fonts (from loadMap({ popularity: true })) with views, rank, share, s1 and
// their cartogram position x1, y1. Returns the draw order (most viewed first) and meta.
export function sizeByUse(fonts, usage) {
  const known = fonts.filter((f) => f.hasViews).map((f) => f.views);
  const floor = Math.min(...known);
  fonts.forEach((f) => { if (!f.hasViews) f.views = floor; });

  const total = known.reduce((a, b) => a + b, 0);
  const order = fonts.map((_, i) => i).sort((a, b) => fonts[b].views - fonts[a].views);
  order.forEach((i, rank) => { fonts[i].rank = rank + 1; fonts[i].share = fonts[i].hasViews ? fonts[i].views / total : 0; });
  const meta = { total, fetched: usage.fetched, lmin: Math.log(floor), lmax: Math.log(Math.max(...known)), ranked: known.length };
  const sizeForViews = (v) => {
    const l = Math.max(0, Math.min(1, (Math.log(v) - meta.lmin) / (meta.lmax - meta.lmin)));
    return S_MIN + (S_MAX - S_MIN) * l ** GAMMA;
  };
  fonts.forEach((f) => { f.s1 = sizeForViews(f.views); });

  if (!cached || cached.size !== fonts.length) cached = relax(fonts);
  fonts.forEach((f) => {
    const p = cached.get(f.id);
    f.x1 = p ? p[0] : f.x0;
    f.y1 = p ? p[1] : f.y0;
  });
  return { order, meta, sizeForViews };
}

// Every glyph is pulled back to its map position while collisions push overlapping ones
// apart, so the layout keeps its neighbourhoods.
function relax(fonts) {
  const nodes = fonts.map((f) => ({ x: f.x0, y: f.y0, r: f.s1 * INK_RADIUS + GAP }));
  const sim = forceSimulation(nodes)
    .force('x', forceX((_, i) => fonts[i].x0).strength(0.06))
    .force('y', forceY((_, i) => fonts[i].y0).strength(0.06))
    .force('collide', forceCollide((d) => d.r).strength(1).iterations(4))
    .stop();
  for (let n = 0; n < 320; n++) sim.tick();
  // A few collision-only passes remove what the pull-back leaves.
  sim.force('x', null).force('y', null);
  for (let n = 0; n < 40; n++) sim.tick();
  return new Map(nodes.map((d, i) => [fonts[i].id, [d.x, d.y]]));
}

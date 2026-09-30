// Size by use: the FontMap layout with each glyph sized by its Google Fonts views.
// Sizes follow a bounded log scale, and a collision pass (a Dorling-style cartogram)
// pushes neighbours aside so big glyphs never cover small ones.

import { forceSimulation, forceCollide, forceX, forceY } from 'https://cdn.jsdelivr.net/npm/d3-force@3/+esm';
import { loadMap, BASE, compact, pct, lerp, ease, escapeHtml } from '../shared/map.js';
import { createView, exportPng, hideLoader } from '../shared/view.js';

// Glyph box sizes on the reference canvas at full scale: the least used font gets
// S_MIN, Roboto S_MAX. GAMMA > 1 keeps the long tail small so the leaders stand out.
const S_MIN = 13;
const S_MAX = 120;
const GAMMA = 3;
// Collision radius as a share of the glyph box: the A covers about 60% of it.
const INK_RADIUS = 0.31;
const GAP = 0.6;
const INTRO_MS = 2400;
const LEGEND_VIEWS = [1e6, 1e8, 1e10];

const $ = (id) => document.getElementById(id);

let fonts = [];
let order = [];
let meta = null;
let scaleT = 0;
let bounds = [null, null];
let anim = null;
let view = null;

const sizeForViews = (v) => {
  const l = Math.max(0, Math.min(1, (Math.log(v) - meta.lmin) / (meta.lmax - meta.lmin)));
  return S_MIN + (S_MAX - S_MIN) * l ** GAMMA;
};

// Dorling-style relaxation: every glyph is pulled back to its map position while
// collisions push overlapping ones apart, so the layout keeps its neighbourhoods.
function relax() {
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
  nodes.forEach((d, i) => { fonts[i].x1 = d.x; fonts[i].y1 = d.y; });
}

const stateAt = (f, t) => ({ x: lerp(f.x0, f.x1, t), y: lerp(f.y0, f.y1, t), s: lerp(BASE, f.s1, t) });

function boundsAt(t) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fonts) {
    const { x, y, s } = stateAt(f, t);
    x0 = Math.min(x0, x - s / 2); y0 = Math.min(y0, y - s / 2);
    x1 = Math.max(x1, x + s / 2); y1 = Math.max(y1, y + s / 2);
  }
  return [x0, y0, x1, y1];
}

function renderStats() {
  const top = order.map((i) => fonts[i]).filter((f) => f.hasViews);
  const shareOf = (list) => list.reduce((a, f) => a + f.share, 0);
  let n = 0;
  for (let acc = 0; acc < 0.5; n++) acc += top[n].share;
  const half = Math.floor(top.length / 2);
  const sans = top.filter((f) => f.family === 'sans-serif');
  const rows = [
    [`${top[0].name} alone`, pct(top[0].share)],
    [`Half of all views`, `${n} fonts`],
    [`Top 10`, pct(shareOf(top.slice(0, 10)))],
    [`Least used half (${half.toLocaleString('en-US')} fonts)`, pct(shareOf(top.slice(-half)))],
    [`Sans-serifs: ${pct(sans.length / top.length)} of fonts`, `${pct(shareOf(sans))} of views`],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('source').innerHTML = `${compact.format(meta.total)} views in the last 30 days, from
    <a href="https://fonts.google.com/analytics" target="_blank" rel="noopener">Google Fonts Analytics</a>
    (fetched ${meta.fetched}). Views count each time a font is served to a website; desktop downloads aren't included.`;
}

function renderLegend() {
  const saved = scaleT;
  scaleT = 1;
  const { s } = view.baseFit(window.innerWidth, window.innerHeight);
  scaleT = saved;
  // The sprite draws the A at 60px in an 80px box.
  $('legend-items').innerHTML = LEGEND_VIEWS.map((v) => {
    const px = sizeForViews(v) * s * 0.75;
    return `<span class="legend-item"><span class="legend-glyph" style="font-size:${px.toFixed(1)}px">A</span>${compact.format(v)}</span>`;
  }).join('');
}

function setScale(t) {
  scaleT = t;
  $('legend').classList.toggle('is-visible', t > 0.5);
  view.requestDraw();
}

function play(from = 0, to = 1, ms = INTRO_MS) {
  cancelAnimationFrame(anim);
  const t0 = performance.now();
  const step = (now) => {
    const x = Math.min(1, (now - t0) / ms);
    setScale(from + (to - from) * ease(x));
    if (x < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

async function init() {
  const data = await loadMap({ popularity: true });
  fonts = data.fonts;
  const known = fonts.filter((f) => f.hasViews).map((f) => f.views);
  const floor = Math.min(...known);
  fonts.forEach((f) => { if (!f.hasViews) f.views = floor; });

  const total = known.reduce((a, b) => a + b, 0);
  order = fonts.map((_, i) => i).sort((a, b) => fonts[b].views - fonts[a].views);
  order.forEach((i, rank) => { fonts[i].rank = rank + 1; fonts[i].share = fonts[i].hasViews ? fonts[i].views / total : 0; });
  meta = { total, fetched: data.usage.fetched, lmin: Math.log(floor), lmax: Math.log(Math.max(...known)), ranked: known.length };

  fonts.forEach((f) => { f.s1 = sizeForViews(f.views); });
  relax();
  bounds = [boundsAt(0), boundsAt(1)];

  view = createView({
    canvas: $('map'),
    tooltip: $('tooltip'),
    fonts,
    order: () => order,
    glyph: (i) => stateAt(fonts[i], scaleT),
    bounds: () => bounds[0].map((v, k) => lerp(v, bounds[1][k], scaleT)),
    label: (i) => fonts[i].name,
    describe: (i) => {
      const f = fonts[i];
      const detail = f.hasViews
        ? `<span>${compact.format(f.views)} views · 30 days</span><br><span>${pct(f.share)} of all views · #${f.rank.toLocaleString('en-US')} of ${meta.ranked.toLocaleString('en-US')}</span>`
        : '<span>No usage data</span>';
      return `<strong>${escapeHtml(f.name)}</strong>${detail}`;
    },
  });

  $('replay').addEventListener('click', () => play());
  $('names').addEventListener('change', (e) => view.setNames(e.target.checked));
  window.addEventListener('resize', renderLegend);
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button')) return;
    if (e.key === ' ') { e.preventDefault(); play(); }
  });

  $('download').addEventListener('click', () => exportPng(view, {
    title: 'Google Fonts, sized by use',
    subtitle: `${fonts.length.toLocaleString('en-US')} fonts placed by how they look, sized by how often Google Fonts served them to websites in the last 30 days (log scale).`,
    source: `Data: Google Fonts Analytics, fetched ${meta.fetched} · Layout: FontCLIP + t-SNE · huggingface.co/spaces/tfrere/font-map`,
    filename: `fontmap-size-by-use-${meta.fetched}.png`,
    footer: scaleT > 0.5 ? (c, T, pal, { H }) => {
      let x = 120;
      const base = H - 90;
      c.fillStyle = pal.ink2;
      c.font = "600 30px 'Source Sans Pro', sans-serif";
      c.fillText('Views, 30 days', x, base - 150);
      for (const v of LEGEND_VIEWS) {
        const px = sizeForViews(v) * T.a * 0.75;
        c.fillStyle = pal.ink;
        c.font = `400 ${px}px 'Source Sans Pro', sans-serif`;
        c.fillText('A', x, base - 40);
        const w = c.measureText('A').width;
        c.fillStyle = pal.ink2;
        c.font = "400 30px 'Source Sans Pro', sans-serif";
        c.fillText(compact.format(v), x, base);
        x += Math.max(w, c.measureText(compact.format(v)).width) + 60;
      }
    } : null,
  }));

  await document.fonts.ready;
  renderStats();
  renderLegend();
  setScale(0);
  hideLoader();
  setTimeout(() => play(), 500);
}

init().catch(hideLoader);

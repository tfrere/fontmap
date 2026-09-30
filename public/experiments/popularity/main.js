// Size by use: the FontMap layout with each glyph sized by its Google Fonts views.
// Sizes follow a bounded log scale, and a collision pass (a Dorling-style cartogram)
// pushes neighbours aside so big glyphs never cover small ones.

import { forceSimulation, forceCollide, forceX, forceY } from 'https://cdn.jsdelivr.net/npm/d3-force@3/+esm';

const DATA = '../../data/';
// Same reference canvas, padding and glyph size as the app's map.
const REF_W = 1600;
const REF_H = 900;
const PAD = 40;
const BASE = 20;
// Glyph box sizes on the reference canvas at full scale: the least used font gets
// S_MIN, Roboto S_MAX. GAMMA > 1 keeps the long tail small so the leaders stand out.
const S_MIN = 13;
const S_MAX = 120;
const GAMMA = 3;
// Collision radius as a share of the glyph box: the A covers about 60% of it.
const INK_RADIUS = 0.31;
const GAP = 0.6;
const FIT = 0.94;
const MAX_ZOOM = 30;
const INTRO_MS = 2400;
const LABEL_MIN_PX = 30;
const LEGEND_VIEWS = [1e6, 1e8, 1e10];

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');
const slider = $('exponent');
const tooltip = $('tooltip');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const pct = (x) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;
const lerp = (a, b, t) => a + (b - a) * t;

let fonts = [];
let order = [];
let meta = null;
let scaleT = 0;
let bounds = [null, null];
let view = { k: 1, x: 0, y: 0 };
let showNames = true;
let hovered = -1;
let anim = null;
let needsDraw = false;

function lookupPath(paths, font) {
  const key = (font.imageName || font.name || '').toLowerCase();
  return paths[`${font.id}_a`] || paths[font.id] || paths[`${key}_a`] || paths[key];
}

const sizeForViews = (v) => {
  const l = Math.max(0, Math.min(1, (Math.log(v) - meta.lmin) / (meta.lmax - meta.lmin)));
  return S_MIN + (S_MAX - S_MIN) * l ** GAMMA;
};

async function load() {
  const [map, spriteText, popularity] = await Promise.all([
    fetch(`${DATA}typography_data.json`).then((r) => r.json()),
    fetch(`${DATA}font-sprite.svg`).then((r) => r.text()),
    fetch(`${DATA}popularity.json`).then((r) => r.json()),
  ]);

  const paths = {};
  new DOMParser().parseFromString(spriteText, 'image/svg+xml').querySelectorAll('symbol').forEach((s) => {
    const p = s.querySelector('path');
    if (s.id && p) paths[s.id] = p.getAttribute('d');
  });

  const xs = map.fonts.map((f) => f.x);
  const ys = map.fonts.map((f) => f.y);
  const [xMin, xMax, yMin, yMax] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min((REF_W - 2 * PAD) / (xMax - xMin), (REF_H - 2 * PAD) / (yMax - yMin));
  const ox = (REF_W - (xMax - xMin) * s) / 2;
  const oy = (REF_H - (yMax - yMin) * s) / 2;

  const known = Object.values(popularity.views);
  const floor = Math.min(...known);
  fonts = map.fonts
    .map((f) => ({ f, d: lookupPath(paths, f) }))
    .filter(({ d }) => d)
    .map(({ f, d }) => ({
      id: f.id,
      name: f.name,
      family: f.family,
      url: f.google_fonts_url,
      x0: (f.x - xMin) * s + ox,
      y0: (yMax - f.y) * s + oy,
      views: popularity.views[f.id] ?? floor,
      hasViews: f.id in popularity.views,
      path: new Path2D(d),
    }));

  const total = fonts.reduce((a, f) => a + (f.hasViews ? f.views : 0), 0);
  order = fonts.map((_, i) => i).sort((a, b) => fonts[b].views - fonts[a].views);
  order.forEach((i, rank) => { fonts[i].rank = rank + 1; fonts[i].share = fonts[i].hasViews ? fonts[i].views / total : 0; });
  meta = {
    total,
    fetched: popularity.fetched,
    lmin: Math.log(floor),
    lmax: Math.log(Math.max(...known)),
    ranked: fonts.filter((f) => f.hasViews).length,
  };

  fonts.forEach((f) => { f.s1 = sizeForViews(f.views); });
  relax();
  bounds = [boundsAt(0), boundsAt(1)];
}

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

function stateAt(f, t) {
  return { x: lerp(f.x0, f.x1, t), y: lerp(f.y0, f.y1, t), s: lerp(BASE, f.s1, t) };
}

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

function setScale(t, fromSlider = false) {
  scaleT = t;
  if (!fromSlider) slider.value = String(t);
  $('exponent-label').textContent = t < 0.005 ? 'Equal size' : t > 0.995 ? 'By views, log scale' : `${Math.round(t * 100)}%`;
  $('legend').classList.toggle('is-visible', t > 0.5);
  requestDraw();
}

// ── View: reference canvas -> CSS pixels, framed on the layout's bounds at scale t ──
// On wide screens the map is framed to the right of the panel.
const screenInset = () => ({ left: window.innerWidth > 900 ? 332 : 0, top: 0 });

function baseFit(W, H, t = scaleT, { left = 0, top = 0 } = screenInset()) {
  const b = bounds[0].map((v, i) => lerp(v, bounds[1][i], t));
  const bw = b[2] - b[0];
  const bh = b[3] - b[1];
  const s = Math.min((W - left) / bw, (H - top) / bh) * FIT;
  return { s, bx: left + (W - left - bw * s) / 2 - b[0] * s, by: top + (H - top - bh * s) / 2 - b[1] * s };
}

function transformFor(W, H, v = view, t = scaleT, inset = screenInset()) {
  const { s, bx, by } = baseFit(W, H, t, inset);
  return { a: s * v.k, bx: bx + s * v.x, by: by + s * v.y };
}

function colors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n) => cs.getPropertyValue(n).trim();
  return { bg: get('--bg'), ink: get('--ink'), ink2: get('--ink-2'), ink3: get('--ink-3') };
}

// ui scales text and the label threshold (the 4K export draws at ui = 2.4).
function draw(c, W, H, dpr, T, { names, hi = -1, t = scaleT, ui = 1 }) {
  const { bg, ink, ink2, ink3 } = colors();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = bg;
  c.fillRect(0, 0, W * dpr, H * dpr);

  const labels = [];
  for (const i of order) {
    const f = fonts[i];
    const st = stateAt(f, t);
    const S = st.s * T.a;
    const cx = T.a * st.x + T.bx;
    const cy = T.a * st.y + T.by;
    if (cx + S < 0 || cy + S < 0 || cx - S > W || cy - S > H) continue;
    const g = S / 80;
    c.setTransform(dpr * g, 0, 0, dpr * g, dpr * (cx - S / 2), dpr * (cy - S / 2));
    c.fillStyle = i === hi ? ink3 : ink;
    c.fill(f.path);
    if (names && S >= LABEL_MIN_PX * ui) labels.push({ f, S, cx, cy });
  }

  if (!names || !labels.length) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.lineJoin = 'round';
  const placed = [];
  for (const { f, S, cx, cy } of labels) {
    const size = Math.round(Math.max(10 * ui, Math.min(14 * ui, S * 0.16)));
    c.font = `600 ${size}px 'Source Sans Pro', sans-serif`;
    const w = c.measureText(f.name).width;
    const y = cy + S * 0.32;
    const box = [cx - w / 2 - 2, y - 1, cx + w / 2 + 2, y + size + 1];
    if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    placed.push(box);
    c.lineWidth = Math.max(3, size * 0.35);
    c.strokeStyle = bg;
    c.strokeText(f.name, cx, y);
    c.fillStyle = ink2;
    c.fillText(f.name, cx, y);
  }
}

function renderLegend() {
  const { s } = baseFit(window.innerWidth, window.innerHeight, 1);
  // The sprite draws the A at 60px in an 80px box.
  $('legend-items').innerHTML = LEGEND_VIEWS.map((v) => {
    const px = sizeForViews(v) * s * 0.75;
    return `<span class="legend-item"><span class="legend-glyph" style="font-size:${px.toFixed(1)}px">A</span>${compact.format(v)}</span>`;
  }).join('');
}

function frame() {
  needsDraw = false;
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  draw(ctx, W, H, dpr, transformFor(W, H), { names: showNames, hi: hovered });
}

function requestDraw() {
  if (needsDraw) return;
  needsDraw = true;
  requestAnimationFrame(frame);
}

// ── Scale animation ──
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

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

function animateView(target, ms = 600) {
  const from = { ...view };
  const t0 = performance.now();
  const step = (now) => {
    const x = ease(Math.min(1, (now - t0) / ms));
    view = { k: lerp(from.k, target.k, x), x: lerp(from.x, target.x, x), y: lerp(from.y, target.y, x) };
    requestDraw();
    if (x < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Picking: smallest first, they are drawn on top ──
function pick(px, py) {
  const T = transformFor(window.innerWidth, window.innerHeight);
  for (let n = order.length - 1; n >= 0; n--) {
    const i = order[n];
    const st = stateAt(fonts[i], scaleT);
    const S = st.s * T.a;
    const r = Math.max(4, S * INK_RADIUS);
    const dx = px - (T.a * st.x + T.bx);
    const dy = py - (T.a * st.y + T.by);
    if (dx * dx + dy * dy <= r * r) return i;
  }
  return -1;
}

function showTooltip(i, px, py) {
  if (i < 0) { tooltip.classList.remove('is-visible'); return; }
  const f = fonts[i];
  const detail = f.hasViews
    ? `<span>${compact.format(f.views)} views · 30 days</span><br><span>${pct(f.share)} of all views · #${f.rank.toLocaleString('en-US')} of ${meta.ranked.toLocaleString('en-US')}</span>`
    : '<span>No usage data</span>';
  tooltip.innerHTML = `<strong>${f.name}</strong>${detail}`;
  const r = tooltip.getBoundingClientRect();
  const x = Math.min(window.innerWidth - r.width - 8, px + 14);
  const y = py + 16 + r.height > window.innerHeight ? py - r.height - 12 : py + 16;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.classList.add('is-visible');
}

// ── Interaction: wheel zoom, drag pan, click to open ──
function zoomAt(px, py, factor) {
  const { s, bx, by } = baseFit(window.innerWidth, window.innerHeight);
  const k = Math.min(MAX_ZOOM, Math.max(1, view.k * factor));
  // Keep the point under the cursor fixed.
  const wx = ((px - bx) / s - view.x) / view.k;
  const wy = ((py - by) / s - view.y) / view.k;
  view = k === 1 ? { k: 1, x: 0, y: 0 } : { k, x: (px - bx) / s - wx * k, y: (py - by) / s - wy * k };
  requestDraw();
}

let drag = null;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    canvas.classList.add('is-dragging');
    const { s } = baseFit(window.innerWidth, window.innerHeight);
    view = { ...view, x: drag.vx + dx / s, y: drag.vy + dy / s };
    showTooltip(-1);
    requestDraw();
    return;
  }
  const i = pick(e.clientX, e.clientY);
  if (i !== hovered) { hovered = i; requestDraw(); }
  canvas.classList.toggle('is-over', i >= 0);
  showTooltip(i, e.clientX, e.clientY);
});

canvas.addEventListener('pointerup', (e) => {
  const click = drag && !drag.moved;
  drag = null;
  canvas.classList.remove('is-dragging');
  if (!click) return;
  const i = pick(e.clientX, e.clientY);
  if (i >= 0 && fonts[i].url) window.open(fonts[i].url, '_blank', 'noopener');
});

canvas.addEventListener('pointerleave', () => { hovered = -1; showTooltip(-1); requestDraw(); });
canvas.addEventListener('dblclick', () => animateView({ k: 1, x: 0, y: 0 }));
window.addEventListener('resize', () => { renderLegend(); requestDraw(); });

slider.addEventListener('input', () => { cancelAnimationFrame(anim); setScale(Number(slider.value), true); });
$('replay').addEventListener('click', () => play());
$('names').addEventListener('change', (e) => { showNames = e.target.checked; requestDraw(); });
$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('fontmap-dark-mode', String(dark));
  requestDraw();
});

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, button')) return;
  if (e.key === ' ') { e.preventDefault(); play(); }
  if (e.key === '0') animateView({ k: 1, x: 0, y: 0 });
});

// ── 4K export of the whole map, with its caption and size key ──
$('download').addEventListener('click', () => {
  const W = 3840;
  const H = 2160;
  const ui = W / 1600;
  const top = 280;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const c = out.getContext('2d');
  const T = transformFor(W, H, { k: 1, x: 0, y: 0 }, scaleT, { left: 0, top });
  draw(c, W, H, 1, T, { names: showNames, ui });

  const { ink, ink2 } = colors();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = ink;
  c.font = "700 88px 'Source Sans Pro', sans-serif";
  c.fillText('Google Fonts, sized by use', 120, 170);
  c.fillStyle = ink2;
  c.font = "400 40px 'Source Sans Pro', sans-serif";
  c.fillText(`${fonts.length.toLocaleString('en-US')} fonts placed by how they look, sized by how often Google Fonts served them to websites in the last 30 days (log scale).`, 120, 234);

  if (scaleT > 0.5) {
    const s = T.a;
    let x = 120;
    const base = H - 90;
    c.font = "600 30px 'Source Sans Pro', sans-serif";
    c.fillText('Views, 30 days', x, base - 150);
    for (const v of LEGEND_VIEWS) {
      const px = sizeForViews(v) * s * 0.75;
      c.fillStyle = ink;
      c.font = `400 ${px}px 'Source Sans Pro', sans-serif`;
      c.fillText('A', x, base - 40);
      const w = c.measureText('A').width;
      c.fillStyle = ink2;
      c.font = "400 30px 'Source Sans Pro', sans-serif";
      c.fillText(compact.format(v), x, base);
      x += Math.max(w, c.measureText(compact.format(v)).width) + 60;
    }
  }

  c.textAlign = 'right';
  c.fillStyle = ink2;
  c.font = "400 30px 'Source Sans Pro', sans-serif";
  c.fillText(`Data: Google Fonts Analytics, fetched ${meta.fetched} · Layout: FontCLIP + t-SNE · huggingface.co/spaces/tfrere/font-map`, W - 120, H - 90);

  const a = document.createElement('a');
  a.download = `fontmap-size-by-use-${meta.fetched}.png`;
  a.href = out.toDataURL('image/png');
  a.click();
});

load()
  .then(() => document.fonts.ready)
  .then(() => {
    renderStats();
    renderLegend();
    setScale(0);
    $('loader').classList.add('is-done');
    setTimeout(() => play(), 500);
  })
  .catch((err) => {
    console.error(err);
    $('loader').innerHTML = '<p style="font-size:14px;color:var(--ink-2)">Could not load the map data.</p>';
  });

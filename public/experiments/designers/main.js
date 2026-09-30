// Designers on the map: one designer's fonts in ink over a padded hull of the space they cover.

import { loadMap, BASE, pct, ease, lerp, escapeHtml } from '../shared/map.js';
import { createView, exportPng, hideLoader } from '../shared/view.js';

// Spread is only ranked for designers with at least MIN_FONTS families.
const MIN_FONTS = 8;
const PICKS = 6;
const DIM = 0.16;
const SELECTED_SIZE = 1.25;
const HULL_PAD = 0.85;
const FADE_MS = 450;

const $ = (id) => document.getElementById(id);

let fonts = [];
let designers = new Map();
let ranked = [];
let selected = null;
let previous = null;
let mix = 1;
let order = [];
let view = null;
let fetched = '';

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function buildIndex() {
  designers = new Map();
  fonts.forEach((f, i) => {
    for (const name of f.designers || []) {
      if (!designers.has(name)) designers.set(name, { name, fonts: [] });
      designers.get(name).fonts.push(i);
    }
  });

  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fonts) b = [Math.min(b[0], f.x0), Math.min(b[1], f.y0), Math.max(b[2], f.x0), Math.max(b[3], f.y0)];
  const diag = Math.hypot(b[2] - b[0], b[3] - b[1]);

  for (const d of designers.values()) {
    const pts = d.fonts.map((i) => [fonts[i].x0, fonts[i].y0]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    d.spread = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length / diag;
    d.hull = hull(pts);
    d.set = new Set(d.fonts);
    const years = d.fonts.map((i) => fonts[i].added).filter(Boolean).map((a) => Number(a.slice(0, 4)));
    d.years = years.length ? [Math.min(...years), Math.max(...years)] : null;
  }
  ranked = [...designers.values()].filter((d) => d.fonts.length >= MIN_FONTS).sort((a, b) => b.spread - a.spread);
  ranked.forEach((d, r) => { d.rank = r; });
}

const inSet = (d, i) => Boolean(d && d.set.has(i));

function glyphAt(i) {
  const f = fonts[i];
  const t = ease(mix);
  const a = inSet(selected, i) ? 1 : DIM;
  const a0 = previous ? (inSet(previous, i) ? 1 : DIM) : a;
  const s = inSet(selected, i) ? SELECTED_SIZE : 1;
  const s0 = previous ? (inSet(previous, i) ? SELECTED_SIZE : 1) : s;
  return { x: f.x0, y: f.y0, s: BASE * lerp(s0, s, t), alpha: lerp(a0, a, t) };
}

function paintHull(c, d, T, alpha, pal, ui) {
  if (!d || alpha <= 0) return;
  const pad = BASE * HULL_PAD * T.a;
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  d.hull.forEach(([x, y], n) => {
    const px = T.a * x + T.bx;
    const py = T.a * y + T.by;
    if (n === 0) c.moveTo(px, py); else c.lineTo(px, py);
  });
  c.closePath();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = pad * 2 + 2 * ui;
  c.strokeStyle = pal.line;
  c.stroke();
  c.lineWidth = pad * 2;
  c.strokeStyle = pal.tint;
  c.fillStyle = pal.tint;
  c.stroke();
  c.fill();
  c.restore();
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function spreadLabel(d) {
  if (d.rank == null) return `— (under ${MIN_FONTS} families)`;
  const n = ranked.length;
  return d.rank < n / 2 ? `${ordinal(d.rank + 1)} widest of ${n}` : `${ordinal(n - d.rank)} most focused of ${n}`;
}

function mixLabel(d) {
  const counts = {};
  for (const i of d.fonts) counts[fonts[i].family] = (counts[fonts[i].family] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c, n]) => `${pct(n / d.fonts.length).replace('.0', '')} ${c}`)
    .join(', ');
}

function renderPicks() {
  const item = (d) => `<li><button type="button" data-name="${escapeHtml(d.name)}" title="${escapeHtml(d.name)}">${escapeHtml(d.name)} <small>${d.fonts.length}</small></button></li>`;
  $('widest').innerHTML = ranked.slice(0, PICKS).map(item).join('');
  $('focused').innerHTML = ranked.slice(-PICKS).reverse().map(item).join('');
  document.querySelectorAll('.picks').forEach((el) => el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) select(b.dataset.name);
  }));

  $('designer-list').innerHTML = [...designers.values()]
    .sort((a, b) => b.fonts.length - a.fonts.length || a.name.localeCompare(b.name))
    .map((d) => `<option value="${escapeHtml(d.name)}">${d.fonts.length} ${d.fonts.length === 1 ? 'family' : 'families'}</option>`)
    .join('');
}

function renderPanel() {
  const d = selected;
  $('designer').textContent = d.name;
  const rows = [
    ['Families', d.fonts.length.toLocaleString('en-US')],
    ['Spread', spreadLabel(d)],
    ['Published', d.years ? (d.years[0] === d.years[1] ? `${d.years[0]}` : `${d.years[0]}–${d.years[1]}`) : '—'],
    ['Mix', mixLabel(d)],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  document.querySelectorAll('.picks button').forEach((b) => b.classList.toggle('is-active', b.dataset.name === d.name));
}

function select(name, { animate = true, updateHash = true } = {}) {
  const d = designers.get(name);
  if (!d || d === selected) return;
  previous = animate ? selected : null;
  selected = d;
  order = fonts.map((_, i) => i).filter((i) => !d.set.has(i)).concat(d.fonts);
  if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(name)}`);
  renderPanel();

  if (!previous) { mix = 1; view.requestDraw(); return; }
  const t0 = performance.now();
  const step = (ts) => {
    mix = Math.min(1, (ts - t0) / FADE_MS);
    view.requestDraw();
    if (mix < 1) requestAnimationFrame(step);
    else previous = null;
  };
  mix = 0;
  requestAnimationFrame(step);
}

const fromHash = () => decodeURIComponent(location.hash.slice(1));

async function init() {
  const data = await loadMap({ catalog: true });
  fonts = data.fonts;
  fetched = data.catalog.fetched;
  buildIndex();

  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fonts) {
    b[0] = Math.min(b[0], f.x0 - BASE); b[1] = Math.min(b[1], f.y0 - BASE);
    b[2] = Math.max(b[2], f.x0 + BASE); b[3] = Math.max(b[3], f.y0 + BASE);
  }

  view = createView({
    canvas: $('map'),
    tooltip: $('tooltip'),
    fonts,
    order: () => order,
    glyph: glyphAt,
    bounds: () => b,
    labelMinPx: 0,
    label: (i) => (inSet(selected, i) && mix === 1 ? fonts[i].name : null),
    underlay: (c, T, pal, ui) => {
      paintHull(c, previous, T, 1 - ease(mix), pal, ui);
      paintHull(c, selected, T, previous ? ease(mix) : 1, pal, ui);
    },
    describe: (i) => {
      const f = fonts[i];
      const who = f.designers?.length ? escapeHtml(f.designers.join(', ')) : 'Designer unknown';
      const action = inSet(selected, i) ? 'Click to open on Google Fonts' : f.designers?.length ? 'Click to show this designer' : '';
      return `<strong>${escapeHtml(f.name)}</strong><span>${who}</span>${action ? `<br><span>${action}</span>` : ''}`;
    },
    onClick: (i) => {
      const f = fonts[i];
      if (inSet(selected, i)) window.open(f.url, '_blank', 'noopener');
      else if (f.designers?.length) select(f.designers[0]);
    },
  });

  renderPicks();
  $('search').addEventListener('input', (e) => {
    if (designers.has(e.target.value)) { select(e.target.value); e.target.blur(); }
  });
  $('search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    const hit = [...designers.values()].filter((d) => d.name.toLowerCase().includes(q)).sort((a, b) => b.fonts.length - a.fonts.length)[0];
    if (q && hit) { select(hit.name); e.target.value = hit.name; e.target.blur(); }
  });
  $('names').addEventListener('change', (e) => view.setNames(e.target.checked));
  window.addEventListener('hashchange', () => select(fromHash(), { updateHash: false }));

  $('source').innerHTML = `Designers from the <a href="https://fonts.google.com" target="_blank" rel="noopener">Google Fonts</a> catalogue
    (fetched ${fetched}). Spread is the mean distance of a designer's fonts to their centre, as a share of the map's diagonal.`;

  $('download').addEventListener('click', () => exportPng(view, {
    title: `${selected.name} on the map`,
    subtitle: `${selected.fonts.length} Google Fonts families, placed by how they look among all ${fonts.length.toLocaleString('en-US')}. Spread: ${spreadLabel(selected)}.`,
    source: `Data: Google Fonts catalogue, fetched ${fetched} · Layout: FontCLIP + t-SNE · huggingface.co/spaces/tfrere/font-map`,
    filename: `fontmap-${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`,
  }));

  await document.fonts.ready;
  select(designers.has(fromHash()) ? fromHash() : ranked[0].name, { animate: false, updateHash: false });
  hideLoader();
}

init().catch(hideLoader);

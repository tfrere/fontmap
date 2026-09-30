// Who drew the fonts you know? A gallery of designers, each drawn on a small map, and a
// full-screen view of one designer: their fonts in ink over a padded hull of the space they cover.

import { loadMap, BASE, compact, pct, ease, lerp, escapeHtml } from '../shared/map.js';
import { createView, colors, exportPng, hideLoader } from '../shared/view.js';

// Designers with fewer families than MIN_FONTS only show up in search results.
const MIN_FONTS = 3;
const PAGE = 24;
const DIM = 0.16;
const SELECTED_SIZE = 1.25;
const HOVER_SIZE = 2.2;
const HULL_PAD = 1;
const FADE_MS = 450;
const CARD = { pad: 14, hull: 11, dot: 5, glyph: 13, lead: 18 };

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

let fonts = [];
let designers = new Map();
let ranked = [];
let selected = null;
let previous = null;
let mix = 1;
let order = [];
let view = null;
let usage = null;
let fetched = '';
let listHover = -1;
let sort = 'known';
let query = '';
let limit = PAGE;
let gridScroll = 0;
let layoutBounds = null;
let silhouette = null;

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

  const b = layoutBounds;
  const diag = Math.hypot(b[2] - b[0], b[3] - b[1]);
  for (const d of designers.values()) {
    d.fonts.sort((a, c) => fonts[c].views - fonts[a].views);
    const pts = d.fonts.map((i) => [fonts[i].x0, fonts[i].y0]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    d.spread = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length / diag;
    d.hull = hull(pts);
    d.set = new Set(d.fonts);
    d.views = d.fonts.reduce((s, i) => s + fonts[i].views, 0);
    d.search = [d.name, ...d.fonts.map((i) => fonts[i].name)].join('\n').toLowerCase();
    const years = d.fonts.map((i) => fonts[i].added).filter(Boolean).map((a) => Number(a.slice(0, 4)));
    d.years = years.length ? [Math.min(...years), Math.max(...years)] : null;
  }
  ranked = [...designers.values()].filter((d) => d.fonts.length >= MIN_FONTS).sort((a, c) => c.spread - a.spread);
  ranked.forEach((d, r) => { d.rank = r; });
}

const inSet = (d, i) => Boolean(d && d.set.has(i));

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function rangeLabel(d) {
  if (d.rank == null) return `— (under ${MIN_FONTS} families)`;
  const n = ranked.length;
  return d.rank < n / 2 ? `${ordinal(d.rank + 1)} widest of ${n}` : `${ordinal(n - d.rank)} most focused of ${n}`;
}

const knownFor = (d, n = 3) => d.fonts.slice(0, n).map((i) => fonts[i].name);

function listSentence(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
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

// ---- Gallery ------------------------------------------------------------------------

function cardTransform(w, h) {
  const b = layoutBounds;
  const s = Math.min((w - 2 * CARD.pad) / (b[2] - b[0]), (h - 2 * CARD.pad) / (b[3] - b[1]));
  return { s, ox: (w - (b[2] - b[0]) * s) / 2 - b[0] * s, oy: (h - (b[3] - b[1]) * s) / 2 - b[1] * s };
}

function drawGlyph(c, f, x, y, size) {
  const g = size / 80;
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(g, g);
  c.fill(f.path);
  c.restore();
}

// Every card shares the same faint map underneath, rendered once per size and theme.
function getSilhouette(w, h, dpr, pal) {
  const key = `${w}x${h}@${dpr}:${pal.ink3}`;
  if (silhouette?.key === key) return silhouette.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const T = cardTransform(w, h);
  c.fillStyle = pal.ink3;
  c.globalAlpha = 0.45;
  for (const f of fonts) drawGlyph(c, f, T.ox + f.x0 * T.s, T.oy + f.y0 * T.s, CARD.dot);
  silhouette = { key, canvas };
  return canvas;
}

function drawCard(canvas, d) {
  const w = canvas.clientWidth;
  if (!w) return;
  const h = Math.round((w * 10) / 16);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  const pal = colors();
  const T = cardTransform(w, h);
  c.scale(dpr, dpr);
  c.fillStyle = pal.bg;
  c.fillRect(0, 0, w, h);

  paintTerritory(c, d, (x, y) => [T.ox + x * T.s, T.oy + y * T.s], CARD.hull, 1, pal);
  c.drawImage(getSilhouette(w, h, dpr, pal), 0, 0, w, h);

  c.fillStyle = pal.ink;
  for (let n = d.fonts.length - 1; n >= 0; n--) {
    const f = fonts[d.fonts[n]];
    drawGlyph(c, f, T.ox + f.x0 * T.s, T.oy + f.y0 * T.s, n === 0 ? CARD.lead : CARD.glyph);
  }
}

function visibleDesigners() {
  const pool = query ? [...designers.values()].filter((d) => d.search.includes(query)) : ranked;
  const unranked = (d) => (d.rank == null ? 1 : 0);
  const by = {
    known: (a, b) => b.views - a.views,
    wide: (a, b) => unranked(a) - unranked(b) || b.spread - a.spread,
    focused: (a, b) => unranked(a) - unranked(b) || a.spread - b.spread,
    count: (a, b) => b.fonts.length - a.fonts.length || b.views - a.views,
  }[sort];
  return [...pool].sort(by);
}

function cardHtml(d) {
  const matches = query ? d.fonts.filter((i) => fonts[i].name.toLowerCase().includes(query)) : [];
  const lead = [...new Set([...matches, ...d.fonts])].slice(0, 2);
  const top = lead.map((i) => escapeHtml(fonts[i].name)).join(', ');
  const more = d.fonts.length > 2 ? ` <span>+${d.fonts.length - 2}</span>` : '';
  const meter = d.rank == null
    ? ''
    : `<span class="meter" title="Range: ${rangeLabel(d)}">Range <i><b style="width:${Math.round(100 - (d.rank / (ranked.length - 1)) * 100)}%"></b></i></span>`;
  return `<li><a class="card" href="#${encodeURIComponent(d.name)}">
    <canvas aria-hidden="true"></canvas>
    <div class="card-body">
      <p class="card-known">${top}${more}</p>
      <p class="card-by">by ${escapeHtml(d.name)}</p>
      <p class="card-meta"><span>${d.fonts.length} ${d.fonts.length === 1 ? 'family' : 'families'}</span>${meter}</p>
    </div>
  </a></li>`;
}

function renderCards() {
  const list = visibleDesigners();
  const shown = list.slice(0, limit);
  $('cards').innerHTML = shown.length
    ? shown.map(cardHtml).join('')
    : `<li class="empty">No designer or font matches “${escapeHtml(query)}”.</li>`;
  $('result-count').textContent = query
    ? `${list.length} ${list.length === 1 ? 'designer' : 'designers'} for “${query}”`
    : `${list.length} designers and foundries with at least ${MIN_FONTS} families`;
  $('more').hidden = list.length <= limit;
  $('more').textContent = `Show all ${list.length}`;
  drawCards(shown);
}

function drawCards(shown = visibleDesigners().slice(0, limit)) {
  const canvases = $('cards').querySelectorAll('canvas');
  requestAnimationFrame(() => canvases.forEach((cv, n) => drawCard(cv, shown[n])));
}

// ---- Focus --------------------------------------------------------------------------

function glyphAt(i) {
  const f = fonts[i];
  const t = ease(mix);
  const a = inSet(selected, i) ? 1 : DIM;
  const a0 = previous ? (inSet(previous, i) ? 1 : DIM) : a;
  const s = inSet(selected, i) ? (i === listHover ? HOVER_SIZE : SELECTED_SIZE) : 1;
  const s0 = previous ? (inSet(previous, i) ? SELECTED_SIZE : 1) : s;
  return { x: f.x0, y: f.y0, s: BASE * lerp(s0, s, t), alpha: lerp(a0, a, t) };
}

// A blob around each font shows where the designer actually works; the dashed convex hull
// only marks how far apart those places are.
function paintTerritory(c, d, project, radius, ui, pal) {
  c.save();
  c.fillStyle = pal.tint;
  c.beginPath();
  for (const i of d.fonts) {
    const [x, y] = project(fonts[i].x0, fonts[i].y0);
    c.moveTo(x + radius, y);
    c.arc(x, y, radius, 0, Math.PI * 2);
  }
  c.fill();
  if (d.hull.length > 1) {
    c.beginPath();
    d.hull.forEach(([hx, hy], n) => {
      const [x, y] = project(hx, hy);
      if (n === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.closePath();
    c.lineJoin = 'round';
    c.setLineDash([3 * ui, 3 * ui]);
    c.lineWidth = ui;
    c.strokeStyle = pal.ink3;
    c.globalAlpha *= 0.8;
    c.stroke();
  }
  c.restore();
}

function paintHull(c, d, T, alpha, pal, ui) {
  if (!d || alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  paintTerritory(c, d, (x, y) => [T.a * x + T.bx, T.a * y + T.by], BASE * HULL_PAD * T.a, ui, pal);
  c.restore();
}

function renderPanel() {
  const d = selected;
  $('designer').textContent = d.name;
  const known = knownFor(d);
  $('known').textContent = `Known for ${listSentence(known)}${d.fonts.length > known.length ? ', among others' : ''}.`;
  const rows = [
    ['Families', d.fonts.length.toLocaleString('en-US')],
    ['Range', rangeLabel(d)],
    ['Published', d.years ? (d.years[0] === d.years[1] ? `${d.years[0]}` : `${d.years[0]}–${d.years[1]}`) : '—'],
    ['Styles', mixLabel(d)],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('font-list').innerHTML = d.fonts.map((i) => {
    const f = fonts[i];
    const views = f.hasViews ? compact.format(f.views) : '—';
    return `<li><button type="button" data-i="${i}" title="Open ${escapeHtml(f.name)} on Google Fonts">
      <svg viewBox="0 0 80 80" aria-hidden="true"><path d="${f.d}"/></svg>
      <span class="name">${escapeHtml(f.name)}<small>${escapeHtml(f.family || '')}</small></span>
      <span class="views">${views}</span>
    </button></li>`;
  }).join('');
  $('font-list').scrollTop = 0;
}

function select(name, { animate = true } = {}) {
  const d = designers.get(name);
  if (!d || d === selected) return;
  previous = animate && selected ? selected : null;
  selected = d;
  listHover = -1;
  order = fonts.map((_, i) => i).filter((i) => !d.set.has(i)).concat([...d.fonts].reverse());
  document.title = `${d.name} · Who drew the fonts you know? · FontMap`;
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

// ---- Modes --------------------------------------------------------------------------

const fromHash = () => decodeURIComponent(location.hash.slice(1));

function route() {
  const name = fromHash();
  if (designers.has(name)) {
    if (root.classList.contains('is-grid')) {
      gridScroll = window.scrollY;
      root.classList.remove('is-grid');
      selected = null;
      select(name, { animate: false });
    } else {
      select(name);
    }
    view.requestDraw();
  } else {
    const wasFocus = !root.classList.contains('is-grid');
    root.classList.add('is-grid');
    document.title = 'Who drew the fonts you know? · FontMap experiment';
    drawCards();
    if (wasFocus) requestAnimationFrame(() => window.scrollTo(0, gridScroll));
  }
}

const goToGrid = () => {
  if (location.hash) history.pushState(null, '', location.pathname + location.search);
  route();
};

async function init() {
  const data = await loadMap({ popularity: true, catalog: true });
  fonts = data.fonts;
  usage = data.usage;
  fetched = data.catalog.fetched;

  layoutBounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fonts) {
    layoutBounds = [Math.min(layoutBounds[0], f.x0), Math.min(layoutBounds[1], f.y0), Math.max(layoutBounds[2], f.x0), Math.max(layoutBounds[3], f.y0)];
  }
  buildIndex();
  const viewBounds = [layoutBounds[0] - BASE, layoutBounds[1] - BASE, layoutBounds[2] + BASE, layoutBounds[3] + BASE];

  view = createView({
    canvas: $('map'),
    tooltip: $('tooltip'),
    fonts,
    order: () => order,
    glyph: glyphAt,
    bounds: () => viewBounds,
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
      else if (f.designers?.length) location.hash = encodeURIComponent(f.designers[0]);
    },
  });

  $('designer-count').textContent = designers.size.toLocaleString('en-US');
  $('views-label').textContent = `Views, ${usage.range.replace('day', ' days')}`;
  const source = `Designers and dates from the <a href="https://fonts.google.com" target="_blank" rel="noopener">Google Fonts</a> catalogue
    (fetched ${fetched}); views from Google Fonts Analytics. Range is the mean distance of a designer's fonts to their centre,
    as a share of the map's diagonal.`;
  $('source-grid').innerHTML = source;

  $('search').addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    limit = PAGE;
    renderCards();
  });
  document.querySelector('.sort').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    sort = b.dataset.sort;
    limit = PAGE;
    document.querySelectorAll('.sort button').forEach((x) => x.classList.toggle('is-active', x === b));
    renderCards();
  });
  $('more').addEventListener('click', () => { limit = Infinity; renderCards(); });

  const tools = document.querySelector('.gallery-tools');
  window.addEventListener('scroll', () => tools.classList.toggle('is-stuck', tools.getBoundingClientRect().top <= 0), { passive: true });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (root.classList.contains('is-grid')) drawCards(); }, 120);
  });

  $('theme-grid').addEventListener('click', () => {
    const dark = root.dataset.theme !== 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('fontmap-dark-mode', String(dark));
    drawCards();
  });
  $('theme').addEventListener('click', () => { silhouette = null; });

  $('panel-back').addEventListener('click', (e) => { e.preventDefault(); goToGrid(); });
  $('font-list').addEventListener('pointerover', (e) => {
    const b = e.target.closest('button');
    const i = b ? Number(b.dataset.i) : -1;
    if (i !== listHover) { listHover = i; view.requestDraw(); }
  });
  $('font-list').addEventListener('pointerleave', () => { listHover = -1; view.requestDraw(); });
  $('font-list').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) window.open(fonts[Number(b.dataset.i)].url, '_blank', 'noopener');
  });
  $('names').addEventListener('change', (e) => view.setNames(e.target.checked));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.classList.contains('is-grid')) goToGrid();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);

  $('download').addEventListener('click', () => exportPng(view, {
    title: `${selected.name} on the map`,
    subtitle: `${selected.fonts.length} Google Fonts families, among all ${fonts.length.toLocaleString('en-US')} placed by how they look. Known for ${listSentence(knownFor(selected))}.`,
    source: `Data: Google Fonts catalogue, fetched ${fetched} · Layout: FontCLIP + t-SNE · huggingface.co/spaces/tfrere/font-map`,
    filename: `fontmap-${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`,
  }));

  await document.fonts.ready;
  renderCards();
  if (location.hash.length > 1 && !designers.has(fromHash())) history.replaceState(null, '', location.pathname);
  route();
  hideLoader();
}

init().catch(hideLoader);

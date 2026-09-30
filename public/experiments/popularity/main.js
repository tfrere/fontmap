// Size by use: the FontMap layout with each glyph's area following its Google Fonts views.
// At scale 1 the total ink matches the regular map (every glyph at BASE), shared out by views.

const DATA = '../../data/';
// Same reference canvas, padding and glyph size as the app's map.
const REF_W = 1600;
const REF_H = 900;
const PAD = 40;
const BASE = 20;
const FIT = 0.92;
const MIN_PX = 1.2;
const MAX_ZOOM = 40;
const INTRO_MS = 2600;
const LABEL_MIN_PX = 44;

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');
const slider = $('exponent');
const tooltip = $('tooltip');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const pct = (x) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;

let fonts = [];
let order = [];
let sizes = new Float32Array(0);
let meta = null;
let scaleT = 0;
let view = { k: 1, x: 0, y: 0 };
let showNames = true;
let hovered = -1;
let anim = null;
let needsDraw = false;

function lookupPath(paths, font) {
  const key = (font.imageName || font.name || '').toLowerCase();
  return paths[`${font.id}_a`] || paths[font.id] || paths[`${key}_a`] || paths[key];
}

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
      wx: (f.x - xMin) * s + ox,
      wy: (yMax - f.y) * s + oy,
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
    vmax: fonts[order[0]].views,
    ranked: fonts.filter((f) => f.hasViews).length,
  };
  sizes = new Float32Array(fonts.length);
}

function computeSizes(t) {
  // Area weights views^t: t = 0 is the regular map, t = 1 makes area proportional to views.
  let sum = 0;
  const w = fonts.map((f) => { const x = (f.views / meta.vmax) ** t; sum += x; return x; });
  const k = fonts.length / sum;
  w.forEach((x, i) => { sizes[i] = BASE * Math.sqrt(k * x); });
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
  computeSizes(t);
  if (!fromSlider) slider.value = String(t);
  $('exponent-label').textContent = t < 0.005 ? 'Equal size' : t > 0.995 ? 'Area ∝ views' : `Area ∝ views^${t.toFixed(2)}`;
  requestDraw();
}

// ── View: reference canvas -> CSS pixels ──
// On wide screens the map is framed to the right of the panel.
const screenInset = () => ({ left: window.innerWidth > 900 ? 332 : 0, top: 0 });

function baseFit(W, H, { left = 0, top = 0 } = screenInset()) {
  const s = Math.min((W - left) / REF_W, (H - top) / REF_H) * FIT;
  return { s, bx: left + (W - left - REF_W * s) / 2, by: top + (H - top - REF_H * s) / 2 };
}

function transformFor(W, H, v = view, inset = screenInset()) {
  const { s, bx, by } = baseFit(W, H, inset);
  return { a: s * v.k, bx: bx + s * v.x, by: by + s * v.y };
}

function colors() {
  const cs = getComputedStyle(document.documentElement);
  return { bg: cs.getPropertyValue('--bg').trim(), ink: cs.getPropertyValue('--ink').trim(), ink2: cs.getPropertyValue('--ink-2').trim() };
}

// ui scales text, halos and the label threshold (the 4K export draws at ui = 2.4).
function draw(c, W, H, dpr, T, { names, hi = -1, ui = 1 }) {
  const { bg, ink, ink2 } = colors();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = bg;
  c.fillRect(0, 0, W * dpr, H * dpr);
  c.lineJoin = 'round';
  c.strokeStyle = bg;

  const labels = [];
  for (const i of order) {
    const f = fonts[i];
    const S = Math.max(MIN_PX, sizes[i] * T.a);
    const cx = T.a * f.wx + T.bx;
    const cy = T.a * f.wy + T.by;
    if (cx + S < 0 || cy + S < 0 || cx - S > W || cy - S > H) continue;
    const g = S / 80;
    c.setTransform(dpr * g, 0, 0, dpr * g, dpr * (cx - S / 2), dpr * (cy - S / 2));
    c.fillStyle = i === hi ? ink2 : ink;
    if (S > 6) {
      // A halo in the background colour keeps small glyphs readable on top of big ones.
      c.lineWidth = Math.min(3 * ui, S * 0.05) / g;
      c.stroke(f.path);
    }
    c.fill(f.path);
    if (names && S >= LABEL_MIN_PX * ui) labels.push({ f, S, cx, cy });
  }

  if (!names) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  const placed = [];
  for (const { f, S, cx, cy } of labels) {
    const size = Math.max(10 * ui, Math.min(22 * ui, S * 0.08));
    c.font = `600 ${size}px 'Source Sans Pro', sans-serif`;
    const w = c.measureText(f.name).width;
    const y = cy + S * 0.3;
    const box = [cx - w / 2 - 3, y - 2, cx + w / 2 + 3, y + size + 2];
    if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    placed.push(box);
    c.lineWidth = Math.max(3, size * 0.3);
    c.strokeStyle = bg;
    c.strokeText(f.name, cx, y);
    c.fillStyle = ink2;
    c.fillText(f.name, cx, y);
  }
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
    view = { k: from.k + (target.k - from.k) * x, x: from.x + (target.x - from.x) * x, y: from.y + (target.y - from.y) * x };
    requestDraw();
    if (x < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Picking ──
function pick(px, py) {
  const T = transformFor(window.innerWidth, window.innerHeight);
  for (let n = order.length - 1; n >= 0; n--) {
    const i = order[n];
    const f = fonts[i];
    const S = Math.max(MIN_PX, sizes[i] * T.a);
    const r = Math.max(4, S * 0.32);
    const dx = px - (T.a * f.wx + T.bx);
    const dy = py - (T.a * f.wy + T.by);
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
  // Keep the reference-canvas point under the cursor fixed.
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
window.addEventListener('resize', requestDraw);

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

// ── 4K export of the whole map, with its caption ──
$('download').addEventListener('click', () => {
  const W = 3840;
  const H = 2160;
  const top = 260;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const c = out.getContext('2d');
  draw(c, W, H, 1, transformFor(W, H, { k: 1, x: 0, y: 0 }, { left: 0, top }), { names: showNames, ui: W / 1600 });

  const { ink, ink2 } = colors();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = ink;
  c.font = "700 88px 'Source Sans Pro', sans-serif";
  c.fillText('Google Fonts, sized by use', 120, 170);
  c.fillStyle = ink2;
  c.font = "400 40px 'Source Sans Pro', sans-serif";
  c.fillText(`${fonts.length.toLocaleString('en-US')} fonts placed by how they look. ${scaleT > 0.995 ? 'Area proportional to' : 'Size follows'} how often Google Fonts served each one to websites in the last 30 days.`, 120, 232);
  c.textAlign = 'right';
  c.font = "400 30px 'Source Sans Pro', sans-serif";
  c.fillText(`Data: Google Fonts Analytics, fetched ${meta.fetched} · Layout: FontCLIP + t-SNE · huggingface.co/spaces/tfrere/font-map`, W - 120, H - 70);

  const a = document.createElement('a');
  a.download = `fontmap-size-by-use-${meta.fetched}.png`;
  a.href = out.toDataURL('image/png');
  a.click();
});

load()
  .then(() => document.fonts.ready)
  .then(() => {
    renderStats();
    setScale(0);
    $('loader').classList.add('is-done');
    setTimeout(() => play(), 500);
  })
  .catch((err) => {
    console.error(err);
    $('loader').innerHTML = '<p style="font-size:14px;color:var(--ink-2)">Could not load the map data.</p>';
  });

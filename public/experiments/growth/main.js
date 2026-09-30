// Sixteen years of Google Fonts: the map fills up in the order Google added each font.

import { loadMap, BASE, pct, escapeHtml } from '../shared/map.js';
import { createView, exportPng, hideLoader } from '../shared/view.js';

// A new glyph pops in over POP years, stays black for RECENT years, then fades to OLD.
const POP = 0.12;
const RECENT = 1;
const OLD = 0.3;
const YEARS_PER_SECOND = 1.1;

const $ = (id) => document.getElementById(id);
const slider = $('time');
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const CATEGORY = {
  'sans-serif': 'sans-serif',
  serif: 'serif',
  handwriting: 'handwriting',
  monospace: 'monospace',
  decorative: 'decorative',
  blackletter: 'blackletter',
};

let fonts = [];
let order = [];
let now = 0;
let first = 0;
let last = 0;
let playing = false;
let raf = null;
let view = null;
let fetched = '';

function toYear(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  return y + (d - start) / (Date.UTC(y + 1, 0, 1) - start);
}

const backOut = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

function glyphAt(f) {
  if (f.year == null || f.year > now) return null;
  const age = now - f.year;
  const pop = Math.min(1, age / POP);
  const fade = Math.min(1, Math.max(0, (age - RECENT) / RECENT));
  return { x: f.x0, y: f.y0, s: BASE * backOut(pop), alpha: 1 - (1 - OLD) * fade };
}

function renderHistogram() {
  const counts = new Map();
  for (const f of fonts) if (f.year != null) counts.set(Math.floor(f.year), (counts.get(Math.floor(f.year)) || 0) + 1);
  const years = [];
  for (let y = Math.floor(first); y <= Math.floor(last); y++) years.push(y);
  const max = Math.max(...counts.values());
  $('histogram').innerHTML = years.map((y) => `<button type="button" data-year="${y}" title="${y}: ${counts.get(y) || 0} fonts"><i style="height:${Math.max(2, ((counts.get(y) || 0) / max) * 100)}%"></i></button>`).join('');
  $('histogram-axis').innerHTML = `<span>${years[0]}</span><span>${years.at(-1)}</span>`;
  $('histogram').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pause();
    setNow(Math.min(last, Number(b.dataset.year) + 0.999));
  });
}

function renderPanel() {
  const year = Math.floor(now);
  $('year').textContent = year;
  document.querySelectorAll('#histogram button').forEach((b) => {
    const y = Number(b.dataset.year);
    b.classList.toggle('is-current', y === year);
    b.classList.toggle('is-past', y < year);
  });

  const shown = fonts.filter((f) => f.year != null && f.year <= now);
  const thisYear = shown.filter((f) => Math.floor(f.year) === year);
  const mix = Object.entries(thisYear.reduce((m, f) => ({ ...m, [f.family]: (m[f.family] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c, n]) => `${pct(n / thisYear.length).replace('.0', '')} ${CATEGORY[c] || c}`)
    .join(', ');
  const rows = [
    ['Fonts on the map', shown.length.toLocaleString('en-US')],
    [`Added in ${year}`, thisYear.length.toLocaleString('en-US')],
    [`${year}'s mix`, mix || '—'],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function setNow(t, fromSlider = false) {
  now = t;
  if (!fromSlider) slider.value = String(t);
  renderPanel();
  view.requestDraw();
}

function play() {
  if (now >= last) setNow(first);
  playing = true;
  $('play').textContent = 'Pause';
  let prev = performance.now();
  const step = (ts) => {
    const next = Math.min(last, now + ((ts - prev) / 1000) * YEARS_PER_SECOND);
    prev = ts;
    setNow(next);
    if (next < last && playing) raf = requestAnimationFrame(step);
    else pause();
  };
  raf = requestAnimationFrame(step);
}

function pause() {
  playing = false;
  cancelAnimationFrame(raf);
  $('play').textContent = now >= last ? 'Replay' : 'Play';
}

async function init() {
  const data = await loadMap({ catalog: true });
  fonts = data.fonts;
  fetched = data.catalog.fetched;
  fonts.forEach((f) => { f.year = f.added ? toYear(f.added) : null; });
  const dated = fonts.filter((f) => f.year != null);
  first = Math.floor(Math.min(...dated.map((f) => f.year)));
  last = Math.max(...dated.map((f) => f.year)) + POP;
  // Older first, so each year's additions sit on top.
  order = fonts.map((_, i) => i).sort((a, b) => (fonts[a].year ?? 0) - (fonts[b].year ?? 0));

  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fonts) {
    b[0] = Math.min(b[0], f.x0 - BASE / 2); b[1] = Math.min(b[1], f.y0 - BASE / 2);
    b[2] = Math.max(b[2], f.x0 + BASE / 2); b[3] = Math.max(b[3], f.y0 + BASE / 2);
  }

  view = createView({
    canvas: $('map'),
    tooltip: $('tooltip'),
    fonts,
    order: () => order,
    glyph: (i) => glyphAt(fonts[i]),
    bounds: () => b,
    label: (i, st) => (st.alpha > 0.95 ? fonts[i].name : null),
    describe: (i) => {
      const f = fonts[i];
      const when = f.added ? `Added ${monthFmt.format(new Date(`${f.added}T00:00:00Z`))}` : 'Date unknown';
      const who = f.designers?.length ? `<br><span>${escapeHtml(f.designers.join(', '))}</span>` : '';
      return `<strong>${escapeHtml(f.name)}</strong><span>${when}</span>${who}`;
    },
  });

  slider.min = String(first);
  slider.max = String(last);
  slider.addEventListener('input', () => { pause(); setNow(Number(slider.value), true); });
  $('play').addEventListener('click', () => (playing ? pause() : play()));
  $('names').addEventListener('change', (e) => view.setNames(e.target.checked));
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button')) return;
    if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
  });
  $('source').innerHTML = `Dates from the <a href="https://fonts.google.com" target="_blank" rel="noopener">Google Fonts</a> catalogue
    (fetched ${fetched}): when each family was published there, not when it was designed.`;

  $('download').addEventListener('click', () => exportPng(view, {
    title: `Google Fonts in ${Math.floor(now)}`,
    subtitle: `${fonts.filter((f) => f.year != null && f.year <= now).length.toLocaleString('en-US')} fonts on the map, placed by how they look. In black, the ones added in the last year.`,
    source: `Data: Google Fonts catalogue, fetched ${fetched} · Layout: FontCLIP + t-SNE · huggingface.co/spaces/tfrere/font-map`,
    filename: `fontmap-google-fonts-${Math.floor(now)}.png`,
  }));

  renderHistogram();
  await document.fonts.ready;
  setNow(first);
  hideLoader();
  setTimeout(play, 500);
}

init().catch(hideLoader);

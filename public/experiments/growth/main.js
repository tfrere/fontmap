// Sixteen years of Google Fonts: the map fills up in the order Google added each font,
// driven by a timeline of the fonts published each year along the bottom of the page.

import { loadMap, BASE, pct, escapeHtml } from '../shared/map.js';
import { createView, exportPng, hideLoader } from '../shared/view.js';

// A new glyph pops in over POP years, stays black for RECENT years, then fades to OLD.
const POP = 0.12;
const RECENT = 1;
const OLD = 0.3;
const YEARS_PER_SECOND = 1.1;

const $ = (id) => document.getElementById(id);
const track = $('track');
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

let fonts = [];
let order = [];
let byYear = new Map();
let years = [];
let maxCount = 1;
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

// The track spans whole years, first to the last year with a font; the head can stop
// a little past that last font so its pop-in completes.
const span = () => years.length;
const yearToX = (t) => Math.min(1, (t - first) / span());
const xToYear = (x) => Math.min(last, Math.max(first, first + x * span()));

function renderTimeline() {
  $('cols').innerHTML = years.map((y) => {
    const n = byYear.get(y)?.length || 0;
    return `<div class="tl-col" data-year="${y}" title="${y}: ${n} ${n === 1 ? 'font' : 'fonts'} added">
      <span class="tl-count">${n}</span>
      <div class="tl-bar-area"><i class="tl-bar" style="height:${Math.max(3, (n / maxCount) * 100)}%"><b class="tl-fill"></b></i></div>
      <span class="tl-label">${y}</span>
    </div>`;
  }).join('');
}

function updateTimeline() {
  const year = Math.floor(now);
  document.querySelectorAll('.tl-col').forEach((col) => {
    const y = Number(col.dataset.year);
    const list = byYear.get(y) || [];
    const added = y < year ? list.length : y > year ? 0 : list.filter((f) => f.year <= now).length;
    col.querySelector('.tl-fill').style.height = `${list.length ? (added / list.length) * 100 : 0}%`;
    col.classList.toggle('is-current', y === year);
  });
  $('head').style.left = `${yearToX(now) * 100}%`;
  $('year').textContent = Math.min(year, years.at(-1));
  $('month').textContent = now >= last ? 'Today' : monthFmt.format(new Date(Date.UTC(year, Math.floor((now - year) * 12), 1)));
  track.setAttribute('aria-valuenow', now.toFixed(2));
  track.setAttribute('aria-valuetext', `${$('month').textContent} ${$('year').textContent}`);
}

function renderPanel() {
  const year = Math.min(Math.floor(now), years.at(-1));
  const shown = fonts.filter((f) => f.year != null && f.year <= now);
  const thisYear = shown.filter((f) => Math.floor(f.year) === year);
  const mix = Object.entries(thisYear.reduce((m, f) => ({ ...m, [f.family]: (m[f.family] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c, n]) => `${pct(n / thisYear.length).replace('.0', '')} ${c}`)
    .join(', ');
  const rows = [
    ['Fonts on the map', shown.length.toLocaleString('en-US')],
    [`Added in ${year}`, thisYear.length.toLocaleString('en-US')],
    [`${year}'s mix`, mix || '—'],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function setNow(t) {
  now = t;
  updateTimeline();
  renderPanel();
  view.requestDraw();
}

function setPlaying(v) {
  playing = v;
  $('play').classList.toggle('is-paused', !v);
  $('play').setAttribute('aria-label', v ? 'Pause' : 'Play');
}

function play() {
  if (now >= last) setNow(first);
  setPlaying(true);
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
  setPlaying(false);
  cancelAnimationFrame(raf);
}

function bindTrack() {
  const scrub = (e) => {
    const r = track.getBoundingClientRect();
    setNow(xToYear((e.clientX - r.left) / r.width));
  };
  track.addEventListener('pointerdown', (e) => {
    pause();
    track.setPointerCapture(e.pointerId);
    scrub(e);
    const move = (ev) => scrub(ev);
    const up = () => { track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
  });
  track.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, PageDown: -1, PageUp: 1 }[e.key];
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); pause(); setNow(e.key === 'Home' ? first : last); return; }
    if (!step) return;
    e.preventDefault();
    pause();
    setNow(Math.min(last, Math.max(first, Math.floor(now) + step + 0.999)));
  });
}

function mapInset() {
  const wide = window.innerWidth > 900;
  const bottom = window.innerHeight - document.querySelector('.timeline').getBoundingClientRect().top + 8;
  return wide
    ? { left: 332, top: 56, bottom }
    : { left: 0, top: document.querySelector('.panel').getBoundingClientRect().bottom + 8, bottom };
}

async function init() {
  const data = await loadMap({ catalog: true });
  fonts = data.fonts;
  fetched = data.catalog.fetched;
  fonts.forEach((f) => { f.year = f.added ? toYear(f.added) : null; });
  const dated = fonts.filter((f) => f.year != null);
  for (const f of dated) {
    const y = Math.floor(f.year);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(f);
  }
  first = Math.min(...byYear.keys());
  const lastYear = Math.max(...byYear.keys());
  for (let y = first; y <= lastYear; y++) years.push(y);
  maxCount = Math.max(...[...byYear.values()].map((l) => l.length));
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
    inset: mapInset,
    label: (i, st) => (st.alpha > 0.95 ? fonts[i].name : null),
    describe: (i) => {
      const f = fonts[i];
      const when = f.added ? `Added ${dateFmt.format(new Date(`${f.added}T00:00:00Z`))}` : 'Date unknown';
      const who = f.designers?.length ? `<br><span>${escapeHtml(f.designers.join(', '))}</span>` : '';
      return `<strong>${escapeHtml(f.name)}</strong><span>${when}</span>${who}`;
    },
  });

  renderTimeline();
  bindTrack();
  $('play').addEventListener('click', () => (playing ? pause() : play()));
  $('names').addEventListener('change', (e) => view.setNames(e.target.checked));
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button, [role="slider"]')) return;
    if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
  });
  $('source').innerHTML = `Dates from the <a href="https://fonts.google.com" target="_blank" rel="noopener">Google Fonts</a> catalogue
    (fetched ${fetched}): when each family was published there, not when it was designed.`;

  $('download').addEventListener('click', () => exportPng(view, {
    title: `Google Fonts in ${Math.min(Math.floor(now), years.at(-1))}`,
    subtitle: `${fonts.filter((f) => f.year != null && f.year <= now).length.toLocaleString('en-US')} fonts on the map, placed by how they look. In black, the ones added in the last year.`,
    source: `Data: Google Fonts catalogue, fetched ${fetched} · Layout: FontCLIP + t-SNE · huggingface.co/spaces/tfrere/font-map`,
    filename: `fontmap-google-fonts-${Math.min(Math.floor(now), years.at(-1))}.png`,
  }));

  await document.fonts.ready;
  setNow(first);
  hideLoader();
  setTimeout(play, 500);
}

init().catch(hideLoader);

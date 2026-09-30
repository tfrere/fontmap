// Size by use: the FontMap layout with each glyph sized by its Google Fonts views and
// relaxed into a cartogram (engine/cartogram.js); the intro grows it from the plain map.

import { loadMap, BASE, compact, pct, lerp, ease, escapeHtml } from './engine/map';
import { createView, exportPng } from './engine/view';
import { sizeByUse } from './engine/cartogram';

const INTRO_MS = 2400;
const LEGEND_VIEWS = [1e6, 1e8, 1e10];

export async function mountSizeByUse(root, signal) {
  const $ = (id) => root.querySelector(`#${id}`);
  let fonts = [];
  let order = [];
  let meta = null;
  let sizeForViews = null;
  let scaleT = 0;
  let bounds = [null, null];
  let anim = null;
  let view = null;

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
      ['Half of all views', `${n} fonts`],
      ['Top 10', pct(shareOf(top.slice(0, 10)))],
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
      if (signal.aborted) return;
      const x = Math.min(1, (now - t0) / ms);
      setScale(from + (to - from) * ease(x));
      if (x < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  const data = await loadMap({ popularity: true });
  if (signal.aborted) return;
  fonts = data.fonts;
  ({ order, meta, sizeForViews } = sizeByUse(fonts, data.usage));
  bounds = [boundsAt(0), boundsAt(1)];

  view = createView({
    root,
    canvas: $('map'),
    tooltip: $('tooltip'),
    signal,
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

  const on = (target, type, fn) => target.addEventListener(type, fn, { signal });
  on($('replay'), 'click', () => play());
  on($('names'), 'change', (e) => view.setNames(e.target.checked));
  on(window, 'resize', renderLegend);
  on(window, 'keydown', (e) => {
    if (e.target.closest('input, button')) return;
    if (e.key === ' ') { e.preventDefault(); play(); }
  });
  signal.addEventListener('abort', () => cancelAnimationFrame(anim));

  on($('download'), 'click', () => exportPng(view, {
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
  if (signal.aborted) return;
  renderStats();
  renderLegend();
  setScale(0);
  setTimeout(() => { if (!signal.aborted) play(); }, 500);
}

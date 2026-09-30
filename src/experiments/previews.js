// Live previews for the experiments index: each one tells its experiment in a short loop,
// drawn from the real data. They only run while on screen, and hold one telling frame
// when the reader prefers reduced motion.

import { loadMap, BASE, ease, lerp, pct } from './engine/map';
import { colors, onThemeChange } from './engine/view';
import { sizeByUse } from './engine/cartogram';
import { indexDesigners, paintTerritory } from './engine/territory';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));

// Runs frame(ctx, W, H, t, pal) with a clock that only advances while the canvas is on
// screen. prepare() is awaited when the canvas first comes near the viewport.
function runPreview(canvas, signal, { prepare, frame, stillAt }) {
  const ctx = canvas.getContext('2d');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready = false;
  let visible = false;
  let raf = null;
  let clock = 0;
  let last = null;

  function draw(now) {
    raf = null;
    if (signal.aborted || !ready) return;
    if (last != null && !still) clock += Math.min(100, now - last);
    last = now;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    frame(ctx, W, H, still ? stillAt : clock, colors(canvas));
    if (visible && !still) raf = requestAnimationFrame(draw);
    else last = null;
  }
  const wake = () => { if (!raf && ready && !signal.aborted) raf = requestAnimationFrame(draw); };

  let started = false;
  const near = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || started) return;
    started = true;
    near.disconnect();
    Promise.resolve(prepare()).then(() => {
      if (signal.aborted) return;
      ready = true;
      canvas.classList.add('is-in');
      wake();
    }, (error) => console.error(error));
  }, { rootMargin: '300px 0px' });
  const onScreen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
  near.observe(canvas);
  onScreen.observe(canvas);
  window.addEventListener('resize', wake, { signal });
  onThemeChange(wake, signal);
  signal.addEventListener('abort', () => {
    near.disconnect();
    onScreen.disconnect();
    cancelAnimationFrame(raf);
  });
}

function fit(bounds, W, H, { pad = 16, bottom = 0 } = {}) {
  const bw = bounds[2] - bounds[0];
  const bh = bounds[3] - bounds[1];
  const s = Math.min((W - 2 * pad) / bw, (H - 2 * pad - bottom) / bh);
  return { s, ox: (W - bw * s) / 2 - bounds[0] * s, oy: pad + (H - 2 * pad - bottom - bh * s) / 2 - bounds[1] * s };
}

function glyph(c, f, x, y, S) {
  const g = S / 80;
  c.save();
  c.transform(g, 0, 0, g, x - S / 2, y - S / 2);
  c.fill(f.path);
  c.restore();
}

function label(c, text, x, y, size, pal, alpha = 1) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.font = `600 ${size}px 'Source Sans Pro', sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3, size * 0.4);
  c.strokeStyle = pal.bg;
  c.strokeText(text, x, y);
  c.fillStyle = pal.ink;
  c.fillText(text, x, y);
  c.restore();
}

// Labels pushed down until they clear the ones already placed and the given boxes.
function labels(c, items, size, pal, alpha, avoid = []) {
  if (alpha <= 0) return;
  c.save();
  c.font = `600 ${size}px 'Source Sans Pro', sans-serif`;
  const placed = [...avoid];
  for (const { text, x, y: y0 } of [...items].sort((a, b) => a.y - b.y)) {
    const w = c.measureText(text).width + 6;
    let y = y0;
    while (placed.some((b) => x - w / 2 < b[2] && x + w / 2 > b[0] && y < b[3] && y + size + 2 > b[1])) y += size + 2;
    placed.push([x - w / 2, y, x + w / 2, y + size + 2]);
    label(c, text, x, y, size, pal, alpha);
  }
  c.restore();
}

// Captions sit in the lower left corner and cross-fade as the story moves on.
function caption(c, W, H, lines, pal) {
  const size = Math.round(Math.max(13, Math.min(17, W / 34)));
  c.save();
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  for (const { text, alpha, strong } of lines) {
    if (alpha <= 0) continue;
    c.globalAlpha = alpha;
    c.font = `${strong ? 700 : 400} ${size}px 'Source Sans Pro', sans-serif`;
    c.fillStyle = strong ? pal.ink : pal.ink2;
    c.fillText(text, 16, H - 14);
  }
  c.restore();
  return size;
}

// ---- Size by use: always the final cartogram, where size is use. The most used fonts
// step forward one by one with their share of all views, then the few that take half
// of them stay in ink while the rest fade.

const SIZE_INTRO = 1600;
const SIZE_SPOTS = 5;
const SIZE_SPOT_MS = 1500;
const SIZE_HALF_MS = 3200;
const SIZE_OUTRO = 900;
const SIZE_HALF_AT = SIZE_INTRO + SIZE_SPOTS * SIZE_SPOT_MS;
const SIZE_LOOP = SIZE_HALF_AT + SIZE_HALF_MS + SIZE_OUTRO;
const SIZE_FADE = 260;

export function mountSizePreview(canvas, signal) {
  let fonts = [];
  let order = [];
  let back = [];
  let top = [];
  let bounds = null;

  // Weight of spotlight j at time t: fades in and out around its slot.
  const spot = (t, j) => {
    const a = SIZE_INTRO + j * SIZE_SPOT_MS;
    return ramp(t, a, a + SIZE_FADE) * (1 - ramp(t, a + SIZE_SPOT_MS - SIZE_FADE, a + SIZE_SPOT_MS));
  };

  runPreview(canvas, signal, {
    stillAt: SIZE_HALF_AT + SIZE_HALF_MS / 2,
    async prepare() {
      const data = await loadMap({ popularity: true });
      fonts = data.fonts;
      ({ order } = sizeByUse(fonts, data.usage));
      back = [...order].reverse();
      let acc = 0;
      for (const i of order) {
        if (acc >= 0.5) break;
        acc += fonts[i].share;
        top.push(i);
      }
      bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const f of fonts) {
        const r = f.s1 / 2;
        bounds = [Math.min(bounds[0], f.x1 - r), Math.min(bounds[1], f.y1 - r), Math.max(bounds[2], f.x1 + r), Math.max(bounds[3], f.y1 + r)];
      }
    },
    frame(c, W, H, time, pal) {
      const t = time % SIZE_LOOP;
      const dimSpots = ease(ramp(t, SIZE_INTRO, SIZE_INTRO + SIZE_FADE)) * (1 - ramp(t, SIZE_HALF_AT, SIZE_HALF_AT + SIZE_FADE));
      const half = ease(ramp(t, SIZE_HALF_AT, SIZE_HALF_AT + SIZE_FADE * 2)) * (1 - ease(ramp(t, SIZE_LOOP - SIZE_OUTRO, SIZE_LOOP)));
      const weights = new Map();
      for (let j = 0; j < SIZE_SPOTS; j++) weights.set(order[j], spot(t, j));
      const isTop = new Set(top);

      c.fillStyle = pal.bg;
      c.fillRect(0, 0, W, H);
      const T = fit(bounds, W, H, { pad: 14, bottom: 26 });
      const at = (f) => [T.ox + f.x1 * T.s, T.oy + f.y1 * T.s, f.s1 * T.s];
      c.fillStyle = pal.ink;
      for (const i of back) {
        const base = lerp(lerp(1, 0.3, dimSpots), 0.1, half);
        const lit = Math.max(weights.get(i) || 0, isTop.has(i) ? half : 0);
        c.globalAlpha = lerp(base, 1, lit);
        const [x, y, S] = at(fonts[i]);
        glyph(c, fonts[i], x, y, S);
      }
      c.globalAlpha = 1;

      const lines = [{ text: 'Each glyph sized by how often websites use it', alpha: 1 - dimSpots - half }];
      for (let j = 0; j < SIZE_SPOTS; j++) {
        const f = fonts[order[j]];
        const w = weights.get(order[j]);
        if (w <= 0) continue;
        const [x, y, S] = at(f);
        label(c, f.name, x, y + S * 0.34, 11, pal, w);
        lines.push({ text: `#${j + 1}  ${f.name}: ${pct(f.share)} of all views`, alpha: w, strong: true });
      }
      // The A fills about 60% of its box: labels go under it and around the others.
      const inks = top.map((i) => {
        const [x, y, S] = at(fonts[i]);
        return [x - S * 0.3, y - S * 0.3, x + S * 0.3, y + S * 0.3];
      });
      labels(c, top.map((i) => {
        const [x, y, S] = at(fonts[i]);
        return { text: `${fonts[i].name} ${pct(fonts[i].share)}`, x, y: y + S * 0.34 };
      }), 11, pal, half, inks);
      lines.push({ text: `${top.length} fonts get half of all views`, alpha: half, strong: true });
      caption(c, W, H, lines, pal);
    },
  });
}

// ---- Who drew the fonts you know? One designer after another lights up on the map, with
// the ground they cover and the fonts people know them for.

const DESIGNER_STEP = 3200;
const DESIGNER_FADE = 700;
const DESIGNER_COUNT = 8;

export function mountDesignersPreview(canvas, signal) {
  let fonts = [];
  let picks = [];
  let bounds = null;

  runPreview(canvas, signal, {
    stillAt: DESIGNER_STEP - 1,
    async prepare() {
      const data = await loadMap({ popularity: true, catalog: true });
      fonts = data.fonts;
      // The most viewed designers, skipping any whose best-known font was already shown
      // (Roboto is credited to three of them).
      const seen = new Set();
      for (const d of indexDesigners(fonts, { minFonts: 3 }).sort((a, b) => b.views - a.views)) {
        if (seen.has(d.fonts[0])) continue;
        seen.add(d.fonts[0]);
        picks.push(d);
        if (picks.length === DESIGNER_COUNT) break;
      }
      bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const f of fonts) bounds = [Math.min(bounds[0], f.x0), Math.min(bounds[1], f.y0), Math.max(bounds[2], f.x0), Math.max(bounds[3], f.y0)];
      bounds = [bounds[0] - BASE, bounds[1] - BASE, bounds[2] + BASE, bounds[3] + BASE];
    },
    frame(c, W, H, time, pal) {
      const step = Math.floor(time / DESIGNER_STEP);
      const cur = picks[step % picks.length];
      const prev = step > 0 ? picks[(step - 1) % picks.length] : null;
      const mix = prev ? ease(clamp01((time % DESIGNER_STEP) / DESIGNER_FADE)) : 1;
      const T = fit(bounds, W, H, { pad: 12, bottom: 30 });
      const project = (x, y) => [T.ox + x * T.s, T.oy + y * T.s];
      const size = BASE * T.s;

      c.fillStyle = pal.bg;
      c.fillRect(0, 0, W, H);
      c.save();
      if (prev) {
        c.globalAlpha = 1 - mix;
        paintTerritory(c, prev, project, size * 0.9, 1, pal);
      }
      c.globalAlpha = mix;
      paintTerritory(c, cur, project, size * 0.9, 1, pal);
      c.restore();

      c.fillStyle = pal.ink;
      fonts.forEach((f, i) => {
        const a = (cur.set.has(i) ? mix : 0) + (prev?.set.has(i) ? 1 - mix : 0);
        c.globalAlpha = lerp(0.13, 1, a);
        const [x, y] = project(f.x0, f.y0);
        glyph(c, f, x, y, size * lerp(1, 1.5, a));
      });
      c.globalAlpha = 1;
      const placed = [];
      cur.fonts.slice(0, 2).forEach((i) => {
        const [x, y] = project(fonts[i].x0, fonts[i].y0);
        if (placed.some(([px, py]) => Math.abs(px - x) < 70 && Math.abs(py - y) < 16)) return;
        placed.push([x, y]);
        label(c, fonts[i].name, x, y + size * 0.6, 11, pal, mix);
      });

      const known = cur.fonts.slice(0, 2).map((i) => fonts[i].name).join(', ');
      const fadeOut = 1 - ramp(time % DESIGNER_STEP, DESIGNER_STEP - 350, DESIGNER_STEP);
      const alpha = mix * fadeOut;
      const size13 = caption(c, W, H, [{ text: cur.name, alpha, strong: true }], pal);
      c.save();
      c.font = `700 ${size13}px 'Source Sans Pro', sans-serif`;
      const w = c.measureText(cur.name).width;
      c.globalAlpha = alpha;
      c.font = `400 ${size13}px 'Source Sans Pro', sans-serif`;
      c.fillStyle = pal.ink2;
      c.fillText(`  ·  ${cur.fonts.length} families, known for ${known}`, 16 + w, H - 14);
      c.restore();
    },
  });
}

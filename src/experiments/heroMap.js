// Hero of the experiments index: the whole map in faint ink, with a few soft lights that
// wander on their own from one well-known font to another and name it while they rest.
// With reduced motion the lights hold still.
//
// The faint map is rendered once per size and theme; each frame only redraws the glyphs
// near a light on top of it.

import { loadMap, BASE, ease } from './engine/map';
import { colors, onThemeChange } from './engine/view';

const BASE_ALPHA = 0.14;
const RADIUS = 150;
const GROW = 0.7;
const LIGHTS = 2;
const TRAVEL_MS = 3600;
const DWELL_MS = 1400;
const POPULAR = 250;

export async function mountHeroMap(canvas, signal) {
  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal });

  let fonts = [];
  let popular = [];
  let bounds = null;
  let base = null;
  let lights = [];
  let visible = true;
  let raf = null;

  function layout(W, H) {
    const wide = W > 860;
    const left = wide ? W * 0.56 : 0;
    const top = wide ? 40 : H * 0.42;
    const bw = bounds[2] - bounds[0];
    const bh = bounds[3] - bounds[1];
    // The bottom margin leaves room for the name under a lit glyph.
    const bottom = 44;
    const s = Math.min((W - left - 24) / bw, (H - top - bottom) / bh);
    return { s, ox: left + (W - left - bw * s) / 2 - bounds[0] * s, oy: top + (H - top - bottom - bh * s) / 2 - bounds[1] * s };
  }

  function glyph(c, f, x, y, S, dpr) {
    const g = S / 80;
    c.setTransform(dpr * g, 0, 0, dpr * g, dpr * (x - S / 2), dpr * (y - S / 2));
    c.fill(f.path);
  }

  function baseLayer(W, H, dpr, T, ink) {
    const key = `${W}x${H}@${dpr}:${ink}`;
    if (base?.key === key) return base.canvas;
    const off = document.createElement('canvas');
    off.width = Math.round(W * dpr);
    off.height = Math.round(H * dpr);
    const c = off.getContext('2d');
    c.fillStyle = ink;
    c.globalAlpha = BASE_ALPHA;
    const size = BASE * T.s * 0.95;
    for (const f of fonts) glyph(c, f, T.ox + f.x0 * T.s, T.oy + f.y0 * T.s, size, dpr);
    base = { key, canvas: off };
    return off;
  }

  // Lights travel between fonts picked at random among the most used, so the names they
  // stop on are ones readers may know.
  const pick = () => popular[Math.floor(Math.random() * popular.length)];

  function lightAt(l, time) {
    let t = (time - l.t0) / TRAVEL_MS;
    while (t >= 1 + DWELL_MS / TRAVEL_MS) {
      l.from = l.to;
      l.to = pick();
      l.t0 += TRAVEL_MS + DWELL_MS;
      t = (time - l.t0) / TRAVEL_MS;
    }
    const k = ease(Math.max(0, Math.min(1, t)));
    const end = 1 + DWELL_MS / TRAVEL_MS;
    const named = Math.max(0, Math.min(1, (t - 0.85) / 0.15, (end - t) / 0.12));
    return { x: l.from.x0 + (l.to.x0 - l.from.x0) * k, y: l.from.y0 + (l.to.y0 - l.from.y0) * k, font: l.to, named };
  }

  function draw(time) {
    raf = null;
    if (signal.aborted) return;
    const W = hero.clientWidth;
    const H = hero.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const T = layout(W, H);
    const pal = colors(hero);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseLayer(W, H, dpr, T, pal.ink), 0, 0);

    const spots = lights.map((l) => {
      const p = lightAt(l, time);
      return { ...p, x: T.ox + p.x * T.s, y: T.oy + p.y * T.s };
    });
    const size = BASE * T.s * 0.95;
    ctx.fillStyle = pal.ink;
    for (const f of fonts) {
      const x = T.ox + f.x0 * T.s;
      const y = T.oy + f.y0 * T.s;
      let t = 0;
      for (const s of spots) {
        const d = Math.hypot(x - s.x, y - s.y);
        if (d < RADIUS) t = Math.max(t, (1 - d / RADIUS) ** 2);
      }
      if (t < 0.02) continue;
      ctx.globalAlpha = t;
      glyph(ctx, f, x, y, size * (1 + GROW * t), dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "600 12px 'Source Sans Pro', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    for (const s of spots) {
      if (s.named <= 0) continue;
      ctx.globalAlpha = s.named;
      const x = T.ox + s.font.x0 * T.s;
      const y = T.oy + s.font.y0 * T.s + size * (1 + GROW) * 0.45 + 2;
      ctx.strokeStyle = pal.bg;
      ctx.strokeText(s.font.name, x, y);
      ctx.fillStyle = pal.ink;
      ctx.fillText(s.font.name, x, y);
    }
    ctx.globalAlpha = 1;

    if (visible && !still) raf = requestAnimationFrame(draw);
  }

  const wake = () => { if (!raf && fonts.length && !signal.aborted) raf = requestAnimationFrame(draw); };

  on(window, 'resize', wake);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
  observer.observe(hero);
  onThemeChange(wake, signal);
  signal.addEventListener('abort', () => {
    observer.disconnect();
    cancelAnimationFrame(raf);
  });

  const data = await loadMap({ popularity: true });
  if (signal.aborted) return;
  fonts = data.fonts;
  popular = [...fonts].sort((a, b) => b.views - a.views).slice(0, POPULAR);
  bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fonts) {
    bounds = [Math.min(bounds[0], f.x0), Math.min(bounds[1], f.y0), Math.max(bounds[2], f.x0), Math.max(bounds[3], f.y0)];
  }
  const now = performance.now();
  lights = Array.from({ length: LIGHTS }, (_, n) => {
    const from = pick();
    // Staggered so the lights never move in step.
    return { from, to: still ? from : pick(), t0: now - n * (TRAVEL_MS / 2) };
  });
  draw(now);
  canvas.classList.add('is-in');
}

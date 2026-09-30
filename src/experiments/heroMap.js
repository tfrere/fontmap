// Hero of the experiments index: the whole map in faint ink, lit up around the cursor.
// Without a pointer the light drifts on its own, unless the reader prefers reduced motion.

import { loadMap, BASE } from './engine/map';
import { colors, onThemeChange } from './engine/view';

const BASE_ALPHA = 0.14;
const RADIUS = 170;
const GROW = 0.7;
const FOLLOW = 0.12;

export async function mountHeroMap(canvas, signal) {
  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal });

  let fonts = [];
  let bounds = null;
  let pointer = null;
  let light = { x: -1e4, y: -1e4 };
  let visible = true;
  let raf = null;

  function layout(W, H) {
    const wide = W > 860;
    const left = wide ? W * 0.36 : 0;
    const top = wide ? 40 : H * 0.42;
    const bw = bounds[2] - bounds[0];
    const bh = bounds[3] - bounds[1];
    const s = Math.min((W - left - 24) / bw, (H - top - 24) / bh);
    return { s, ox: left + (W - left - bw * s) / 2 - bounds[0] * s, oy: top + (H - top - bh * s) / 2 - bounds[1] * s };
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
    const target = pointer || (still
      ? { x: -1e4, y: -1e4 }
      : { x: T.ox + (bounds[0] + bounds[2]) / 2 * T.s + Math.sin(time / 3100) * (bounds[2] - bounds[0]) * T.s * 0.38,
          y: T.oy + (bounds[1] + bounds[3]) / 2 * T.s + Math.sin(time / 1900) * (bounds[3] - bounds[1]) * T.s * 0.3 });
    light = light.x < -1e3 ? { ...target } : { x: light.x + (target.x - light.x) * FOLLOW, y: light.y + (target.y - light.y) * FOLLOW };

    const pal = colors(hero);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = pal.ink;
    const size = BASE * T.s * 0.95;
    for (const f of fonts) {
      const x = T.ox + f.x0 * T.s;
      const y = T.oy + f.y0 * T.s;
      const d = Math.hypot(x - light.x, y - light.y);
      const t = d < RADIUS ? (1 - d / RADIUS) ** 2 : 0;
      const S = size * (1 + GROW * t);
      ctx.globalAlpha = BASE_ALPHA + (1 - BASE_ALPHA) * t;
      const g = S / 80;
      ctx.setTransform(dpr * g, 0, 0, dpr * g, dpr * (x - S / 2), dpr * (y - S / 2));
      ctx.fill(f.path);
    }
    ctx.globalAlpha = 1;

    const moving = Math.abs(target.x - light.x) + Math.abs(target.y - light.y) > 0.5;
    if (visible && (moving || (!pointer && !still))) raf = requestAnimationFrame(draw);
  }

  const wake = () => { if (!raf && fonts.length && !signal.aborted) raf = requestAnimationFrame(draw); };

  on(hero, 'pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    wake();
  });
  on(hero, 'pointerleave', () => { pointer = null; wake(); });
  on(window, 'resize', wake);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
  observer.observe(hero);
  onThemeChange(() => { if (still) draw(0); else wake(); }, signal);
  signal.addEventListener('abort', () => {
    observer.disconnect();
    cancelAnimationFrame(raf);
  });

  const data = await loadMap();
  if (signal.aborted) return;
  fonts = data.fonts;
  bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fonts) {
    bounds = [Math.min(bounds[0], f.x0), Math.min(bounds[1], f.y0), Math.max(bounds[2], f.x0), Math.max(bounds[3], f.y0)];
  }
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 0.8s ease';
  draw(performance.now());
  requestAnimationFrame(() => { canvas.style.opacity = '1'; });
}

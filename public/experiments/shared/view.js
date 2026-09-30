// Canvas view shared by the experiments: frames the layout, draws glyphs and names,
// and handles zoom, pan, hover, click, theme and resize.
//
// An experiment describes each glyph through glyph(i) -> { x, y, s, alpha, dim } on the
// reference canvas (null hides it), gives the draw order and the layout bounds, and
// can paint under the glyphs (underlay) or label them.

import { lerp, ease } from './map.js';

const FIT = 0.94;
const MAX_ZOOM = 30;
const LABEL_MIN_PX = 30;

export function colors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n) => cs.getPropertyValue(n).trim();
  return { bg: get('--bg'), ink: get('--ink'), ink2: get('--ink-2'), ink3: get('--ink-3'), line: get('--line'), tint: get('--tint') };
}

// On wide screens the map is framed to the right of the panel.
export const screenInset = () => ({ left: window.innerWidth > 900 ? 332 : 0, top: 0 });

export function createView({
  canvas,
  tooltip,
  fonts,
  order,
  glyph,
  bounds,
  label = () => null,
  labelMinPx = LABEL_MIN_PX,
  describe = () => '',
  onClick = (i) => { if (fonts[i].url) window.open(fonts[i].url, '_blank', 'noopener'); },
  underlay = null,
}) {
  const ctx = canvas.getContext('2d');
  let view = { k: 1, x: 0, y: 0 };
  let hovered = -1;
  let needsDraw = false;
  let names = true;

  function baseFit(W, H, inset = screenInset()) {
    const { left = 0, top = 0 } = inset;
    const b = bounds();
    const bw = b[2] - b[0];
    const bh = b[3] - b[1];
    const s = Math.min((W - left) / bw, (H - top) / bh) * FIT;
    return { s, bx: left + (W - left - bw * s) / 2 - b[0] * s, by: top + (H - top - bh * s) / 2 - b[1] * s };
  }

  function transformFor(W, H, { v = view, inset = screenInset() } = {}) {
    const { s, bx, by } = baseFit(W, H, inset);
    return { a: s * v.k, bx: bx + s * v.x, by: by + s * v.y };
  }

  // ui scales text and the label threshold (a 4K export draws at ui = 2.4).
  function draw(c, W, H, dpr, T, { ui = 1, showNames = names, hi = -1 } = {}) {
    const pal = colors();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = pal.bg;
    c.fillRect(0, 0, W * dpr, H * dpr);
    if (underlay) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      underlay(c, T, pal, ui);
    }

    const labels = [];
    for (const i of order()) {
      const st = glyph(i);
      if (!st || st.alpha <= 0 || st.s <= 0) continue;
      const S = st.s * T.a;
      const cx = T.a * st.x + T.bx;
      const cy = T.a * st.y + T.by;
      if (cx + S < 0 || cy + S < 0 || cx - S > W || cy - S > H) continue;
      const g = S / 80;
      c.setTransform(dpr * g, 0, 0, dpr * g, dpr * (cx - S / 2), dpr * (cy - S / 2));
      c.globalAlpha = st.alpha ?? 1;
      c.fillStyle = i === hi ? pal.ink3 : st.dim ? pal.ink3 : pal.ink;
      c.fill(fonts[i].path);
      if (showNames && S >= labelMinPx * ui) {
        const text = label(i, st);
        if (text) labels.push({ text, S, cx, cy, alpha: st.alpha ?? 1 });
      }
    }
    c.globalAlpha = 1;
    if (!labels.length) return;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.lineJoin = 'round';
    const placed = [];
    for (const { text, S, cx, cy, alpha } of labels) {
      const size = Math.round(Math.max(10 * ui, Math.min(14 * ui, S * 0.16)));
      c.font = `600 ${size}px 'Source Sans Pro', sans-serif`;
      const w = c.measureText(text).width;
      const y = cy + S * 0.32;
      const box = [cx - w / 2 - 2, y - 1, cx + w / 2 + 2, y + size + 1];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      c.globalAlpha = alpha;
      c.lineWidth = Math.max(3, size * 0.35);
      c.strokeStyle = pal.bg;
      c.strokeText(text, cx, y);
      c.fillStyle = pal.ink2;
      c.fillText(text, cx, y);
    }
    c.globalAlpha = 1;
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
    draw(ctx, W, H, dpr, transformFor(W, H), { hi: hovered });
  }

  function requestDraw() {
    if (needsDraw) return;
    needsDraw = true;
    requestAnimationFrame(frame);
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

  // Topmost first: the draw order is reversed.
  function pick(px, py) {
    const T = transformFor(window.innerWidth, window.innerHeight);
    const list = order();
    for (let n = list.length - 1; n >= 0; n--) {
      const i = list[n];
      const st = glyph(i);
      if (!st || st.alpha <= 0.05 || st.s <= 0) continue;
      const S = st.s * T.a;
      const r = Math.max(4, S * 0.32);
      const dx = px - (T.a * st.x + T.bx);
      const dy = py - (T.a * st.y + T.by);
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  }

  function showTooltip(i, px, py) {
    if (i < 0) { tooltip.classList.remove('is-visible'); return; }
    tooltip.innerHTML = describe(i);
    const r = tooltip.getBoundingClientRect();
    const x = Math.min(window.innerWidth - r.width - 8, px + 14);
    const y = py + 16 + r.height > window.innerHeight ? py - r.height - 12 : py + 16;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.add('is-visible');
  }

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
    if (i >= 0) onClick(i);
  });

  canvas.addEventListener('pointerleave', () => { hovered = -1; showTooltip(-1); requestDraw(); });
  canvas.addEventListener('dblclick', () => animateView({ k: 1, x: 0, y: 0 }));
  window.addEventListener('resize', requestDraw);
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button, select')) return;
    if (e.key === '0') animateView({ k: 1, x: 0, y: 0 });
  });

  const themeButton = document.getElementById('theme');
  if (themeButton) {
    themeButton.addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme !== 'dark';
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      localStorage.setItem('fontmap-dark-mode', String(dark));
      requestDraw();
    });
  }

  return {
    requestDraw,
    draw,
    transformFor,
    baseFit,
    reset: () => animateView({ k: 1, x: 0, y: 0 }),
    setNames: (v) => { names = v; requestDraw(); },
  };
}

// Saves a 4K PNG: the whole layout under a title, with an optional footer painter.
export function exportPng(viewApi, { title, subtitle, source, filename, footer }) {
  const W = 3840;
  const H = 2160;
  const ui = W / 1600;
  const top = 280;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const c = out.getContext('2d');
  const T = viewApi.transformFor(W, H, { v: { k: 1, x: 0, y: 0 }, inset: { left: 0, top } });
  viewApi.draw(c, W, H, 1, T, { ui });

  const pal = colors();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = pal.ink;
  c.font = "700 88px 'Source Sans Pro', sans-serif";
  c.fillText(title, 120, 170);
  c.fillStyle = pal.ink2;
  c.font = "400 40px 'Source Sans Pro', sans-serif";
  c.fillText(subtitle, 120, 234);
  if (footer) footer(c, T, pal, { W, H });
  c.textAlign = 'right';
  c.fillStyle = pal.ink2;
  c.font = "400 30px 'Source Sans Pro', sans-serif";
  c.fillText(source, W - 120, H - 90);

  const a = document.createElement('a');
  a.download = filename;
  a.href = out.toDataURL('image/png');
  a.click();
}

export function hideLoader(error) {
  const loader = document.getElementById('loader');
  if (error) {
    console.error(error);
    loader.innerHTML = '<p style="font-size:14px;color:var(--ink-2)">Could not load the map data.</p>';
    return;
  }
  loader.classList.add('is-done');
}

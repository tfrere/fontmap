// Loads the FontMap layout and glyphs, plus the optional usage and catalogue data.
// Positions are on the app's reference canvas, so glyphs sit exactly where the map puts them.

export const DATA = new URL('../../data/', import.meta.url).href;
export const REF_W = 1600;
export const REF_H = 900;
export const PAD = 40;
export const BASE = 20;

function lookupPath(paths, font) {
  const key = (font.imageName || font.name || '').toLowerCase();
  return paths[`${font.id}_a`] || paths[font.id] || paths[`${key}_a`] || paths[key];
}

const getJSON = (name) => fetch(`${DATA}${name}`).then((r) => {
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
});

export async function loadMap({ popularity = false, catalog = false } = {}) {
  const [map, spriteText, usage, cat] = await Promise.all([
    getJSON('typography_data.json'),
    fetch(`${DATA}font-sprite.svg`).then((r) => r.text()),
    popularity ? getJSON('popularity.json') : null,
    catalog ? getJSON('catalog.json') : null,
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

  const fonts = map.fonts
    .map((f) => ({ f, d: lookupPath(paths, f) }))
    .filter(({ d }) => d)
    .map(({ f, d }) => {
      const font = {
        id: f.id,
        name: f.name,
        family: f.family,
        url: f.google_fonts_url,
        x0: (f.x - xMin) * s + ox,
        y0: (yMax - f.y) * s + oy,
        path: new Path2D(d),
      };
      if (usage) {
        font.hasViews = f.id in usage.views;
        font.views = usage.views[f.id] ?? 0;
      }
      if (cat) {
        const c = cat.fonts[f.id];
        font.added = c?.added ?? null;
        font.designers = c?.designers ?? [];
      }
      return font;
    });

  return {
    fonts,
    usage: usage && { range: usage.range, fetched: usage.fetched },
    catalog: cat && { fetched: cat.fetched },
  };
}

export const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const pct = (x) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

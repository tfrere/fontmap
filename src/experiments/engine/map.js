// Loads the FontMap layout and glyphs, plus the optional usage and catalogue data.
// Positions are on the app's reference canvas, so glyphs sit exactly where the map puts them.

export const REF_W = 1600;
export const REF_H = 900;
export const PAD = 40;
export const BASE = 20;

const dataUrl = (name) => new URL(`data/${name}`, document.baseURI).href;

const getJSON = (name) => fetch(dataUrl(name)).then((r) => {
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
});

function lookupPath(paths, font) {
  const key = (font.imageName || font.name || '').toLowerCase();
  return paths[`${font.id}_a`] || paths[font.id] || paths[`${key}_a`] || paths[key];
}

// Parsed once per page load: moving between experiments reuses the layout and glyphs.
let layoutPromise = null;
const extras = {};

function loadLayout() {
  if (!layoutPromise) {
    layoutPromise = Promise.all([
      getJSON('typography_data.json'),
      fetch(dataUrl('font-sprite.svg')).then((r) => r.text()),
    ]).then(([map, spriteText]) => {
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

      return map.fonts
        .map((f) => ({ f, d: lookupPath(paths, f) }))
        .filter(({ d }) => d)
        .map(({ f, d }) => ({
          id: f.id,
          name: f.name,
          family: f.family,
          url: f.google_fonts_url,
          x0: (f.x - xMin) * s + ox,
          y0: (yMax - f.y) * s + oy,
          d,
          path: new Path2D(d),
        }));
    });
    layoutPromise.catch(() => { layoutPromise = null; });
  }
  return layoutPromise;
}

function loadExtra(name) {
  if (!extras[name]) {
    extras[name] = getJSON(name);
    extras[name].catch(() => { delete extras[name]; });
  }
  return extras[name];
}

// Each call returns its own font objects, so an experiment can annotate them freely.
export async function loadMap({ popularity = false, catalog = false } = {}) {
  const [layout, usage, cat] = await Promise.all([
    loadLayout(),
    popularity ? loadExtra('popularity.json') : null,
    catalog ? loadExtra('catalog.json') : null,
  ]);

  const fonts = layout.map((base) => {
    const font = { ...base };
    if (usage) {
      font.hasViews = font.id in usage.views;
      font.views = usage.views[font.id] ?? 0;
    }
    if (cat) {
      const c = cat.fonts[font.id];
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

// Extracts from a FontMap checkout the map positions, neighbours, style tags and
// the glyph outlines the trailer needs, into assets/data.js.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTMAP = process.argv[2] || join(ROOT, '..');
const DATA = join(FONTMAP, 'public/data');

const SPRITES = {
  A: 'font-sprite.svg',
  F: 'sprites/font-sprite-upper-f.svg',
  O: 'sprites/font-sprite-upper-o.svg',
  N: 'sprites/font-sprite-upper-n.svg',
  T: 'sprites/font-sprite-upper-t.svg',
  M: 'sprites/font-sprite-upper-m.svg',
  P: 'sprites/font-sprite-upper-p.svg',
  '&': 'sprites/font-sprite-u0026.svg',
};

const { fonts } = JSON.parse(await readFile(join(DATA, 'typography_data.json'), 'utf8'));

const glyphs = {};
for (const [char, file] of Object.entries(SPRITES)) {
  const svg = await readFile(join(DATA, file), 'utf8');
  const byId = new Map();
  for (const m of svg.matchAll(/<symbol id="([^"]+?)_[^"_]+" viewBox="0 0 80 80">([\s\S]*?)<\/symbol>/g)) {
    const d = [...m[2].matchAll(/ d="([^"]+)"/g)].map((x) => x[1]).join('');
    byId.set(m[1], d);
  }
  glyphs[char] = fonts.map((f) => byId.get(f.imageName) || byId.get(f.id) || '');
  const missing = glyphs[char].filter((d) => !d).length;
  console.log(char, 'glyphs', byId.size, 'missing', missing);
}

const index = new Map(fonts.map((f, i) => [f.id, i]));
const out = {
  fonts: fonts.map((f) => ({
    id: f.id,
    name: f.name,
    x: +f.x.toFixed(1),
    y: +f.y.toFixed(1),
    style: f.style_tag,
    family: f.family,
    n: f.neighbors.map((id) => index.get(id)).filter((i) => i !== undefined),
  })),
  glyphs,
};
await writeFile(join(ROOT, 'assets/data.js'), 'window.FONTMAP_DATA=' + JSON.stringify(out) + ';\n');
console.log('fonts', out.fonts.length);

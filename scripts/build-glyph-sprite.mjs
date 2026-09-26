/**
 * build-glyph-sprite.mjs
 *
 * Builds the SVG glyph sprite(s) the map renders: one <symbol> per font shown
 * on the map, drawing a single character.
 *
 * Usage:
 *   node scripts/build-glyph-sprite.mjs [options]      (or: npm run sprite -- [options])
 *
 * Options:
 *   --char      <c>      Character to render                       (default: A)
 *   --chars     <list>   Several characters at once: literal chars and/or
 *                        ranges, comma-separated, e.g. "a-z,A-Z,0-9" or "gQ&"
 *   --data      <path>   Map data; fonts[].id are the shown fonts
 *                        (default: public/data/typography_data.json)
 *   --fonts-dir <path>   One sub-directory per font id holding the font file
 *                        (default: pipeline/output/fonts)
 *   --out       <path>   Output file (single char only; default: see naming)
 *   --precision <n>      Decimals kept in path coordinates          (default: 1)
 *   --index-only         Only rewrite public/data/sprites/index.json
 *
 * After each run, public/data/sprites/index.json is rewritten from the sprite
 * files on disk (char, name = symbol id suffix, file, count, bytes) for the
 * app's glyph switcher.
 *
 * Naming (safe on case-insensitive filesystems):
 *   A        -> public/data/font-sprite.svg, symbol ids "<font-id>_a" (what the app loads)
 *   a..z     -> public/data/sprites/font-sprite-lower-<c>.svg, ids "<font-id>_lower-<c>"
 *   A..Z     -> public/data/sprites/font-sprite-upper-<c>.svg, ids "<font-id>_upper-<c>"
 *   0..9     -> public/data/sprites/font-sprite-digit-<d>.svg, ids "<font-id>_digit-<d>"
 *   other    -> public/data/sprites/font-sprite-u<HEX4>.svg,   ids "<font-id>_u<HEX4>"
 *
 * Normalisation (matches the original sprite): glyph drawn at 60px font size,
 * its bounding box centred in an 80x80 viewBox, no clamping.
 * When a font lacks the character, the other case is used (a <-> A); if that
 * is missing too the font is skipped and reported.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { gzipSync } from 'zlib';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWBOX = 80;
const FONT_SIZE = 60;

function parseArgs(argv) {
  const opts = {
    chars: null,
    data: 'public/data/typography_data.json',
    fontsDir: 'pipeline/output/fonts',
    out: null,
    precision: 1,
    indexOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--char': opts.chars = [...val]; i++; break;
      case '--chars': opts.chars = expandChars(val); i++; break;
      case '--data': opts.data = val; i++; break;
      case '--fonts-dir': opts.fontsDir = val; i++; break;
      case '--out': opts.out = val; i++; break;
      case '--precision': opts.precision = Number(val); i++; break;
      case '--index-only': opts.indexOnly = true; break;
      default: throw new Error(`Unknown option: ${key}`);
    }
  }
  if (!opts.chars || opts.chars.length === 0) opts.chars = ['A'];
  if (opts.out && opts.chars.length > 1) throw new Error('--out only works with a single character');
  return opts;
}

function expandChars(spec) {
  const out = [];
  for (const token of spec.split(',')) {
    const cps = [...token];
    if (cps.length === 3 && cps[1] === '-') {
      for (let c = cps[0].codePointAt(0); c <= cps[2].codePointAt(0); c++) out.push(String.fromCodePoint(c));
    } else {
      out.push(...cps);
    }
  }
  return [...new Set(out)];
}

function charName(ch) {
  if (/^[a-z]$/.test(ch)) return `lower-${ch}`;
  if (/^[A-Z]$/.test(ch)) return `upper-${ch.toLowerCase()}`;
  if (/^[0-9]$/.test(ch)) return `digit-${ch}`;
  return `u${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

function targetFor(ch) {
  if (ch === 'A') return { file: 'public/data/font-sprite.svg', suffix: 'a' };
  const name = charName(ch);
  return { file: `public/data/sprites/font-sprite-${name}.svg`, suffix: name };
}

function loadFont(dir) {
  const files = readdirSync(dir);
  const pick = files.find(f => /-400-normal-latin\.truetype$/.test(f))
    || files.find(f => f.endsWith('.truetype'))
    || files.find(f => f.endsWith('.ttf') || f.endsWith('.otf') || f.endsWith('.woff'));
  if (!pick) return null;
  const buf = readFileSync(join(dir, pick));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function resolveGlyph(font, ch) {
  const candidates = [ch];
  const other = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
  if (other !== ch) candidates.push(other);
  for (const c of candidates) {
    const glyph = font.charToGlyph(c);
    if (glyph && glyph.index !== 0 && glyph.path.commands.length > 0) return { glyph, usedChar: c };
  }
  return null;
}

/** Glyph path in viewBox units, bbox-centred, as integer multiples of 10^-precision. */
function glyphCommands(glyph, scale) {
  const bbox = glyph.getPath(0, 0, FONT_SIZE).getBoundingBox();
  const x = VIEWBOX / 2 - (bbox.x1 + bbox.x2) / 2;
  const y = VIEWBOX / 2 - (bbox.y1 + bbox.y2) / 2;
  const q = v => Math.round(v * scale);
  return glyph.getPath(x, y, FONT_SIZE).commands.map(c => ({
    type: c.type,
    x: c.x === undefined ? undefined : q(c.x),
    y: c.y === undefined ? undefined : q(c.y),
    x1: c.x1 === undefined ? undefined : q(c.x1),
    y1: c.y1 === undefined ? undefined : q(c.y1),
    x2: c.x2 === undefined ? undefined : q(c.x2),
    y2: c.y2 === undefined ? undefined : q(c.y2),
  }));
}

/**
 * Converts absolute quantised commands into compact relative segments:
 * drops zero-length / degenerate segments and the closing line before Z,
 * uses h/v/t/s shorthands. Working on integers keeps relative deltas exact.
 */
function toSegments(cmds) {
  const contours = [];
  let cur = null;
  let cx = 0, cy = 0;
  let sx = 0, sy = 0;
  let prevCtrl = null; // { kind: 'Q' | 'C', x, y } reflected-control source

  const closeContour = () => {
    if (!cur) return;
    const last = cur.segs[cur.segs.length - 1];
    if (cur.closed && last && last.line && last.ex === sx && last.ey === sy) cur.segs.pop();
    if (cur.segs.length > 0) contours.push(cur);
    cur = null;
  };

  for (const c of cmds) {
    if (c.type === 'M') {
      closeContour();
      cur = { mx: c.x, my: c.y, segs: [] };
      cx = sx = c.x; cy = sy = c.y;
      prevCtrl = null;
    } else if (c.type === 'Z') {
      if (cur) cur.closed = true;
      closeContour();
      cx = sx; cy = sy;
      prevCtrl = null;
    } else if (c.type === 'L') {
      if (c.x === cx && c.y === cy) continue;
      cur.segs.push({ line: true, ex: c.x, ey: c.y });
      cx = c.x; cy = c.y;
      prevCtrl = null;
    } else if (c.type === 'Q') {
      if (c.x === cx && c.y === cy && c.x1 === cx && c.y1 === cy) continue;
      const smooth = prevCtrl && prevCtrl.kind === 'Q'
        && c.x1 === 2 * cx - prevCtrl.x && c.y1 === 2 * cy - prevCtrl.y;
      cur.segs.push({ q: true, smooth, x1: c.x1, y1: c.y1, ex: c.x, ey: c.y });
      prevCtrl = { kind: 'Q', x: c.x1, y: c.y1 };
      cx = c.x; cy = c.y;
    } else if (c.type === 'C') {
      if (c.x === cx && c.y === cy && c.x1 === cx && c.y1 === cy && c.x2 === cx && c.y2 === cy) continue;
      const smooth = prevCtrl && prevCtrl.kind === 'C'
        && c.x1 === 2 * cx - prevCtrl.x && c.y1 === 2 * cy - prevCtrl.y;
      cur.segs.push({ c: true, smooth, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, ex: c.x, ey: c.y });
      prevCtrl = { kind: 'C', x: c.x2, y: c.y2 };
      cx = c.x; cy = c.y;
    }
  }
  closeContour();
  return contours;
}

function serialize(contours, precision) {
  const div = 10 ** precision;
  const num = v => {
    let s = String(+(v / div).toFixed(precision));
    if (s.startsWith('0.')) s = s.slice(1);
    else if (s.startsWith('-0.')) s = '-' + s.slice(2);
    return s;
  };

  let out = '';
  let lastCmd = '';
  let lastNum = null; // previous number string, null right after a command letter
  const emit = (cmd, values) => {
    if (cmd !== lastCmd || cmd === 'm') {
      out += cmd;
      lastCmd = cmd === 'm' ? 'l' : cmd; // implicit command after moveto is lineto
      lastNum = null;
    }
    for (const v of values) {
      const s = num(v);
      if (lastNum !== null && !(s[0] === '-' || (s[0] === '.' && lastNum.includes('.')))) out += ' ';
      out += s;
      lastNum = s;
    }
  };

  let px = 0, py = 0;
  for (const ct of contours) {
    emit('m', [ct.mx - px, ct.my - py]);
    let cx = ct.mx, cy = ct.my;
    for (const s of ct.segs) {
      const dx = s.ex - cx, dy = s.ey - cy;
      if (s.line) {
        if (dy === 0) emit('h', [dx]);
        else if (dx === 0) emit('v', [dy]);
        else emit('l', [dx, dy]);
      } else if (s.q) {
        if (s.smooth) emit('t', [dx, dy]);
        else emit('q', [s.x1 - cx, s.y1 - cy, dx, dy]);
      } else if (s.smooth) {
        emit('s', [s.x2 - cx, s.y2 - cy, dx, dy]);
      } else {
        emit('c', [s.x1 - cx, s.y1 - cy, s.x2 - cx, s.y2 - cy, dx, dy]);
      }
      cx = s.ex; cy = s.ey;
    }
    if (ct.closed) {
      out += 'z';
      lastCmd = 'z';
      lastNum = null;
    }
    px = ct.mx; py = ct.my;
    if (!ct.closed) { px = cx; py = cy; }
  }
  return out;
}

function buildSprite(ch, fontIds, opts) {
  const scale = 10 ** opts.precision;
  const { suffix } = targetFor(ch);
  const symbols = [];
  const fallbacks = [];
  const skipped = [];

  for (const id of fontIds) {
    const dir = resolve(ROOT, opts.fontsDir, id);
    const font = existsSync(dir) ? loadFont(dir) : null;
    if (!font) { skipped.push(`${id} (no font file)`); continue; }
    const hit = resolveGlyph(font, ch);
    if (!hit) { skipped.push(`${id} (no glyph)`); continue; }
    if (hit.usedChar !== ch) fallbacks.push(id);
    const d = serialize(toSegments(glyphCommands(hit.glyph, scale)), opts.precision);
    symbols.push(`<symbol id="${id}_${suffix}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}"><path d="${d}"/></symbol>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n`
    + `<!-- U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} "${ch}" - generated by scripts/build-glyph-sprite.mjs -->\n`
    + symbols.join('\n') + '\n</svg>\n';
  return { svg, count: symbols.length, fallbacks, skipped };
}

function charFromName(name) {
  let m;
  if ((m = /^lower-([a-z])$/.exec(name))) return m[1];
  if ((m = /^upper-([a-z])$/.exec(name))) return m[1].toUpperCase();
  if ((m = /^digit-([0-9])$/.exec(name))) return m[1];
  if ((m = /^u([0-9A-F]{4,6})$/.exec(name))) return String.fromCodePoint(parseInt(m[1], 16));
  return null;
}

const INDEX_FILE = 'public/data/sprites/index.json';

/** Rewrites the sprite index from the sprite files present on disk. */
function writeIndex() {
  const countSymbols = file => (readFileSync(resolve(ROOT, file), 'utf8').match(/<symbol /g) || []).length;
  // Uncompressed size: lets the app show real download progress even when
  // the server gzips the sprite (Content-Length is then the compressed size)
  const byteSize = file => statSync(resolve(ROOT, file)).size;
  const entries = [];
  const aFile = targetFor('A').file;
  if (existsSync(resolve(ROOT, aFile))) {
    entries.push({ char: 'A', name: 'a', file: aFile.replace(/^public/, ''), count: countSymbols(aFile), bytes: byteSize(aFile) });
  }
  const dir = resolve(ROOT, 'public/data/sprites');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = /^font-sprite-(.+)\.svg$/.exec(f);
      const ch = m && charFromName(m[1]);
      if (!ch) continue;
      const file = `public/data/sprites/${f}`;
      entries.push({ char: ch, name: m[1], file: file.replace(/^public/, ''), count: countSymbols(file), bytes: byteSize(file) });
    }
  }
  const rank = ch => (/[a-z]/.test(ch) ? 0 : /[A-Z]/.test(ch) ? 1 : /[0-9]/.test(ch) ? 2 : 3);
  entries.sort((a, b) => rank(a.char) - rank(b.char) || a.char.codePointAt(0) - b.char.codePointAt(0));
  mkdirSync(dirname(resolve(ROOT, INDEX_FILE)), { recursive: true });
  writeFileSync(resolve(ROOT, INDEX_FILE), JSON.stringify({ glyphs: entries }, null, 2) + '\n');
  console.log(`index -> ${INDEX_FILE}: ${entries.length} glyphs`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.indexOnly) { writeIndex(); return; }
  const data = JSON.parse(readFileSync(resolve(ROOT, opts.data), 'utf8'));
  const fontIds = [...new Set(data.fonts.map(f => f.id))].sort();
  console.log(`${fontIds.length} fonts from ${opts.data}`);

  for (const ch of opts.chars) {
    const file = resolve(ROOT, opts.out || targetFor(ch).file);
    const { svg, count, fallbacks, skipped } = buildSprite(ch, fontIds, opts);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, svg);
    const raw = Buffer.byteLength(svg);
    const gz = gzipSync(svg, { level: 9 }).length;
    console.log(`"${ch}" -> ${file.replace(ROOT + '/', '')}: ${count} symbols, `
      + `${(raw / 1024).toFixed(0)} KB raw / ${(gz / 1024).toFixed(0)} KB gzip`);
    if (fallbacks.length) console.log(`  other-case fallback (${fallbacks.length}): ${fallbacks.join(', ')}`);
    if (skipped.length) console.log(`  skipped (${skipped.length}): ${skipped.join(', ')}`);
  }
  writeIndex();
}

main();

// Sets the end-card wordmark in Playfair Display with its real outlines and kerning
// and writes the path plus vertical metrics (in font units, baseline at y = 0) to assets/logo.js.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORD = 'FontMap';
const font = opentype.loadSync(join(ROOT, 'assets/ttf/playfair-display.ttf'));
const upm = font.unitsPerEm;
const path = font.getPath(WORD, 0, 0, upm, { kerning: true });
const box = path.getBoundingBox();
const os2 = font.tables.os2;

const logo = {
  word: WORD,
  d: path.toPathData(2),
  upm,
  width: box.x2 - box.x1,
  left: box.x1,
  capHeight: os2.sCapHeight,
  xHeight: os2.sxHeight,
  ascender: font.ascender,
  descender: font.descender,
};
await writeFile(join(ROOT, 'assets/logo.js'), 'window.LOGO=' + JSON.stringify(logo) + ';\n');
console.log(WORD, 'width', logo.width, 'cap', logo.capHeight, 'x', logo.xHeight);

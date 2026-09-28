// Downloads the latin woff2 subset of each Google Font used by the trailer text.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export const FONTS = [
  { id: 'playfair-display', family: 'Playfair Display', axes: 'ital,wght@0,400;1,400' },
  { id: 'source-sans-3', family: 'Source Sans 3', axes: 'wght@400;600' },
  { id: 'bebas-neue', family: 'Bebas Neue' },
  { id: 'pacifico', family: 'Pacifico' },
  { id: 'space-mono', family: 'Space Mono' },
  { id: 'unifrakturmaguntia', family: 'UnifrakturMaguntia' },
  { id: 'press-start-2p', family: 'Press Start 2P' },
  { id: 'abril-fatface', family: 'Abril Fatface' },
  { id: 'great-vibes', family: 'Great Vibes' },
  { id: 'monoton', family: 'Monoton' },
  { id: 'libre-franklin', family: 'Libre Franklin', axes: 'wght@800' },
  { id: 'roboto-slab', family: 'Roboto Slab', axes: 'wght@700' },
  { id: 'stardos-stencil', family: 'Stardos Stencil', axes: 'wght@700' },
];

await mkdir(OUT, { recursive: true });
const faces = [];
for (const f of FONTS) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}${f.axes ? ':' + f.axes : ''}&display=block`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const blocks = css.split('/* ').filter((b) => b.startsWith('latin */'));
  if (!blocks.length) throw new Error(`No latin subset for ${f.family}`);
  for (const b of blocks) {
    const style = /font-style:\s*(\w+)/.exec(b)[1];
    const weight = /font-weight:\s*(\d+)/.exec(b)[1];
    const src = /url\((https:[^)]+\.woff2)\)/.exec(b)[1];
    const file = `${f.id}-${weight}${style === 'italic' ? 'i' : ''}.woff2`;
    await writeFile(join(OUT, file), Buffer.from(await (await fetch(src)).arrayBuffer()));
    faces.push(`@font-face{font-family:'${f.family}';font-style:${style};font-weight:${weight};font-display:block;src:url(fonts/${file}) format('woff2');}`);
    console.log('ok', file);
  }
}
await writeFile(join(ROOT, 'assets/fonts.css'), faces.join('\n') + '\n');

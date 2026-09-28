// Drives the live FontMap app in headless Chrome and captures the states shown in
// the product section of the trailer, plus the on-screen position of every glyph
// so the trailer's map can land exactly on the app's.
//   node scripts/capture-app.mjs [url]  -> assets/app/*.jpg + assets/app.js (positions, clicks, screenshots)
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.argv[2] || 'https://tfrere-font-map.static.hf.space/';
const OUT = join(ROOT, 'assets/app');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/local/bin/google-chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await wait(2500);
for (const b of await page.$$('button')) {
  if ((await b.evaluate((e) => e.textContent.trim())) === 'Start exploring') { await b.click(); break; }
}
await wait(1500);
await page.mouse.move(1000, 22);

const shot = async (name) => { await wait(700); await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 88 }); console.log('shot', name); };
const centerOf = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; });

// Screen-space centre and size of every glyph on the untouched map.
const glyphs = await page.evaluate(() => {
  const out = {};
  for (const g of document.querySelectorAll('.viewport-group g[data-font-id]')) {
    const r = g.querySelector('path').getBoundingClientRect();
    const box = g.querySelector('.glyph-hitbox').getBoundingClientRect();
    out[g.dataset.fontId] = [+(box.x + box.width / 2).toFixed(1), +(box.y + box.height / 2).toFixed(1), +(box.width * 80 / 88).toFixed(2)];
  }
  return out;
});
await shot('01-map');

const search = await centerOf('input');
await page.click('input');
await page.keyboard.type('script', { delay: 40 });
await wait(1200);
await shot('02-search');
await page.click('input', { clickCount: 3 });
await page.keyboard.press('Backspace');
await page.keyboard.press('Escape');
await wait(1200);

const pick = await page.$eval('.viewport-group g[data-font-id="playfair-display"] .glyph-hitbox', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; });
await page.mouse.click(pick[0], pick[1]);
await wait(1800);
// From here on, hovering the map must not pop tooltips into the captures.
await page.addStyleTag({ content: '.glyph-hitbox { pointer-events: none !important; }' });
await page.mouse.move(1000, 22);
await shot('03-font');

await page.keyboard.type('&');
await wait(1800);
await shot('04-glyph');

const dark = await centerOf('.dark-mode-toggle');
await page.click('.dark-mode-toggle');
await page.mouse.move(1000, 22);
await wait(1500);
await shot('05-dark');

// Screenshots are embedded as data URLs so the canvas never gets tainted by file:// images.
const shots = {};
for (const name of ['01-map', '02-search', '03-font', '04-glyph', '05-dark']) {
  shots[name] = 'data:image/jpeg;base64,' + (await readFile(join(OUT, `${name}.jpg`))).toString('base64');
}
await writeFile(join(ROOT, 'assets/app.js'), 'window.APP=' + JSON.stringify({ glyphs, clicks: { search, pick, dark }, shots }) + ';\n');
console.log('glyphs', Object.keys(glyphs).length, 'clicks', { search, pick, dark });
await browser.close();

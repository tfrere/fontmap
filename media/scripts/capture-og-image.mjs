// Captures 1200x630 social-preview candidates (intro hero + bare map) from a served build.
// Usage: serve build/ on :4173, then `node media/scripts/capture-og-image.mjs`.
import { chromium } from '/Users/thibaudfrere/Documents/work-projects/huggingface/research-article-template/app/node_modules/playwright/index.mjs';

const URL = process.env.OG_URL || 'http://localhost:4173/index.html';
const OUT_DIR = process.env.OG_OUT || '/tmp/fontmap-og';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem('fontmap-dark-mode', 'false'));
const page = await context.newPage();

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelectorAll('g.glyph-group').length > 500, null, { timeout: 180000 });
await page.locator('.intro-start-button').waitFor({ state: 'visible' });
await page.mouse.move(1, 1);
await sleep(2500);
await page.screenshot({ path: `${OUT_DIR}/intro.png` });

await page.locator('.intro-start-button').click();
await page.mouse.move(1, 1);
await sleep(2000);
await page.screenshot({ path: `${OUT_DIR}/map.png` });

await page.locator('.category-legend-toggle').click();
await page.mouse.move(1, 1);
await sleep(1500);
await page.screenshot({ path: `${OUT_DIR}/map-colors.png` });

// Bare colored map at 2x for the composed card (media/scripts/make-og-image.py)
const bare = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 2 });
await bare.addInitScript(() => localStorage.setItem('fontmap-dark-mode', 'false'));
const map = await bare.newPage();
await map.goto(URL, { waitUntil: 'domcontentloaded' });
await map.waitForFunction(() => document.querySelectorAll('g.glyph-group').length > 500, null, { timeout: 180000 });
await map.locator('.intro-start-button').click();
await map.locator('.category-legend-toggle').click();
await map.addStyleTag({ content: '.sidebar, .bottom-controls, .zoom-controls, .map-title { display: none !important; }' });
await map.evaluate(() => window.dispatchEvent(new Event('resize')));
await map.mouse.move(1, 1);
await sleep(2500);
await map.screenshot({ path: `${OUT_DIR}/map-bare.png` });

await browser.close();

// Demo recorder for the FontMap v2 update (longer clip showing the new features).
// Scenario: intro hero -> zoom + glyph switcher -> open a font -> arrow hops -> custom
// preview text while hopping -> style search -> category colors -> How it works.
// Output: raw webm in /tmp/fontmap-demo-video-v2/, trim timestamp logged for ffmpeg.
import { chromium } from '/Users/thibaudfrere/Documents/work-projects/huggingface/research-article-template/app/node_modules/playwright/index.mjs';

const URL = process.env.DEMO_URL || 'http://localhost:4173/index.html';
const VIDEO_DIR = '/tmp/fontmap-demo-video-v2';
const W = 1280;
const H = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
});
await context.addInitScript(() => localStorage.setItem('fontmap-dark-mode', 'false'));
const page = await context.newPage();

// Fake cursor dot so viewers can follow the pointer in the recording
await page.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;width:14px;height:14px;border-radius:50%;background:rgba(0,0,0,.55);' +
      'border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.4);' +
      'pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);left:-40px;top:-40px;' +
      'opacity:0;transition:width .12s,height .12s,opacity .15s';
    document.body.appendChild(dot);
    // Cursor parked in the top-left corner (x<6,y<6) hides the dot
    window.addEventListener('mousemove', (e) => {
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
      dot.style.opacity = (e.clientX < 6 && e.clientY < 6) ? '0' : '1';
    }, true);
    window.addEventListener('mousedown', () => { dot.style.width = '22px'; dot.style.height = '22px'; }, true);
    window.addEventListener('mouseup', () => { dot.style.width = '14px'; dot.style.height = '14px'; }, true);
  });
});

const center = async (locator) => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const clickOn = async (locator, steps = 18) => {
  const { x, y } = await center(locator);
  await page.mouse.move(x, y, { steps });
  await sleep(200);
  await page.mouse.click(x, y);
};
const mark = (label) => console.log(`MARK ${label}=${((Date.now() - t0) / 1000).toFixed(2)}`);
const hop = async (keys, delay) => {
  for (const key of keys) {
    await page.keyboard.press(key);
    await sleep(delay);
  }
};

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelectorAll('g.glyph-group').length > 500, null, { timeout: 180000 });
await page.locator('.intro-start-button').waitFor({ state: 'visible' });
await page.mouse.move(2, 2);
await sleep(1200);
const trimAt = (Date.now() - t0) / 1000;
console.log(`TRIM_AT=${trimAt.toFixed(2)}`);

// 1) Intro hero: let the marquee run, then start exploring
await sleep(2200);
await clickOn(page.locator('.intro-start-button'), 22);
await page.locator('.intro-modal').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
await page.mouse.move(2, 2);
await sleep(700);

// 2) Zoom into a cluster, switch glyphs, open a font
const zx = W * 0.62;
const zy = H * 0.5;
for (let i = 0; i < 10; i++) {
  await page.evaluate(({ x, y }) => {
    const svg = document.querySelector('.viewport-group')?.closest('svg');
    svg?.dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, deltaY: -120, deltaMode: 0, bubbles: true, cancelable: true }));
  }, { x: zx, y: zy });
  await sleep(70);
}
await sleep(700);

// Glyph switcher: type a letter or & to redraw the whole map
mark('glyph');
await page.keyboard.press('g');
await sleep(1700);
await page.keyboard.press('&');
await sleep(1700);
await page.keyboard.press('Shift+A');
await sleep(1100);
const target = await page.evaluate(([w, h, tx, ty]) => {
  let best = null;
  let bestD = Infinity;
  document.querySelectorAll('g.glyph-group').forEach((g) => {
    const r = g.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (cx < w * 0.4 || cx > w * 0.8 || cy < h * 0.3 || cy > h * 0.7) return;
    const d = Math.hypot(cx - tx, cy - ty);
    if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
  });
  return best;
}, [W, H, zx, zy]);
await page.mouse.move(target.x, target.y, { steps: 15 });
await sleep(250);
await page.mouse.click(target.x, target.y);
await sleep(1400);

// 3) Arrow-key hops to nearest neighbours
mark('open');
await hop(['ArrowRight', 'ArrowDown'], 700);
await sleep(400);

// 4) Custom preview text, then keep hopping: every font renders the sentence
const preview = page.locator('.preview-text-input');
await clickOn(preview, 20);
await sleep(300);
await page.keyboard.type('Sphinx of black quartz', { delay: 75 });
await sleep(900);
await page.keyboard.press('Enter');
await page.mouse.move(W - 40, H * 0.35, { steps: 12 });
await sleep(600);
mark('text');
await hop(['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowRight'], 1500);
await sleep(400);

// 5) Style search: Esc resets the view, then find a Google sub-style
await page.keyboard.press('Escape');
await sleep(1300);
mark('search');
await clickOn(page.locator('.search-input'), 22);
await sleep(250);
await page.keyboard.type('didone', { delay: 110 });
await sleep(900);
await clickOn(page.locator('.search-option').first(), 12);
await page.mouse.move(W - 40, H * 0.5, { steps: 14 });
await sleep(700);
mark('style');
await sleep(1700);
await clickOn(page.locator('.search-style-chip-remove'), 16);
await sleep(700);

// 6) Category colors
mark('colors');
await clickOn(page.locator('.category-legend-toggle'), 22);
await sleep(2200);
await clickOn(page.locator('.category-legend-toggle'), 6);
await sleep(600);

// 7) How it works page, scroll through the first steps
await clickOn(page.locator('.about-link'), 24);
mark('hiw');
await sleep(1500);
await page.mouse.move(W * 0.5, H * 0.6, { steps: 12 });
for (let i = 0; i < 24; i++) {
  await page.mouse.wheel(0, 90);
  await sleep(90);
}
await sleep(2000);

await context.close();
console.log(`VIDEO=${await page.video().path()}`);
await browser.close();

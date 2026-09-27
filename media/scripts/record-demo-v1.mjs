// One-shot demo recorder for the FontMap Reddit launch.
// Scenario: overview -> wheel zoom into a cluster -> click a font (drawer) -> arrow-key hops -> reset.
// Output: raw webm in /tmp/fontmap-demo-video/, trim timestamp logged for ffmpeg.
import { chromium } from '/Users/thibaudfrere/Documents/work-projects/huggingface/research-article-template/app/node_modules/playwright/index.mjs';

const URL = process.env.DEMO_URL || 'http://localhost:4173/index.html';
const VIDEO_DIR = '/tmp/fontmap-demo-video';
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
    // Park the cursor in the top-left corner (x<6,y<6) to hide the dot: keeps
    // the opening/closing overview frames clean (no stray pointer, no tooltip).
    window.addEventListener('mousemove', (e) => {
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
      dot.style.opacity = (e.clientX < 6 && e.clientY < 6) ? '0' : '1';
    }, true);
    window.addEventListener('mousedown', () => { dot.style.width = '22px'; dot.style.height = '22px'; }, true);
    window.addEventListener('mouseup', () => { dot.style.width = '14px'; dot.style.height = '14px'; }, true);
  });
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded' });

// Wait for the map to be fully rendered behind the intro modal
await page.waitForFunction(
  () => document.querySelectorAll('g.glyph-group').length > 500,
  null,
  { timeout: 180000 }
);
await sleep(1500);

// Dismiss the intro modal BEFORE the useful footage starts, and wait for it
// to be fully gone, so the clip opens on a clean overview and loops perfectly
// (no tutorial modal flashing at the start of the loop).
const startBtn = page.locator('.intro-start-button');
await startBtn.click();
await page.locator('.intro-modal').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
// The mouse is at the (centered) button after the click, sitting over a glyph.
// Park it in the hidden top-left corner right away so the opening frame has no
// stray "poly" tooltip and no visible cursor.
await page.mouse.move(2, 2);
await sleep(450);
const trimAt = (Date.now() - t0) / 1000;
console.log(`TRIM_AT=${trimAt.toFixed(2)}`);

// 1) Overview beat - cursor stays parked (hidden) in the corner. The zoom uses
//    synthetic wheel events, so the mouse never needs to enter the map here.
await sleep(300);

// 2) Zoom into the LEFT clusters (handwriting + serif = more distinctive
//    glyphs, more representative). We dispatch synthetic wheel events at the
//    left point instead of moving the mouse there, so the real cursor stays
//    parked in the empty margin and never hovers a family mid-zoom.
const zx = W * 0.47;
const zy = H * 0.55;
for (let i = 0; i < 11; i++) {
  await page.evaluate(({ x, y }) => {
    const g = document.querySelector('.viewport-group');
    const svg = g && g.closest('svg');
    if (!svg) return;
    svg.dispatchEvent(new WheelEvent('wheel', {
      clientX: x, clientY: y, deltaY: -120, deltaMode: 0,
      bubbles: true, cancelable: true,
    }));
  }, { x: zx, y: zy });
  await sleep(70);
}
await sleep(450);

// 3) Click the glyph nearest the zoom point (left cluster) -> tooltip + drawer.
//    The mouse only moves now, in one quick sweep, so no glyph gets a settled
//    hover before we land on the target.
const target = await page.evaluate(([w, h, tx, ty]) => {
  let best = null;
  let bestD = Infinity;
  document.querySelectorAll('g.glyph-group').forEach((g) => {
    const r = g.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    // Keep away from edges so the tooltip stays in frame
    if (cx < w * 0.28 || cx > w * 0.72 || cy < h * 0.28 || cy > h * 0.72) return;
    const d = Math.hypot(cx - tx, cy - ty);
    if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
  });
  return best;
}, [W, H, zx, zy]);

if (target) {
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await sleep(250);
  await page.mouse.click(target.x, target.y);
} else {
  console.log('WARN: no glyph found near zoom point, clicking there');
  await page.mouse.click(zx, zy);
}
await sleep(650);

// 4) Arrow-key hops to nearest neighbors - snappier and more of them, roaming
//    around the cluster (mixed directions) to show the neighbor navigation.
const hops = ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
for (const key of hops) {
  await page.keyboard.press(key);
  await sleep(430);
}
await sleep(250);

// 5) Defocus first (Escape): release the selected glyph, the map un-dims at
//    the current zoom - the logical "I'm done with this font" beat...
await page.keyboard.press('Escape');
await sleep(450);

// Hide the cursor again (park in the corner) so the closing overview matches
// the opening one exactly - clean loop with no pointer in either end frame.
await page.mouse.move(2, 2);

// ...then dezoom back to the overview, where the family labels fade back in,
//    returning to the exact initial state so the clip loops seamlessly.
await page.evaluate(() => window.resetZoom && window.resetZoom());
await sleep(1050);

await context.close();
const video = await page.video().path();
console.log(`VIDEO=${video}`);
await browser.close();

// Headless renderer.
//   node scripts/render.mjs contact            -> out/contact-sheet.png (one frame per beat)
//   node scripts/render.mjs stills 4.1,9.3     -> out/still-<t>.png
//   node scripts/render.mjs audio              -> out/score.wav
//   node scripts/render.mjs video [samples]    -> out/fontmap-trailer.mp4 (60 fps, motion blur)
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const [mode = 'contact', arg] = process.argv.slice(2);
const FPS = 60;

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--hide-scrollbars'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(pathToFileURL(join(ROOT, 'index.html')).href + '?render', { waitUntil: 'load' });
await page.evaluate(() => window.__trailer.ready);
const duration = await page.evaluate(() => window.__trailer.duration);
const fromDataURL = (u) => Buffer.from(u.split(',')[1], 'base64');

async function renderAudio() {
  const b64 = await page.evaluate(() => window.__trailer.audioWavBase64());
  const file = join(OUT, 'score.wav');
  await writeFile(file, Buffer.from(b64, 'base64'));
  console.log('wrote', file);
  return file;
}

if (mode === 'contact') {
  const beat = 60 / 128;
  const times = Array.from({ length: Math.round(duration / beat) }, (_, i) => (i + 0.6) * beat);
  const url = await page.evaluate((ts) => window.__trailer.contactSheet(ts), times);
  await writeFile(join(OUT, 'contact-sheet.png'), fromDataURL(url));
  console.log('wrote out/contact-sheet.png');
} else if (mode === 'stills') {
  for (const t of (arg || '1').split(',').map(Number)) {
    const url = await page.evaluate((x) => window.__trailer.still(x), t);
    await writeFile(join(OUT, `still-${t.toFixed(2)}.png`), fromDataURL(url));
    console.log('wrote still', t);
  }
} else if (mode === 'audio') {
  await renderAudio();
} else if (mode === 'video') {
  const samples = +(arg || 6);
  const wav = await renderAudio();
  const file = join(OUT, 'fontmap-trailer.mp4');
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '320k', '-shortest', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(duration * FPS);
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const url = await page.evaluate((fr, fps, s) => { window.__trailer.renderFrame(fr, fps, s); return window.__trailer.frameDataURL(); }, f, FPS, samples);
    if (!ff.stdin.write(fromDataURL(url))) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
  console.log('wrote', file);
}
await browser.close();

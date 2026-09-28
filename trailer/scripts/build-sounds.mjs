// Cuts the CC0 typewriter recordings in assets/sounds/src into short clips and
// embeds them as base64 WAV in assets/sounds.js.
//   key-*: single keystrokes (BigSoundBank #1065, Freesound 652588 and 785412)
//   bell: margin bell (Freesound 345955)
//   ret: carriage return ending on its clunk (Freesound 318686)
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/sounds/src');
const SR = 48000;

function pcm(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', join(SRC, file), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function onsets(data, threshold = 0.25, gap = 0.06) {
  const hop = 240;
  const env = [];
  for (let i = 0; i + hop < data.length; i += hop) {
    let m = 0;
    for (let j = i; j < i + hop; j++) m = Math.max(m, Math.abs(data[j]));
    env.push(m);
  }
  const peak = Math.max(...env);
  const out = [];
  let last = -1;
  env.forEach((e, i) => {
    const t = (i * hop) / SR;
    if (e > peak * threshold && (i === 0 || env[i - 1] <= peak * threshold) && t - last > gap) { out.push(t); last = t; }
  });
  return out;
}

function clip(data, start, dur, fade = 0.05) {
  const a = Math.max(0, Math.round((start - 0.004) * SR));
  const n = Math.min(Math.round(dur * SR), data.length - a);
  const out = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[a + i]));
  const f = Math.round(fade * SR);
  for (let i = 0; i < n; i++) out[i] = (data[a + i] / peak) * 0.9 * Math.min(1, (n - i) / f, (i + 1) / 24);
  return out;
}

function wavBase64(samples) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return out.toString('base64');
}

const typing = pcm('typing-bigsoundbank.wav');
const keys = onsets(typing).filter((t) => t < 14).slice(0, 14).map((t) => clip(typing, t, 0.22));
for (const [file, at] of [['key-vishwajay.mp3', null], ['key-bubblegump.mp3', null]]) {
  const d = pcm(file);
  const o = onsets(d, 0.6);
  keys.push(clip(d, at ?? o[0], 0.25));
}

const bell = clip(pcm('bell-carriage-knufds.mp3'), 0.004, 1.3, 0.5);

// The return's clunk is its loudest moment; keep a known lead-in before it.
const ret = pcm('carriage-ramsamba.mp3');
let clunk = 0;
for (let i = 0, m = 0; i < ret.length; i++) if (Math.abs(ret[i]) > m) { m = Math.abs(ret[i]); clunk = i / SR; }
const retLead = Math.min(clunk, 0.55);
const retClip = clip(ret, clunk - retLead + 0.004, retLead + 0.45, 0.2);

const out = {
  keys: keys.map(wavBase64),
  bell: wavBase64(bell),
  ret: wavBase64(retClip),
  retLead,
};
await writeFile(join(ROOT, 'assets/sounds.js'), 'window.SOUNDS=' + JSON.stringify(out) + ';\n');
console.log('keys', keys.length, 'clunk at', clunk.toFixed(3), 'lead', retLead.toFixed(3));

export const DEFAULT_GLYPH = 'A';

export const GLYPH_ROWS = [
  'abcdefghijklm',
  'nopqrstuvwxyz',
  'ABCDEFGHIJKLM',
  'NOPQRSTUVWXYZ',
  '0123456789&',
];

export const GLYPHS = new Set(GLYPH_ROWS.join(''));

export const GLYPH_HINTS = {
  a: 'a: single vs double story',
  g: 'g: single vs double story',
  e: 'e: axis and aperture',
  R: 'R: leg shape',
  Q: 'Q: tail',
  '&': '&: often the most expressive glyph',
};

/**
 * Extracts `symbol id -> path d` from a sprite, re-keyed as `<font-id>_a` so
 * every glyph shares the key scheme of the default "A" sprite.
 */
export function parseSprite(text, name = 'a') {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const suffix = `_${name}`;
  const paths = {};
  doc.querySelectorAll('symbol').forEach(symbol => {
    const id = symbol.id;
    const path = symbol.querySelector('path');
    if (!id || !path) return;
    const key = id.endsWith(suffix) ? `${id.slice(0, -suffix.length)}_a` : id;
    paths[key] = path.getAttribute('d');
  });
  return paths;
}

let indexPromise = null;
const spriteCache = new Map();

export function loadGlyphIndex() {
  if (!indexPromise) {
    indexPromise = fetch('/data/sprites/index.json')
      .then(res => {
        if (!res.ok) throw new Error(`Glyph index: HTTP ${res.status}`);
        return res.json();
      })
      .then(data => new Map(data.glyphs.map(g => [g.char, g])))
      .catch(err => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

// char -> { listeners, progress } while its sprite downloads
const inflight = new Map();
const loadedGlyphs = new Set();

/** True once the sprite of `char` has been downloaded and parsed. */
export function isGlyphLoaded(char) {
  return loadedGlyphs.has(char);
}

/**
 * Reads the body as a stream and reports progress in [0, 1]. The expected
 * size is the uncompressed one from the index (the stream yields decoded
 * bytes); Content-Length is only trusted when the response isn't encoded.
 * Without a size or stream support, no progress is reported.
 */
function readText(res, expectedBytes, onProgress) {
  const encoding = res.headers.get('Content-Encoding');
  const total = expectedBytes
    || (!encoding || encoding === 'identity' ? Number(res.headers.get('Content-Length')) : 0);
  if (!total || !res.body || typeof res.body.getReader !== 'function') return res.text();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  const pump = () => reader.read().then(({ done, value }) => {
    if (done) return text + decoder.decode();
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    onProgress(Math.min(1, received / total));
    return pump();
  });
  return pump();
}

/**
 * Fetches (once) and parses the sprite for a glyph. `onProgress` is called
 * with the download ratio while the sprite is in flight (the latest value
 * right away when joining a running download); cached glyphs resolve
 * immediately without progress.
 */
export function loadGlyphPaths(char, { onProgress } = {}) {
  if (!spriteCache.has(char)) {
    const state = { listeners: new Set(), progress: null };
    inflight.set(char, state);
    const emit = (value) => {
      state.progress = value;
      state.listeners.forEach(listener => listener(value));
    };
    const promise = loadGlyphIndex()
      .then(index => {
        const entry = index.get(char);
        if (!entry) throw new Error(`No sprite for glyph "${char}"`);
        return fetch(entry.file).then(res => {
          if (!res.ok) throw new Error(`Sprite ${entry.file}: HTTP ${res.status}`);
          return readText(res, entry.bytes, emit).then(text => parseSprite(text, entry.name));
        });
      })
      .then(paths => {
        loadedGlyphs.add(char);
        inflight.delete(char);
        return paths;
      })
      .catch(err => {
        spriteCache.delete(char);
        inflight.delete(char);
        throw err;
      });
    spriteCache.set(char, promise);
  }
  const state = inflight.get(char);
  if (onProgress && state) {
    state.listeners.add(onProgress);
    if (state.progress !== null) onProgress(state.progress);
  }
  return spriteCache.get(char);
}

/**
 * On-demand Google Fonts loader for the custom preview text.
 *
 * The CSS is requested without `text=` so the full Latin subset is fetched:
 * editing the text never triggers a new request and never leaks it to Google.
 */

const CSS_ENDPOINT = 'https://fonts.googleapis.com/css2';
const MAX_CONCURRENT_LOADS = 3;
const LOAD_TIMEOUT_MS = 10000;

// Families renamed on Google Fonts since the dataset was built
const FAMILY_ALIASES = {
  Finlandica: 'Finlandica Text',
  'Saira Stencil One': 'Saira Stencil',
};

export const PREVIEW_FALLBACK_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const results = new Map(); // family -> 'loaded' | 'failed'
const inFlight = new Map(); // family -> Promise, once its <link> is injected
const queue = []; // { spec, waiters: Set<{ resolve, reject, signal, onAbort }> }
let activeLoads = 0;

const pickWeight = (weights) => {
  const list = (weights || []).map(Number).filter(Number.isFinite);
  if (list.length === 0 || list.includes(400)) return 400;
  return list.reduce((best, w) => (Math.abs(w - 400) < Math.abs(best - 400) ? w : best));
};

const pickStyle = (styles) => {
  const list = styles || [];
  return list.length > 0 && !list.includes('normal') && list.includes('italic') ? 'italic' : 'normal';
};

export const getWebFontSpec = (font) => {
  if (!font?.name) return null;
  const family = FAMILY_ALIASES[font.name] || font.name;
  return { family, weight: pickWeight(font.weights), style: pickStyle(font.styles) };
};

const buildCssUrl = ({ family, weight, style }) => {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  let axes = '';
  if (style === 'italic') axes = weight === 400 ? ':ital@1' : `:ital,wght@1,${weight}`;
  else if (weight !== 400) axes = `:wght@${weight}`;
  return `${CSS_ENDPOINT}?family=${name}${axes}&display=swap`;
};

export const getWebFontStatus = (font) => {
  const spec = getWebFontSpec(font);
  return spec ? results.get(spec.family) || null : null;
};

export const webFontCss = (spec, status) => (status === 'loaded'
  ? {
    fontFamily: `"${spec.family}", ${PREVIEW_FALLBACK_STACK}`,
    fontWeight: spec.weight,
    fontStyle: spec.style,
  }
  : { fontFamily: PREVIEW_FALLBACK_STACK, fontWeight: 400, fontStyle: 'normal' });

const abortError = () => new DOMException('Web font load aborted', 'AbortError');

const injectStylesheet = (href) => new Promise((resolve, reject) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.previewFont = 'true';
  const timer = setTimeout(() => reject(new Error('Stylesheet timeout')), LOAD_TIMEOUT_MS);
  link.onload = () => { clearTimeout(timer); resolve(); };
  link.onerror = () => {
    clearTimeout(timer);
    link.remove();
    reject(new Error('Stylesheet failed'));
  };
  document.head.appendChild(link);
});

const fetchFamily = async (spec) => {
  await injectStylesheet(buildCssUrl(spec));
  if (!document.fonts?.load) return;
  const descriptor = `${spec.style} ${spec.weight} 1em "${spec.family}"`;
  const faces = await Promise.race([
    document.fonts.load(descriptor, 'Aa'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Font timeout')), LOAD_TIMEOUT_MS)),
  ]);
  if (!faces || faces.length === 0) throw new Error(`No face for ${spec.family}`);
};

const startLoad = (spec) => {
  activeLoads += 1;
  const promise = fetchFamily(spec)
    .then(() => { results.set(spec.family, 'loaded'); })
    .catch((err) => {
      results.set(spec.family, 'failed');
      throw err;
    })
    .finally(() => {
      inFlight.delete(spec.family);
      activeLoads -= 1;
      pump();
    });
  inFlight.set(spec.family, promise);
  return promise;
};

function pump() {
  while (activeLoads < MAX_CONCURRENT_LOADS && queue.length > 0) {
    const { spec, waiters } = queue.shift();
    const promise = startLoad(spec);
    waiters.forEach(({ resolve, reject, signal, onAbort }) => {
      signal?.removeEventListener('abort', onAbort);
      promise.then(() => resolve(spec), reject);
    });
  }
}

/**
 * Resolves once the font face is usable. Aborting only removes the request
 * while it is still queued: an injected <link> can't be cancelled, so it
 * keeps loading and fills the cache, but the caller's promise rejects.
 */
export const loadWebFont = (font, { signal } = {}) => {
  const spec = getWebFontSpec(font);
  if (!spec) return Promise.reject(new Error('Invalid font'));
  const status = results.get(spec.family);
  if (status === 'loaded') return Promise.resolve(spec);
  if (status === 'failed') return Promise.reject(new Error(`${spec.family} failed earlier`));
  if (signal?.aborted) return Promise.reject(abortError());

  const running = inFlight.get(spec.family);
  const withAbort = (promise) => (signal
    ? Promise.race([promise, new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(abortError()), { once: true });
    })])
    : promise);
  if (running) return withAbort(running.then(() => spec));

  return new Promise((resolve, reject) => {
    let entry = queue.find(e => e.spec.family === spec.family);
    if (!entry) {
      entry = { spec, waiters: new Set() };
      queue.push(entry);
    }
    const waiter = { resolve, reject, signal, onAbort: null };
    waiter.onAbort = () => {
      entry.waiters.delete(waiter);
      if (entry.waiters.size === 0) {
        const index = queue.indexOf(entry);
        if (index !== -1) queue.splice(index, 1);
      }
      reject(abortError());
    };
    signal?.addEventListener('abort', waiter.onAbort, { once: true });
    entry.waiters.add(waiter);
    pump();
  });
};

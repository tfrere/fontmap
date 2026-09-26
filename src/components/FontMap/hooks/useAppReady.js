import { useEffect, useState } from 'react';

// A stuck signal must never block the app behind the loader.
const MAX_WAIT_MS = 8000;
// Keep in sync with the .app-loader transition in intro-modal.css.
const LOADER_FADE_MS = 280;

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The <link id="ui-fonts"> switches from media="print" to "all" on load or error.
function waitForUiFontsStylesheet() {
  const link = document.getElementById('ui-fonts');
  if (!link || link.media !== 'print') return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
  });
}

/**
 * Gates the first view behind a full-page loader.
 *
 * `dataReady`: the font data and glyph sprite are loaded. There is nothing to
 * show before that, so the max wait only starts from this point (a slow
 * network must not reveal an empty page).
 * `contentReady`: everything under the loader is mounted (rendered map,
 * intro modal or how-it-works page). The hook then waits for the web fonts
 * those elements requested and for two paint frames, so the loader only goes
 * away when the page behind it is final.
 *
 * Returns `isReady` (start fading the loader out) and `loaderMounted`
 * (false once the fade is over and the loader can leave the DOM).
 */
export function useAppReady({ dataReady, contentReady }) {
  const [webFontsReady, setWebFontsReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loaderMounted, setLoaderMounted] = useState(true);

  useEffect(() => {
    if (!dataReady) return;
    const timer = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [dataReady]);

  // The UI font stylesheet loads without blocking render (see public/index.html),
  // and fonts are only requested once text using them is laid out: wait for the
  // stylesheet, force a layout of the mounted content, then read document.fonts.ready.
  useEffect(() => {
    if (!contentReady) return;
    let cancelled = false;
    waitForUiFontsStylesheet()
      .then(() => {
        if (!document.fonts || !document.fonts.ready) return null;
        document.body.getBoundingClientRect();
        return document.fonts.ready;
      })
      .then(() => {
        if (!cancelled) setWebFontsReady(true);
      });
    return () => { cancelled = true; };
  }, [contentReady]);

  useEffect(() => {
    if (isReady || !(timedOut || (contentReady && webFontsReady))) return;
    let raf2 = null;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        console.info(`[FontMap] ready in ${Math.round(performance.now())}ms${timedOut ? ' (timeout)' : ''}`);
        setIsReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
    };
  }, [isReady, timedOut, contentReady, webFontsReady]);

  useEffect(() => {
    if (!isReady) return;
    if (prefersReducedMotion()) {
      setLoaderMounted(false);
      return;
    }
    const timer = setTimeout(() => setLoaderMounted(false), LOADER_FADE_MS);
    return () => clearTimeout(timer);
  }, [isReady]);

  return { isReady, loaderMounted };
}

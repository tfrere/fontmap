import { useEffect, useMemo, useState } from 'react';
import { getWebFontSpec, getWebFontStatus, loadWebFont } from '../utils/webFonts';

/**
 * Loads `font` as a web font once `enabled` has stayed true for `delay` ms.
 * Status: 'idle' (disabled), 'loading' (pending or in flight), 'loaded', 'failed'.
 */
export const useWebFont = (font, { enabled, delay = 0 }) => {
  const spec = useMemo(() => getWebFontSpec(font), [font]);
  const cached = getWebFontStatus(font);
  const [result, setResult] = useState({ family: null, status: null });

  useEffect(() => {
    if (!enabled || !spec || cached) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadWebFont(font, { signal: controller.signal }).then(
        () => { if (!controller.signal.aborted) setResult({ family: spec.family, status: 'loaded' }); },
        (err) => {
          if (!controller.signal.aborted && err?.name !== 'AbortError') {
            setResult({ family: spec.family, status: 'failed' });
          }
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, spec, cached, delay, font]);

  if (!spec || (!enabled && !cached)) return { spec, status: 'idle' };
  if (cached) return { spec, status: cached };
  if (result.family === spec.family) return { spec, status: result.status };
  return { spec, status: 'loading' };
};

/** True once the element intersects the viewport (clipped by scrolling ancestors). */
export const useInView = (ref) => {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
};

/** Becomes true `delay` ms after `key` last changed while `enabled`. */
export const useDwell = (key, enabled, delay) => {
  const [settledKey, setSettledKey] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => setSettledKey(key), delay);
    return () => clearTimeout(timer);
  }, [key, enabled, delay]);
  return enabled && settledKey === key;
};

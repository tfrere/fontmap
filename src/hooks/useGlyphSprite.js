import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_GLYPH, isGlyphLoaded, loadGlyphPaths } from '../utils/glyphSprites';
import { useFontMapStore } from '../store/fontMapStore';

/**
 * Paths (`<font-id>_a` -> d) for the requested glyph. The previous glyph stays
 * on screen while a sprite loads; fonts missing from a sprite keep their "A".
 * `loadingGlyph` is only set while a sprite actually downloads, so cached
 * glyphs swap without any loading state.
 */
export function useGlyphSprite(glyph, basePaths) {
  const [loaded, setLoaded] = useState({ glyph: DEFAULT_GLYPH, paths: null });
  const [loadingGlyph, setLoadingGlyph] = useState(null);
  const shownRef = useRef(DEFAULT_GLYPH);
  shownRef.current = loaded.glyph;

  useEffect(() => {
    if (glyph === DEFAULT_GLYPH) {
      setLoaded({ glyph, paths: null });
      setLoadingGlyph(null);
      return;
    }
    let cancelled = false;
    setLoadingGlyph(isGlyphLoaded(glyph) ? null : glyph);
    loadGlyphPaths(glyph)
      .then(paths => {
        if (cancelled) return;
        setLoaded({ glyph, paths });
        setLoadingGlyph(null);
      })
      .catch(err => {
        console.warn(`⚠️ Could not load glyph "${glyph}":`, err);
        if (cancelled) return;
        setLoadingGlyph(null);
        useFontMapStore.getState().setGlyph(shownRef.current);
      });
    return () => { cancelled = true; };
  }, [glyph]);

  const paths = useMemo(
    () => (loaded.paths ? { ...basePaths, ...loaded.paths } : basePaths),
    [basePaths, loaded.paths]
  );

  return { paths, shownGlyph: loaded.glyph, loadingGlyph };
}

import React, { useEffect, useRef, useState } from 'react';
import { loadGlyphPaths } from '../../../utils/glyphSprites';

/**
 * Thin bar on the top edge of the map showing the download progress of the
 * glyph sprite being loaded. Indeterminate when the size is unknown; fills
 * and fades out on success, disappears on error or when the request is
 * superseded by a cached glyph.
 */
const GlyphLoadingBar = ({ glyph }) => {
  const [bar, setBar] = useState({ id: 0, phase: 'idle', progress: null });
  const requestRef = useRef(0);

  useEffect(() => {
    if (!glyph) {
      setBar(b => (b.phase === 'loading' ? { ...b, phase: 'idle' } : b));
      return;
    }
    const id = ++requestRef.current;
    setBar({ id, phase: 'loading', progress: null });
    const isCurrent = () => requestRef.current === id;
    const onProgress = (progress) => {
      if (isCurrent()) setBar(b => (b.id === id && b.phase === 'loading' ? { ...b, progress } : b));
    };
    loadGlyphPaths(glyph, { onProgress })
      .then(() => {
        if (isCurrent()) setBar(b => (b.id === id ? { ...b, phase: 'done', progress: 1 } : b));
      })
      .catch(() => {
        if (isCurrent()) setBar(b => (b.id === id ? { ...b, phase: 'idle' } : b));
      });
  }, [glyph]);

  const indeterminate = bar.phase === 'loading' && bar.progress === null;
  return (
    <div
      className={`glyph-loading-bar is-${bar.phase}${indeterminate ? ' is-indeterminate' : ''}`}
      aria-hidden="true"
    >
      <div
        key={bar.id}
        className="glyph-loading-bar-fill"
        style={indeterminate ? undefined : { transform: `scaleX(${bar.progress || 0})` }}
      />
    </div>
  );
};

export default GlyphLoadingBar;

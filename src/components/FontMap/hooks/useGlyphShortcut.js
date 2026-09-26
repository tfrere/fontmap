import { useEffect } from 'react';
import { useFontMapStore } from '../../../store/fontMapStore';
import { GLYPHS } from '../../../utils/glyphSprites';

const isTypingTarget = (el) => !!el && (
  el.isContentEditable
  || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
);

/**
 * Typing a letter, digit or "&" switches the glyph drawn on the map,
 * unless the user is typing in a field or holding a modifier.
 */
export const useGlyphShortcut = (enabled) => {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!GLYPHS.has(event.key)) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
      useFontMapStore.getState().setGlyph(event.key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
};

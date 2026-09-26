import { useEffect } from 'react';
import { useTooltipOptimized } from '../hooks/useTooltipOptimized';
import { useFontMapStore } from '../../../store/fontMapStore';

/**
 * Manages the map tooltips
 * through the useTooltipOptimized hook.
 *
 * Reads selectedFont/hoveredFont straight from the store (instead of props)
 * so hover changes only re-render this component.
 */
const TooltipManager = ({
  darkMode,
  isMobile,
  onOpenFont,
}) => {
  const selectedFont = useFontMapStore((s) => s.selectedFont);
  const hoveredFont = useFontMapStore((s) => s.hoveredFont);

  const {
    handleFontSelect,
    handleFontHover,
    handleFontUnhover,
    updateTransform,
    updatePositions
  } = useTooltipOptimized(darkMode, isMobile, onOpenFont);

  // Selected font
  useEffect(() => {
    if (selectedFont) {
      const svg = document.querySelector('.fontmap-svg');
      if (svg) {
        const viewportGroup = svg.querySelector('.viewport-group');
        if (viewportGroup) {
          const selectedGlyph = viewportGroup.querySelector(`[data-font="${CSS.escape(selectedFont.name)}"]`);
          if (selectedGlyph) {
            handleFontSelect(selectedFont, selectedGlyph);
          }
        }
      }
    } else {
      handleFontSelect(null);
    }
  }, [selectedFont, handleFontSelect]);

  // Hovered font
  useEffect(() => {
    if (hoveredFont && (!selectedFont || selectedFont.name !== hoveredFont.name)) {
      const svg = document.querySelector('.fontmap-svg');
      if (svg) {
        const viewportGroup = svg.querySelector('.viewport-group');
        if (viewportGroup) {
          const hoveredGlyph = viewportGroup.querySelector(`[data-font="${CSS.escape(hoveredFont.name)}"]`);
          if (hoveredGlyph) {
            handleFontHover(hoveredFont, hoveredGlyph);
          }
        }
      }
    } else if (!hoveredFont) {
      handleFontUnhover();
    }
  }, [hoveredFont, selectedFont, handleFontHover, handleFontUnhover]);

  // Expose functions and state globally for the D3 integration
  useEffect(() => {
    window.updateTooltipPositions = updatePositions;
    window.updateTooltipTransform = updateTransform;
    window.currentSelectedFont = selectedFont;
    window.currentHoveredFont = hoveredFont;
    
    return () => {
      delete window.updateTooltipPositions;
      delete window.updateTooltipTransform;
      delete window.currentSelectedFont;
      delete window.currentHoveredFont;
    };
  }, [updatePositions, updateTransform, selectedFont, hoveredFont]);

  return null; // Renders nothing itself
};

export default TooltipManager;
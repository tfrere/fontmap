import { useEffect } from 'react';
import { useTooltipOptimized } from '../hooks/useTooltipOptimized';
import { useFontMapStore } from '../../../store/fontMapStore';

/**
 * Composant simplifié pour gérer les tooltips
 * Utilise le hook useTooltip pour une gestion propre et centralisée
 *
 * Lit selectedFont/hoveredFont directement dans le store (au lieu de props)
 * pour que les changements de hover ne re-rendent que ce composant.
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

  // Gérer la police sélectionnée
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

  // Gérer la police survolée
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

  // Exposer les fonctions et états globalement pour l'intégration D3
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

  return null; // Ce composant ne rend rien visuellement
};

export default TooltipManager;
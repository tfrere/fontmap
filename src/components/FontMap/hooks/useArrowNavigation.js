import { useEffect, useCallback } from 'react';
import { filterFonts } from '../utils/fontUtils';

/**
 * Arrow-key navigation between fonts
 * Moves to the nearest font in the pressed direction
 */
export const useArrowNavigation = (
  selectedFont,
  fonts,
  filter,
  searchTerm,
  onFontSelect,
  styleTag = null
) => {
  // Fonts matching the current filters
  const getFilteredFonts = useCallback(() => {
    if (!fonts || fonts.length === 0) return [];
    return filterFonts(fonts, filter, searchTerm, styleTag);
  }, [fonts, filter, searchTerm, styleTag]);


  // Find the nearest font in a direction
  const findNearestFontInDirection = useCallback((direction) => {
    if (!selectedFont || !onFontSelect) return;
    
    const filteredFonts = getFilteredFonts();
    if (filteredFonts.length <= 1) return; // Not enough fonts to navigate
    
    // Find the selected font in the filtered list
    const currentFont = filteredFonts.find(font => font.name === selectedFont.name);
    if (!currentFont) return;
    
    let bestFont = null;
    let bestDistance = Infinity;
    
    // Simple approach: nearest font in the direction
    filteredFonts.forEach(font => {
      if (font.name === selectedFont.name) return; // Skip the current font
      
      const dx = font.x - currentFont.x;
      const dy = font.y - currentFont.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance === 0) return; // Skip fonts at the same position
      
      let isInDirection = false;
      
      // Whether the font lies in the requested direction (simple criteria)
      switch (direction) {
        case 'ArrowUp':
          // Font above - inverted because the y axis points down
          isInDirection = dy > 0 && Math.abs(dx) <= Math.abs(dy) * 2;
          break;
        case 'ArrowDown':
          // Font below - inverted because the y axis points down
          isInDirection = dy < 0 && Math.abs(dx) <= Math.abs(dy) * 2;
          break;
        case 'ArrowLeft':
          // Font to the left (smaller x) - allow some vertical offset
          isInDirection = dx < 0 && Math.abs(dy) <= Math.abs(dx) * 2;
          break;
        case 'ArrowRight':
          // Font to the right (larger x) - allow some vertical offset
          isInDirection = dx > 0 && Math.abs(dy) <= Math.abs(dx) * 2;
          break;
        default:
          return;
      }
      
      // In the right direction and closer than the current best
      if (isInDirection && distance < bestDistance) {
        bestDistance = distance;
        bestFont = font;
      }
    });
    
    // Select the nearest font found
    if (bestFont) {
      onFontSelect(bestFont);
    }
  }, [selectedFont, getFilteredFonts, onFontSelect]);

  // Keyboard handler
  const handleKeyDown = useCallback((event) => {
    // A font must be selected
    if (!selectedFont) return;
    
    // Skip when typing in an input
    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true'
    )) {
      return; // Don't intercept arrows in inputs
    }
    
    // Arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); // Prevent page scroll
      findNearestFontInDirection(event.key);
    }
  }, [selectedFont, findNearestFontInDirection]);

  // Register the listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Return useful info for debugging
  return {
    canNavigate: selectedFont && getFilteredFonts().length > 1,
    filteredFontsCount: getFilteredFonts().length,
    selectedFontName: selectedFont?.name
  };
};

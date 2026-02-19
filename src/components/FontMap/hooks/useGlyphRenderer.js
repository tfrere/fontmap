import { useCallback } from 'react';
import { getFontSymbolId, matchesSearch } from '../utils/fontUtils';

// Mode logarithmique pour ajuster la taille selon le nombre de variantes
const ENABLE_LOGARITHMIC_SIZING = true;

/**
 * Hook spécialisé pour le rendu des glyphes D3
 * Centralise la logique de création et mise à jour des glyphes
 */
export const useGlyphRenderer = () => {

  // Fonction pour calculer la taille logarithmique basée sur le nombre de variantes
  const calculateLogarithmicSize = useCallback((font, currentSize) => {
    if (!ENABLE_LOGARITHMIC_SIZING) {
      return currentSize;
    }

    // Vérifier si c'est une police fusionnée
    const isMerged = font.fusionInfo && font.fusionInfo.merged;
    const variantCount = font.fusionInfo ? font.fusionInfo.originalCount : 1;

    if (!isMerged) {
      return currentSize;
    }

    // Échelle inverse-logarithmique pour un effet plus doux
    const sizeMultiplier = 1.0 + Math.log(variantCount) / 10;
    const finalSize = currentSize * sizeMultiplier;

    return finalSize;
  }, []);

  // Fonction pour créer les glyphes
  const createGlyphs = useCallback((container, positions, glyphPaths, darkMode, characterSize, filter, searchTerm, colorScale, debugMode, onFontSelect, selectedFont, visualStateRef) => {
    const baseSize = 16;
    const currentSize = baseSize * characterSize;
    const hitAreaSize = currentSize * 1.5;

    const glyphs = container.selectAll('.font-glyph-group')
      .data(positions)
      .enter()
      .append('g')
      .attr('class', 'font-glyph-group')
      .attr('data-font', d => d.name)
      .attr('transform', d => {
        const isActive = selectedFont && selectedFont.name === d.name;
        const logSize = calculateLogarithmicSize(d, currentSize);
        d.__logSize = logSize;

        const size = isActive ? logSize * 2 : logSize;
        const scale = size / 80; // ViewBox est 0 0 80 80

        // Position + Scale sur le groupe parent
        return `translate(${d.x}, ${d.y}) scale(${scale})`;
      })
      .style('opacity', d => {
        const familyMatch = filter === 'all' || d.family === filter;
        const searchMatch = matchesSearch(d, searchTerm);
        const isActive = selectedFont && selectedFont.name === d.name;
        return isActive ? 1 : (familyMatch && searchMatch ? 1 : 0.2);
      })
      .style('cursor', d => (selectedFont && selectedFont.name === d.name) ? 'default' : 'pointer')
      .style('pointer-events', 'all')
      .on('mouseover', function (event, d) {
        if (!d || !d.name || visualStateRef.current.isTransitioning) return;
        if (window.onFontHover) window.onFontHover(d);
      })
      .on('mouseout', function (event, d) {
        if (!d || !d.name || visualStateRef.current.isTransitioning) return;
        if (window.onFontUnhover) window.onFontUnhover();
      })
      .on('click', function (event, d) {
        if (!d || !d.name) return;
        if (window.onFontUnhover) window.onFontUnhover();
        if (onFontSelect) {
          onFontSelect(d);
        } else if (d.google_fonts_url) {
          window.open(d.google_fonts_url, '_blank');
        }
      });

    // Zone de clic - cercle (centré car le groupe est scalé)
    glyphs.append('circle')
      .attr('class', 'font-hit-area')
      .attr('r', 40) // Rayon fixe dans l'espace du viewBox (0 0 80 80)
      .attr('cx', 40) // Centré dans le viewBox
      .attr('cy', 40)
      .attr('fill', 'transparent')
      .attr('data-font', d => d.name);

    // Glyphe visible - PATH direct (pas de use)
    // Le scale est sur le groupe parent, le path est à taille normale (viewBox 0 0 80 80)
    glyphs.append('path')
      .attr('d', d => {
        const id = getFontSymbolId(d.imageName || d.name);
        return (glyphPaths && glyphPaths[id]) ? glyphPaths[id] : '';
      })
      .attr('fill', darkMode ? '#ffffff' : d => colorScale(d.family))
      .style('fill', darkMode ? '#ffffff' : null)
      .style('color', darkMode ? '#ffffff' : null)
      .attr('class', 'font-glyph');

    // Masquer les glyphes sans nom
    glyphs.filter(d => !d.name).style('display', 'none');

    // Zones de debug
    if (debugMode) {
      glyphs.selectAll('.debug-hit-area').remove();
      glyphs.append('circle')
        .attr('class', 'debug-hit-area')
        .attr('r', hitAreaSize / 2)
        .attr('fill', 'none')
        .attr('stroke', 'none')
        .attr('stroke-width', 0)
        .attr('stroke-dasharray', 'none')
        .style('pointer-events', 'none');
    } else {
      glyphs.selectAll('.debug-hit-area').remove();
    }

    return glyphs;
  }, [calculateLogarithmicSize]);

  // Fonction pour mettre à jour les positions des glyphes
  const updateGlyphPositions = useCallback((container, positions) => {
    const glyphs = container.selectAll('.font-glyph-group');

    glyphs
      .data(positions)
      .transition()
      .duration(300)
      .attr('transform', d => `translate(${d.x}, ${d.y})`);
  }, []);

  // Fonction pour mettre à jour la taille des glyphes
  const updateGlyphDimensions = useCallback((container, characterSize, selectedFont) => {
    const baseSize = 16;
    const currentSize = baseSize * characterSize;

    const glyphGroups = container.selectAll('.font-glyph-group');
    glyphGroups
      .transition()
      .duration(300)
      .attr('transform', function (d) {
        const isActive = selectedFont && selectedFont.name === d.name;
        const logSize = calculateLogarithmicSize(d, currentSize);
        d.__logSize = logSize;

        const size = isActive ? logSize * 2 : logSize;
        const scale = size / 80;

        return `translate(${d.x}, ${d.y}) scale(${scale})`;
      });
  }, [calculateLogarithmicSize]);

  return {
    createGlyphs,
    updateGlyphPositions,
    updateGlyphDimensions
  };
};

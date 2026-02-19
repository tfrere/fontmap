import { useCallback, useRef } from 'react';
import * as d3 from 'd3';

/**
 * Hook spécialisé pour la gestion des états visuels (hover, sélection, transitions)
 * Centralise toute la logique d'affichage des états visuels
 */
export const useVisualState = () => {
  const visualStateRef = useRef({
    isTransitioning: false,
    selectedFont: null,
    hoveredFont: null
  });

  // Fonction pour mettre à jour les états visuels
  const updateVisualStates = useCallback((svg, viewportGroup, selectedFont, hoveredFont, darkMode) => {
    if (!svg || !viewportGroup) return;

    const glyphGroups = viewportGroup.selectAll('.font-glyph-group');
    
    glyphGroups.each(function(d) {
      const group = d3.select(this);
      const isActive = selectedFont && selectedFont.name === d.name;
      const isHovered = hoveredFont && hoveredFont.name === d.name;
      
      // Supprimer tous les cercles existants
      group.select('.active-background-circle').remove();
      group.select('.hover-background-circle').remove();
      
      if (isActive) {
        // Cercle actif
        // Creating active circle
        group.insert('circle', ':first-child')
          .attr('class', 'active-background-circle')
          .attr('r', 12)
          .attr('fill', darkMode ? '#000000' : '#ffffff')
          .attr('stroke', 'none')
          .attr('stroke-width', 0)
          .style('pointer-events', 'none')
          .style('opacity', 1);
        
        // Forcer l'opacité du groupe parent à 1 pour les lettres actives
        group.style('opacity', 1);
        
        // Active circle created
      } else if (isHovered) {
        // Cercle hover
        group.insert('circle', ':first-child')
          .attr('class', 'hover-background-circle')
          .attr('r', 12)
          .attr('fill', darkMode ? '#000000' : '#ffffff')
          .style('pointer-events', 'none')
          .style('opacity', 1);
        
        // Forcer l'opacité du groupe parent à 1 pour les lettres en hover
        group.style('opacity', 1);
      }
    });
  }, []);

  // Fonction pour mettre à jour la taille des glyphes
  const updateGlyphSizes = useCallback((viewportGroup, selectedFont, characterSize) => {
    if (!viewportGroup) return;

    console.log('🎯 updateGlyphSizes called with characterSize:', characterSize);

    const baseSize = 16;
    const currentSize = baseSize * characterSize;

    // NOTE: calculateLogarithmicSize supprimé car non utilisé

    const fontGlyphs = viewportGroup.selectAll('.font-glyph');
    
    fontGlyphs
      .attr('width', d => {
        const isActive = selectedFont && selectedFont.name === d.name;
        const isMerged = d.fusionInfo && d.fusionInfo.merged;
        
        // Pour les polices fusionnées, ne pas redimensionner (useGlyphRenderer s'en charge)
        if (isMerged) {
          return isActive ? d.__logSize * 2 : d.__logSize;
        }
        
        // Pour les polices normales, utiliser currentSize
        return isActive ? currentSize * 2 : currentSize;
      })
      .attr('height', d => {
        const isActive = selectedFont && selectedFont.name === d.name;
        const isMerged = d.fusionInfo && d.fusionInfo.merged;
        
        // Pour les polices fusionnées, ne pas redimensionner (useGlyphRenderer s'en charge)
        if (isMerged) {
          return isActive ? d.__logSize * 2 : d.__logSize;
        }
        
        // Pour les polices normales, utiliser currentSize
        return isActive ? currentSize * 2 : currentSize;
      })
      .attr('x', d => {
        const isActive = selectedFont && selectedFont.name === d.name;
        const isMerged = d.fusionInfo && d.fusionInfo.merged;
        
        // Pour les polices fusionnées, ne pas redimensionner (useGlyphRenderer s'en charge)
        if (isMerged) {
          const logSize = d.__logSize;
          const activeOffset = isActive ? -(logSize * 2) / 2 : -logSize / 2;
          return activeOffset;
        }
        
        // Pour les polices normales, utiliser currentSize
        const activeOffset = isActive ? -(currentSize * 2) / 2 : -currentSize / 2;
        return activeOffset;
      })
      .attr('y', d => {
        const isActive = selectedFont && selectedFont.name === d.name;
        const isMerged = d.fusionInfo && d.fusionInfo.merged;
        
        // Pour les polices fusionnées, ne pas redimensionner (useGlyphRenderer s'en charge)
        if (isMerged) {
          const logSize = d.__logSize;
          const activeOffset = isActive ? -(logSize * 2) / 2 : -logSize / 2;
          return activeOffset;
        }
        
        // Pour les polices normales, utiliser currentSize
        const activeOffset = isActive ? -(currentSize * 2) / 2 : -currentSize / 2;
        return activeOffset;
      });
  }, []);

  // Fonction pour mettre à jour l'opacité des glyphes
  const updateGlyphOpacity = useCallback((viewportGroup, positions, filter, searchTerm, selectedFont) => {
    if (!viewportGroup) return;

    const glyphGroups = viewportGroup.selectAll('.font-glyph-group');
    
    glyphGroups
      .data(positions)
      .style('opacity', d => {
        const familyMatch = filter === 'all' || d.family === filter;
        const searchMatch = !searchTerm || 
          d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          d.family.toLowerCase().includes(searchTerm.toLowerCase());
        const isActive = selectedFont && selectedFont.name === d.name;
        
        // Si la lettre est active, toujours opacité 1, sinon appliquer les filtres
        return isActive ? 1 : (familyMatch && searchMatch ? 1 : 0.2);
      });
  }, []);

  // Fonction pour mettre à jour les couleurs
  const updateGlyphColors = useCallback((viewportGroup, fonts, darkMode) => {
    if (!viewportGroup) return;

    const colorScale = d3.scaleOrdinal(
      darkMode 
        ? ['#ffffff', '#cccccc', '#999999', '#666666', '#333333']
        : ['#000000', '#333333', '#666666', '#999999', '#cccccc']
    );
    const families = [...new Set(fonts.map(d => d.family))];
    families.forEach(family => colorScale(family));

    const fontGlyphs = viewportGroup.selectAll('.font-glyph');
    if (!fontGlyphs.empty()) {
      fontGlyphs
        .attr('fill', darkMode ? '#ffffff' : d => colorScale(d.family))
        .style('fill', darkMode ? '#ffffff' : null)
        .style('color', darkMode ? '#ffffff' : null);
    }
  }, []);

  // Fonction pour démarrer une transition
  const startTransition = useCallback(() => {
    visualStateRef.current.isTransitioning = true;
  }, []);

  // Fonction pour terminer une transition
  const endTransition = useCallback(() => {
    visualStateRef.current.isTransitioning = false;
  }, []);

  return {
    visualStateRef,
    updateVisualStates,
    updateGlyphSizes,
    updateGlyphOpacity,
    updateGlyphColors,
    startTransition,
    endTransition
  };
};

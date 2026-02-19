import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { useFontMapStore } from '../../../store/fontMapStore';
import { useGlyphRenderer } from './useGlyphRenderer';
import { useZoom } from './useZoom';
import { useVisualState } from './useVisualState';

/**
 * Hook principal pour la visualisation D3
 * Orchestre le rendu, le zoom et les interactions
 */
export const useD3Visualization = (fonts, glyphPaths, filter, searchTerm, darkMode, loading) => {
  const svgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const scaledPositionsRef = useRef([]); // Pour stocker les positions mises à l'échelle

  // Store global
  const {
    selectedFont,
    setSelectedFont,
    setHoveredFont
  } = useFontMapStore();

  // Hooks spécialisés
  const { createGlyphs, updateGlyphPositions, updateGlyphDimensions } = useGlyphRenderer();
  const { setupZoom, setupGlobalZoomFunctions, centerOnFont, createZoomIndicator } = useZoom(svgRef, darkMode);
  const { visualStateRef, updateVisualStates, updateGlyphSizes, updateGlyphOpacity, updateGlyphColors } = useVisualState();

  // Initialisation et redimensionnement
  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current && svgRef.current.parentElement) {
        const { clientWidth, clientHeight } = svgRef.current.parentElement;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Rendu principal D3
  useEffect(() => {
    if (loading || !fonts || fonts.length === 0 || !svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Nettoyage complet

    const width = dimensions.width;
    const height = dimensions.height;

    svg
      .attr('width', width)
      .attr('height', height)
      .style('background-color', darkMode ? '#1a1a1a' : '#ffffff');

    // Groupes principaux
    const containerGroup = svg.append('g').attr('class', 'container-group');
    const viewportGroup = containerGroup.append('g').attr('class', 'viewport-group');
    const uiGroup = svg.append('g').attr('class', 'ui-group');

    // Injecter le sprite SVG directement dans le SVG
    // Créer les symboles à partir des glyphPaths
    if (glyphPaths && Object.keys(glyphPaths).length > 0) {
      const defs = svg.append('defs');
      Object.entries(glyphPaths).forEach(([id, pathData]) => {
        defs.append('symbol')
          .attr('id', id)
          .attr('viewBox', '0 0 80 80')
          .append('path')
          .attr('d', pathData)
          .attr('fill', 'currentColor');
      });
      console.log(`✅ Injected ${Object.keys(glyphPaths).length} symbols into SVG`);
    } else {
      console.warn('⚠️ No glyphPaths available for sprite injection');
    }

    // Configuration du zoom
    const zoom = setupZoom(svg, viewportGroup, uiGroup, width, height);
    setupGlobalZoomFunctions(svg);

    // Calculer les échelles pour mapper les coordonnées UMAP vers l'espace SVG
    const padding = 50; // Padding autour de la visualisation
    const xExtent = d3.extent(fonts, d => d.x);
    const yExtent = d3.extent(fonts, d => d.y);

    const xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([padding, width - padding]);

    const yScale = d3.scaleLinear()
      .domain(yExtent)
      .range([padding, height - padding]);

    // Créer les positions mises à l'échelle
    const scaledPositions = fonts.map(font => ({
      ...font,
      x: xScale(font.x),
      y: yScale(font.y)
    }));

    // Stocker pour les effets réactifs
    scaledPositionsRef.current = scaledPositions;

    // Échelle de couleurs
    const colorScale = d3.scaleOrdinal(
      darkMode
        ? ['#ffffff', '#cccccc', '#999999', '#666666', '#333333']
        : ['#000000', '#333333', '#666666', '#999999', '#cccccc']
    );
    const families = [...new Set(fonts.map(d => d.family))];
    families.forEach(family => colorScale(family));

    // Création des glyphes avec les positions mises à l'échelle
    createGlyphs(
      viewportGroup,
      scaledPositions, // Utiliser les positions mises à l'échelle !
      glyphPaths, // Paths extraits pour rendu direct
      darkMode,
      1.0, // characterSize par défaut
      filter,
      searchTerm,
      colorScale,
      false, // debugMode
      setSelectedFont,
      selectedFont,
      visualStateRef
    );

    // Indicateurs UI
    createZoomIndicator(uiGroup, width, height, true);

  }, [
    loading,
    fonts,
    glyphPaths, // Needed for sprite injection
    dimensions.width,
    dimensions.height,
    darkMode,
    setupZoom,
    createGlyphs,
    createZoomIndicator,
    setupGlobalZoomFunctions,
    visualStateRef,
    setSelectedFont,
    selectedFont // Pour l'état initial
  ]);

  // Mises à jour réactives (sans redessiner tout)
  useEffect(() => {
    if (!svgRef.current || loading || scaledPositionsRef.current.length === 0) return;

    const svg = d3.select(svgRef.current);
    const viewportGroup = svg.select('.viewport-group');

    if (viewportGroup.empty()) return;

    // Mise à jour des états visuels
    updateVisualStates(svg, viewportGroup, selectedFont, null, darkMode);
    updateGlyphOpacity(viewportGroup, scaledPositionsRef.current, filter, searchTerm, selectedFont);

    // Si une police est sélectionnée, on centre dessus
    if (selectedFont && !visualStateRef.current.isTransitioning) {
      // Utiliser les positions mises à l'échelle pour le centrage
      centerOnFont(selectedFont, scaledPositionsRef.current, visualStateRef, (val) => {
        visualStateRef.current.isTransitioning = val;
      });
    }

  }, [
    selectedFont,
    filter,
    searchTerm,
    darkMode,
    fonts,
    loading,
    updateVisualStates,
    updateGlyphOpacity,
    centerOnFont,
    visualStateRef
  ]);

  return svgRef;
};

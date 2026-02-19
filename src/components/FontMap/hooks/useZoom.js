import { useRef, useCallback } from 'react';
import * as d3 from 'd3';

/**
 * Hook spécialisé pour la gestion du zoom et pan
 * Centralise toute la logique de zoom/pan et les fonctions globales
 */
export const useZoom = (svgRef, darkMode, useCSSTransform = false) => {
  const zoomRef = useRef();

  // Fonction pour créer et configurer le zoom
  const setupZoom = useCallback((svg, viewportGroup, uiGroup, width, height) => {
    if (!svg || !viewportGroup) return null;

    // Configuration de zoom - anti-pixellisation avec matrix
    const zoom = d3.zoom()
      .scaleExtent([0.6, 5.0])
      .filter(function(event) {
        return !event.ctrlKey || event.type === 'wheel';
      })
      .on('start', function() {
        svg.classed('zooming', true);
      })
      .on('zoom', (event) => {
        const { transform } = event;
        
        if (useCSSTransform) {
          // Utiliser CSS transform pour éviter la pixellisation
          viewportGroup.style('transform', `matrix(${transform.k}, 0, 0, ${transform.k}, ${transform.x}, ${transform.y})`);
          viewportGroup.attr('transform', null);
        } else {
          // Utiliser SVG transform (approche par défaut)
          const matrix = transform.toString();
          viewportGroup.attr('transform', matrix);
          viewportGroup.style('transform', null);
        }
        
        // Mise à jour de l'indicateur de zoom
        const scaleValue = transform.k;
        uiGroup.select('.zoom-indicator')
          .text(`Zoom: ${Math.round(scaleValue * 100)}%`);
        
        // Mise à jour des tooltips
        if (window.updateTooltipTransform) {
          window.updateTooltipTransform(transform);
        }
        
        if (window.updateTooltipPositions) {
          window.updateTooltipPositions();
        }
      })
      .on('end', function() {
        svg.classed('zooming', false);
      });

    // Appliquer le zoom au SVG
    svg.call(zoom);
    
    // Initialisation du zoom par défaut à 80% avec centrage
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 0.8;
    
    // Calculer la translation pour centrer la vue
    const translateX = centerX * (1 - scale);
    const translateY = centerY * (1 - scale);
    
    const initialTransform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);
    
    svg.call(zoom.transform, initialTransform);
    
    // Initialisation de l'indicateur de zoom
    uiGroup.select('.zoom-indicator')
      .text(`Zoom: 80%`);

    // Stocker la référence du zoom
    zoomRef.current = zoom;
    return zoom;
  }, [useCSSTransform]);

  // Fonctions de zoom globales
  const setupGlobalZoomFunctions = useCallback((svg) => {
    window.zoomIn = () => {
      if (zoomRef.current) {
        svg.transition().duration(200).call(zoomRef.current.scaleBy, 1.5);
      }
    };

    window.zoomOut = () => {
      if (zoomRef.current) {
        svg.transition().duration(200).call(zoomRef.current.scaleBy, 1 / 1.5);
      }
    };

    window.resetZoom = () => {
      if (zoomRef.current) {
        // Obtenir les dimensions actuelles du SVG
        const currentWidth = svg.attr('width') || svg.node().clientWidth;
        const currentHeight = svg.attr('height') || svg.node().clientHeight;
        
        // Centrer la vue à 80%
        const centerX = currentWidth / 2;
        const centerY = currentHeight / 2;
        const scale = 0.8;
        
        const translateX = centerX * (1 - scale);
        const translateY = centerY * (1 - scale);
        
        const resetTransform = d3.zoomIdentity
          .translate(translateX, translateY)
          .scale(scale);
        
        svg.transition().duration(300).call(zoomRef.current.transform, resetTransform);
      }
    };
  }, []);

  // Fonction pour centrer sur une police sélectionnée
  const centerOnFont = useCallback((selectedFont, positions, visualStateRef, setIsTransitioning) => {
    if (!selectedFont || !positions?.length || !zoomRef.current) return;

    // Utiliser les positions déjà calculées (pas de recalcul !)
    const selectedPosition = positions.find(p => p.name === selectedFont.name);
    if (!selectedPosition) return;

    const svg = d3.select(svgRef.current);
    
    // Récupérer les dimensions du SVG
    const svgElement = svgRef.current;
    const width = svgElement.clientWidth;
    const height = svgElement.clientHeight;
    
    // Démarrer la transition
    setIsTransitioning(true);
    visualStateRef.current.isTransitioning = true;

    const scale = 2.5;
    const centerX = width / 2;
    const centerY = height / 2;
    
    const translateX = centerX - (selectedPosition.x * scale);
    const translateY = centerY - (selectedPosition.y * scale);
    
    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);

    // Animation avec gestion de la fin de transition
    svg.transition()
      .duration(800)
      .ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform, transform)
      .on('end', () => {
        // Finir la transition
        setIsTransitioning(false);
        visualStateRef.current.isTransitioning = false;
      });
  }, [svgRef]);

  // Fonction pour créer l'indicateur de zoom et de navigation
  const createZoomIndicator = useCallback((uiGroup, width, height, canNavigate = false) => {
    if (!uiGroup) return;

    // Créer ou mettre à jour l'indicateur de zoom
    const existingZoomIndicator = uiGroup.select('.zoom-indicator');
    if (!existingZoomIndicator.empty()) {
      existingZoomIndicator
        .attr('y', Math.max(height - 20, 20))
        .style('fill', darkMode ? '#ffffff' : '#000000');
    } else {
      uiGroup.append('text')
        .attr('class', 'zoom-indicator')
        .attr('x', 20)
        .attr('y', Math.max(height - 20, 20))
        .style('font-size', '12px')
        .style('fill', darkMode ? '#ffffff' : '#000000')
        .style('opacity', 0.7)
        .text('Zoom: 100%');
    }

    // Créer ou mettre à jour l'indicateur de navigation
    const existingNavIndicator = uiGroup.select('.navigation-indicator');
    if (canNavigate) {
      if (!existingNavIndicator.empty()) {
        existingNavIndicator
          .attr('y', Math.max(height - 40, 40))
          .style('fill', darkMode ? '#ffffff' : '#000000')
          .style('opacity', 0.7);
      } else {
        uiGroup.append('text')
          .attr('class', 'navigation-indicator')
          .attr('x', 20)
          .attr('y', Math.max(height - 40, 40))
          .style('font-size', '12px')
          .style('fill', darkMode ? '#ffffff' : '#000000')
          .style('opacity', 0.7)
          .text('↑↓←→ to navigate');
      }
    } else {
      // Supprimer l'indicateur de navigation s'il existe
      existingNavIndicator.remove();
    }

    return existingZoomIndicator;
  }, [darkMode]);

  return {
    zoomRef,
    setupZoom,
    setupGlobalZoomFunctions,
    centerOnFont,
    createZoomIndicator
  };
};

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { getConfig } from '../config/mapConfig.js';
import { applyZoomTransform } from '../utils/mappingUtils.js';

/**
 * Hook pour gérer le comportement de zoom D3
 */
export function useZoom(svgRef, baseGlyphSize, enabled = true, darkMode = false) {
  console.log('useZoom: Hook appelé avec baseGlyphSize:', baseGlyphSize);
  const zoomRef = useRef(null);
  const baseGlyphSizeRef = useRef(baseGlyphSize);
  const isInitializedRef = useRef(false);

  // Mettre à jour la référence du baseGlyphSize
  useEffect(() => {
    baseGlyphSizeRef.current = baseGlyphSize;
  }, [baseGlyphSize]);

  // Initialiser le zoom quand le SVG est prêt
  useEffect(() => {
    if (!enabled) {
      console.log('useZoom: Hook désactivé, sortie');
      return;
    }
    
    // Éviter les initialisations multiples
    if (isInitializedRef.current) {
      console.log('useZoom: Déjà initialisé, sortie');
      return;
    }
    
    const initializeZoom = () => {
      if (!svgRef.current) {
        console.log('useZoom: svgRef.current is null, en attente...');
        return;
      }

      const svg = d3.select(svgRef.current);
      console.log('useZoom: SVG sélectionné', svg.node());
      
      // Créer ou récupérer le groupe viewport
      let viewportGroup = svg.select('.viewport-group');
      if (viewportGroup.empty()) {
        viewportGroup = svg.append('g').attr('class', 'viewport-group');
        console.log('useZoom: Groupe viewport créé');
      } else {
        console.log('useZoom: Groupe viewport existant trouvé');
      }
      
      // Créer le comportement de zoom
      const zoom = d3.zoom()
        .scaleExtent(getConfig('zoom.scaleExtent', [0.3, 3.0]))
        .on('zoom', (event) => {
          console.log('useZoom: Événement de zoom déclenché', event.transform);
          
          // Appliquer la transformation directement sans limitation
          viewportGroup.attr('transform', event.transform);
          
          // Ajuster la taille du texte des centroïdes pour compenser le zoom
          const scale = event.transform.k;
          const fontSize = Math.max(8, 16 / scale); // Taille de base 16px, minimum 8px
          const strokeColor = darkMode ? '#000000' : '#ffffff';
          
          viewportGroup.selectAll('.centroid-label')
            .attr('font-size', `${fontSize}px`)
            .attr('stroke-width', `${Math.max(1, 4 / scale)}px`)
            .attr('stroke', strokeColor);
        })
        .on('start', () => {
          console.log('useZoom: Début de l\'interaction');
        })
        .on('end', () => {
          console.log('useZoom: Fin de l\'interaction');
        });

      // Appliquer le zoom au SVG
      svg.call(zoom);
      
      // Initialiser avec l'échelle configurée
      const initialScale = getConfig('zoom.initialScale', 0.8);
      const svgRect = svg.node().getBoundingClientRect();
      const centerX = svgRect.width / 2;
      const centerY = svgRect.height / 2;
      
      // Créer la transformation initiale centrée
      const initialTransform = d3.zoomIdentity
        .translate(centerX * (1 - initialScale), centerY * (1 - initialScale))
        .scale(initialScale);
      
      // Appliquer la transformation initiale
      svg.call(zoom.transform, initialTransform);
      console.log('useZoom: Zoom initialisé avec échelle:', initialScale);
      
      // Stocker la référence et marquer comme initialisé
      zoomRef.current = zoom;
      isInitializedRef.current = true;
    };

    // Essayer d'initialiser immédiatement
    initializeZoom();
    
    // Si ça n'a pas marché, essayer après un délai
    if (!svgRef.current) {
      const timer = setTimeout(initializeZoom, 100);
      return () => clearTimeout(timer);
    }

    // Nettoyer au démontage
    return () => {
      if (svgRef.current) {
        const svg = d3.select(svgRef.current);
        svg.on('.zoom', null);
      }
      // Nettoyer les références
      zoomRef.current = null;
      isInitializedRef.current = false;
    };
  }, [enabled]); // Dépendance sur enabled

  const resetZoom = () => {
    if (zoomRef.current && svgRef.current && isInitializedRef.current) {
      const svg = d3.select(svgRef.current);
      const svgNode = svg.node();
      const width = svgNode.clientWidth || window.innerWidth;
      const height = svgNode.clientHeight || window.innerHeight;
      
      const centerX = width / 2;
      const centerY = height / 2;
      const scale = getConfig('zoom.initialScale', 0.8);
      
      // Calculer la translation pour centrer la vue
      const translateX = centerX * (1 - scale);
      const translateY = centerY * (1 - scale);
      
      const resetTransform = d3.zoomIdentity
        .translate(translateX, translateY)
        .scale(scale);
      
      svg.transition().duration(getConfig('zoom.transitionDuration', 750)).call(
        zoomRef.current.transform,
        resetTransform
      );
      console.log('useZoom: Reset zoom appliqué');
    }
  };

  return { resetZoom };
}

import { useCallback, useMemo } from 'react';
import * as d3 from 'd3';

/**
 * Hook pour la virtualisation/culling des glyphes
 * Ne rend que les glyphes visibles dans le viewport
 */
export const useViewportCulling = (positions, viewportBounds, padding = 200) => {
  
  // Fonction pour calculer les glyphes visibles
  const getVisibleGlyphs = useCallback((positions, bounds, padding) => {
    if (!positions.length || !bounds) return positions;
    
    const { x, y, width, height, scale } = bounds;
    
    // Étendre les bounds avec du padding
    const visibleBounds = {
      minX: (x - padding) / scale,
      maxX: (x + width + padding) / scale,
      minY: (y - padding) / scale,
      maxY: (y + height + padding) / scale
    };
    
    // Filtrer les positions visibles
    return positions.filter(position => {
      return position.x >= visibleBounds.minX &&
             position.x <= visibleBounds.maxX &&
             position.y >= visibleBounds.minY &&
             position.y <= visibleBounds.maxY;
    });
  }, []);

  // Mémoriser les glyphes visibles
  const visiblePositions = useMemo(() => {
    return getVisibleGlyphs(positions, viewportBounds, padding);
  }, [positions, viewportBounds, padding, getVisibleGlyphs]);

  // Fonction pour obtenir les bounds du viewport
  const getViewportBounds = useCallback((svg, viewportGroup) => {
    if (!svg || !viewportGroup) return null;
    
    const transform = d3.zoomTransform(svg.node());
    const svgRect = svg.node().getBoundingClientRect();
    
    return {
      x: -transform.x / transform.k,
      y: -transform.y / transform.k,
      width: svgRect.width / transform.k,
      height: svgRect.height / transform.k,
      scale: transform.k
    };
  }, []);

  return {
    visiblePositions,
    getViewportBounds,
    totalCount: positions.length,
    visibleCount: visiblePositions.length
  };
};

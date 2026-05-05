import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { useFontMapStore } from '../../../store/fontMapStore';

const SCALE_EXTENT = [0.4, 10.0];
const INITIAL_SCALE = 0.8;
const TRANSITION_DURATION = 750;

/**
 * Hook de zoom basé sur DebugUMAP.
 * Fonctionne avec un SVG viewBox → antialiasing natif.
 *
 * Le handler sélectionne .viewport-group dynamiquement pour rester
 * compatible avec useMapRenderer qui peut le recréer.
 */
export function useMapZoom(svgRef, enabled = true) {
  const zoomRef = useRef(null);

  useEffect(() => {
    if (!enabled || !svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // Le viewport-group doit exister (créé par useMapRenderer)
    if (svg.select('.viewport-group').empty()) return;

    // Nettoyer un éventuel zoom précédent
    svg.on('.zoom', null);

    const zoom = d3.zoom()
      .scaleExtent(SCALE_EXTENT)
      .on('zoom', (event) => {
        svg.select('.viewport-group').attr('transform', event.transform);
        svg.select('.highlight-group').attr('transform', event.transform);
        svg.select('.centroids-group').attr('transform', event.transform);
        if (window.updateTooltipTransform) window.updateTooltipTransform(event.transform);
        if (window.updateTooltipPositions) window.updateTooltipPositions();
      });

    svg.call(zoom);

    // Zoom initial centré à 80 %
    const svgRect = svg.node().getBoundingClientRect();
    const cx = svgRect.width / 2;
    const cy = svgRect.height / 2;
    const initialTransform = d3.zoomIdentity
      .translate(cx * (1 - INITIAL_SCALE), cy * (1 - INITIAL_SCALE))
      .scale(INITIAL_SCALE);
    svg.call(zoom.transform, initialTransform);

    zoomRef.current = zoom;

    // Fonctions globales pour ZoomControls
    window.zoomIn = () => svg.transition().duration(200).call(zoom.scaleBy, 1.5);
    window.zoomOut = () => svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.5);
    window.resetZoom = () => {
      const rect = svg.node().getBoundingClientRect();
      const rcx = rect.width / 2;
      const rcy = rect.height / 2;
      const t = d3.zoomIdentity
        .translate(rcx * (1 - INITIAL_SCALE), rcy * (1 - INITIAL_SCALE))
        .scale(INITIAL_SCALE);
      const store = useFontMapStore.getState();
      store.setIsTransitioning(true);
      store.setHoveredFont(null);
      svg.transition().duration(TRANSITION_DURATION).call(zoom.transform, t)
        .on('end', () => {
          useFontMapStore.getState().setIsTransitioning(false);
        });
    };

    const svgNode = svgRef.current;
    return () => {
      if (svgNode) d3.select(svgNode).on('.zoom', null);
      delete window.zoomIn;
      delete window.zoomOut;
      delete window.resetZoom;
      zoomRef.current = null;
    };
  }, [enabled, svgRef]);

  const centerOnFont = useCallback((font) => {
    if (!font || !zoomRef.current || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const glyphGroup = svg.select(`g.glyph-group[data-font-id="${font.id}"]`);
    if (glyphGroup.empty()) return;

    const transformAttr = glyphGroup.attr('data-original-transform');
    if (!transformAttr) return;

    const match = transformAttr.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (!match) return;

    const fontX = parseFloat(match[1]);
    const fontY = parseFloat(match[2]);

    const svgNode = svgRef.current;
    const width = svgNode.clientWidth || svgNode.getBoundingClientRect().width;
    const height = svgNode.clientHeight || svgNode.getBoundingClientRect().height;

    const scale = 4.0;
    const translateX = width / 2 - fontX * scale;
    const translateY = height / 2 - fontY * scale;

    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);

    const store = useFontMapStore.getState();
    store.setIsTransitioning(true);
    store.setHoveredFont(null);

    svg.transition()
      .duration(800)
      .ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform, transform)
      .on('end', () => {
        useFontMapStore.getState().setIsTransitioning(false);
      });
  }, [svgRef]);

  const resetZoom = useCallback(() => {
    if (window.resetZoom) window.resetZoom();
  }, []);

  return { centerOnFont, resetZoom };
}

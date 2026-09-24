import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { useFontMapStore } from '../../../store/fontMapStore';
import { REF_WIDTH, REF_HEIGHT } from './useMapRenderer';

const INITIAL_SCALE = 0.8;
// Min scale = reset scale — user can't zoom out past the initial framing.
const SCALE_EXTENT = [INITIAL_SCALE, 10.0];
const TRANSITION_DURATION = 750;

// Everything (zoom transform, extents, centering) works in the fixed
// reference-canvas coordinates. d3.zoom reads pointer positions through the
// SVG viewBox, so gestures land in the same space at any window size.
const INITIAL_TRANSFORM = d3.zoomIdentity
  .translate(
    (REF_WIDTH / 2) * (1 - INITIAL_SCALE),
    (REF_HEIGHT / 2) * (1 - INITIAL_SCALE)
  )
  .scale(INITIAL_SCALE);

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
      .translateExtent([[0, 0], [REF_WIDTH, REF_HEIGHT]])
      .on('zoom', (event) => {
        svg.select('.viewport-group').attr('transform', event.transform);
        svg.select('.highlight-group').attr('transform', event.transform);
        svg.select('.centroids-group').attr('transform', event.transform);
        if (window.updateCentroidLabels) window.updateCentroidLabels();
        if (window.updateTooltipTransform) window.updateTooltipTransform(event.transform);
        if (window.updateTooltipPositions) window.updateTooltipPositions();
      });

    svg.call(zoom);
    svg.call(zoom.transform, INITIAL_TRANSFORM);

    zoomRef.current = zoom;

    // Fonctions globales pour ZoomControls
    window.zoomIn = () => svg.transition().duration(200).call(zoom.scaleBy, 1.5);
    window.zoomOut = () => svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.5);
    window.resetZoom = () => {
      const store = useFontMapStore.getState();
      store.setIsTransitioning(true);
      store.setHoveredFont(null);
      svg.transition().duration(TRANSITION_DURATION).call(zoom.transform, INITIAL_TRANSFORM)
        .on('end', () => {
          useFontMapStore.getState().setIsTransitioning(false);
        });
    };

    // Pan (keeping the current scale) so the glyph lands in the middle of the
    // visible map area, i.e. below the fixed mobile top strip, then call onEnd.
    window.panToGlyph = (glyphNode, onEnd) => {
      const svgNode = svgRef.current;
      const ctm = svgNode && svgNode.getScreenCTM();
      if (!glyphNode || !ctm) { onEnd && onEnd(); return; }

      const r = glyphNode.getBoundingClientRect();
      const sidebar = document.querySelector('.sidebar');
      const top = sidebar ? sidebar.getBoundingClientRect().bottom : 0;
      const dx = window.innerWidth / 2 - (r.left + r.width / 2);
      const dy = top + (window.innerHeight - top) / 2 - (r.top + r.height / 2);

      if (Math.hypot(dx, dy) < 24) { onEnd && onEnd(); return; }

      const t = d3.zoomTransform(svgNode);
      const target = d3.zoomIdentity
        .translate(t.x + dx / ctm.a, t.y + dy / ctm.d)
        .scale(t.k);

      svg.transition()
        .duration(350)
        .ease(d3.easeCubicOut)
        .call(zoom.transform, target)
        .on('end', () => onEnd && onEnd());
    };

    const svgNode = svgRef.current;
    return () => {
      if (svgNode) d3.select(svgNode).on('.zoom', null);
      delete window.zoomIn;
      delete window.zoomOut;
      delete window.resetZoom;
      delete window.panToGlyph;
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

    // Center in reference-canvas coordinates (same space as the transform).
    const scale = 4.0;
    const translateX = REF_WIDTH / 2 - fontX * scale;
    const translateY = REF_HEIGHT / 2 - fontY * scale;

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

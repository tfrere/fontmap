import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { useFontMapStore } from '../../../store/fontMapStore';
import { REF_WIDTH, REF_HEIGHT } from './useMapRenderer';

// Desktop frames the map tighter: the sidebar already narrows the map area,
// so the looser mobile framing leaves too much empty space around it.
const MOBILE_INITIAL_SCALE = 0.8;
const DESKTOP_INITIAL_SCALE = 0.92;
const MOBILE_QUERY = '(max-width: 768px)';
const MAX_SCALE = 10.0;
const TRANSITION_DURATION = 750;
const MOBILE_TAP_SCALE = 3.0;

function getInitialScale() {
  return window.matchMedia(MOBILE_QUERY).matches ? MOBILE_INITIAL_SCALE : DESKTOP_INITIAL_SCALE;
}

// Everything (zoom transform, extents, centering) works in the fixed
// reference-canvas coordinates. d3.zoom reads pointer positions through the
// SVG viewBox, so gestures land in the same space at any window size.
function getInitialTransform(scale) {
  return d3.zoomIdentity
    .translate((REF_WIDTH / 2) * (1 - scale), (REF_HEIGHT / 2) * (1 - scale))
    .scale(scale);
}

/**
 * Map zoom hook.
 * Works on an SVG viewBox, so antialiasing is native.
 *
 * The handler selects .viewport-group dynamically to stay
 * compatible with useMapRenderer, which may recreate it.
 */
export function useMapZoom(svgRef, enabled = true) {
  const zoomRef = useRef(null);

  useEffect(() => {
    if (!enabled || !svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // The viewport-group must exist (created by useMapRenderer)
    if (svg.select('.viewport-group').empty()) return;

    // Clean up any previous zoom
    svg.on('.zoom', null);

    // Min scale = reset scale: the user can't zoom out past the initial framing.
    const initialScale = getInitialScale();
    const zoom = d3.zoom()
      .scaleExtent([initialScale, MAX_SCALE])
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
    svg.call(zoom.transform, getInitialTransform(initialScale));

    zoomRef.current = zoom;

    // Global functions for ZoomControls
    window.zoomIn = () => svg.transition().duration(200).call(zoom.scaleBy, 1.5);
    window.zoomOut = () => svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.5);
    window.resetZoom = () => {
      const store = useFontMapStore.getState();
      store.setIsTransitioning(true);
      store.setHoveredFont(null);
      svg.transition().duration(TRANSITION_DURATION).call(zoom.transform, getInitialTransform(initialScale))
        .on('end', () => {
          useFontMapStore.getState().setIsTransitioning(false);
        });
    };

    // Zoom in (never out) and pan so the glyph lands in the middle of the
    // visible map area, i.e. below the fixed mobile top strip, then call onEnd.
    window.panToGlyph = (glyphNode, onEnd) => {
      const svgNode = svgRef.current;
      const ctm = svgNode && svgNode.getScreenCTM();
      if (!glyphNode || !ctm) { onEnd && onEnd(); return; }

      const r = glyphNode.getBoundingClientRect();
      const sidebar = document.querySelector('.sidebar');
      const top = sidebar ? sidebar.getBoundingClientRect().bottom : 0;
      const targetX = window.innerWidth / 2;
      const targetY = top + (window.innerHeight - top) / 2;
      const glyphX = r.left + r.width / 2;
      const glyphY = r.top + r.height / 2;

      const t = d3.zoomTransform(svgNode);
      const k = Math.max(t.k, MOBILE_TAP_SCALE);

      if (k === t.k && Math.hypot(targetX - glyphX, targetY - glyphY) < 24) {
        onEnd && onEnd();
        return;
      }

      // Screen -> reference-canvas coordinates, then solve k * p + t' = target
      // for the glyph's untransformed position p.
      const toRef = (x, y) => [(x - ctm.e) / ctm.a, (y - ctm.f) / ctm.d];
      const [gx, gy] = toRef(glyphX, glyphY);
      const [tx, ty] = toRef(targetX, targetY);
      const px = (gx - t.x) / t.k;
      const py = (gy - t.y) / t.k;

      const target = d3.zoomIdentity.translate(tx - k * px, ty - k * py).scale(k);

      useFontMapStore.getState().setIsTransitioning(true);
      svg.transition()
        .duration(k === t.k ? 350 : 600)
        .ease(d3.easeCubicInOut)
        .call(zoom.transform, target)
        .on('end', () => {
          useFontMapStore.getState().setIsTransitioning(false);
          onEnd && onEnd();
        })
        .on('interrupt', () => useFontMapStore.getState().setIsTransitioning(false));
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

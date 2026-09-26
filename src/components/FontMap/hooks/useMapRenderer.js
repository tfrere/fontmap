import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useFontMapStore } from '../../../store/fontMapStore';
import { filterFonts } from '../utils/fontUtils';
import { CATEGORY_COLORS, FALLBACK_CATEGORY_COLOR } from '../utils/categories';

const GLYPH_SCALE = 0.25;

// Fixed reference canvas. The map is laid out ONCE against this space, and
// the SVG viewBox + preserveAspectRatio (default "xMidYMid meet") fit it
// into the real viewport with a uniform scale - like an image in
// object-fit: contain. The layout never re-flows with the screen's aspect
// ratio, so glyph size stays proportional to the map at any window size.
export const REF_WIDTH = 1600;
export const REF_HEIGHT = 900;

// Category labels: constant on-screen size (map-style UX). Labels follow
// their anchor on the map but never scale with zoom or window size, so they
// stay readable everywhere. They fade out when zooming close, where cluster
// names would only occlude the glyphs.
const LABEL_SCREEN_PX = 13;
const LABEL_HALO_RATIO = 0.5;
const LABEL_FADE_START = 2.2;
const LABEL_FADE_END = 3.2;

function getGlyphColor(category, useCategoryColors, darkMode) {
  if (useCategoryColors) {
    return CATEGORY_COLORS[category] || FALLBACK_CATEGORY_COLOR;
  }
  return darkMode ? '#ffffff' : '#333333';
}

function calculateMappingDimensions(fonts, width, height, padding = 40) {
  const xValues = fonts.map(d => d.x);
  const yValues = fonts.map(d => d.y);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  // Fit-to-aspect: use the smallest scale that keeps the whole data extent
  // inside the reference canvas, and letterbox the spare axis. The map keeps
  // the data's own shape.
  const dataW = xMax - xMin;
  const dataH = yMax - yMin;
  const availW = Math.max(1, width - 2 * padding);
  const availH = Math.max(1, height - 2 * padding);
  const scale = Math.min(availW / dataW, availH / dataH);
  const offsetX = (width - dataW * scale) / 2;
  const offsetY = (height - dataH * scale) / 2;

  const mapX = (x) => (x - xMin) * scale + offsetX;
  const mapY = (y) => (yMax - y) * scale + offsetY;

  return { mapX, mapY };
}

// The sprite is keyed off the slugified font name (often imageName),
// not always the short id. Fall back to the imageName-derived key.
function lookupPath(paths, font) {
  const imgKey = (font.imageName || font.name || '').toLowerCase();
  return paths[`${font.id}_a`]
    || paths[font.id]
    || paths[`${imgKey}_a`]
    || paths[imgKey];
}

function getOrCreateViewportGroup(svg) {
  let vg = svg.select('.viewport-group');
  if (vg.empty()) {
    vg = svg.append('g').attr('class', 'viewport-group');
  }
  return vg;
}

/**
 * Map renderer: draws from the preloaded SVG sprite (no network request).
 */
export function useMapRenderer({ svgRef, fonts, glyphPaths, displayPaths, filter, searchTerm, styleTag = null, darkMode, loading, enabled = true, isMobile = false }) {
  const mappingRef = useRef({ mapX: null, mapY: null });
  const dimensionsRef = useRef({ width: REF_WIDTH, height: REF_HEIGHT });
  // Flips to true once every glyph node of the first render is in the SVG.
  const [hasRendered, setHasRendered] = useState(false);
  const selectedFontRef = useRef(null);
  const displayPathsRef = useRef(displayPaths);
  displayPathsRef.current = displayPaths;

  // Per-slice selectors - this hook must not re-render on hoveredFont changes.
  const selectedFont = useFontMapStore((s) => s.selectedFont);
  const setSelectedFont = useFontMapStore((s) => s.setSelectedFont);
  const setHoveredFont = useFontMapStore((s) => s.setHoveredFont);
  const useCategoryColors = useFontMapStore((s) => s.useCategoryColors);

  selectedFontRef.current = selectedFont;
  // Read at build time only: theme and color toggles are applied in place by
  // the color effect, so they must not rebuild the glyphs (and drop filters).
  const colorModeRef = useRef({ darkMode, useCategoryColors });
  colorModeRef.current = { darkMode, useCategoryColors };
  // Bumped after each full rebuild so filter/selection state is re-applied.
  const [renderVersion, setRenderVersion] = useState(0);

  // ── Main render: synchronous from the sprite, no fetch ──
  useEffect(() => {
    if (!enabled || !fonts || fonts.length === 0 || !svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // Constant viewBox on the reference canvas: the browser fits (and
    // re-fits on window resize) the whole map uniformly, no JS needed.
    svg
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${REF_WIDTH} ${REF_HEIGHT}`);

    const viewportGroup = getOrCreateViewportGroup(svg);
    viewportGroup.selectAll('g.glyph-group').remove();

    const { mapX, mapY } = calculateMappingDimensions(fonts, REF_WIDTH, REF_HEIGHT);
    mappingRef.current = { mapX, mapY };

    const hasSprite = glyphPaths && Object.keys(glyphPaths).length > 0;
    const paths = displayPathsRef.current || glyphPaths;
    const vgNode = viewportGroup.node();
    const ns = 'http://www.w3.org/2000/svg';
    const { darkMode, useCategoryColors } = colorModeRef.current;

    fonts.forEach(font => {
      const pathD = hasSprite ? lookupPath(paths, font) : null;
      if (!pathD) return;

      const x = mapX(font.x);
      const y = mapY(font.y);
      const color = getGlyphColor(font.family, useCategoryColors, darkMode);

      const g = document.createElementNS(ns, 'g');
      g.setAttribute('transform', `translate(${x}, ${y}) scale(${GLYPH_SCALE})`);
      g.setAttribute('data-original-transform', `translate(${x}, ${y})`);
      g.setAttribute('data-font', font.name);
      g.setAttribute('data-font-id', font.id);
      g.setAttribute('data-font-name', font.name);
      g.setAttribute('data-category', font.family);
      g.setAttribute('class', 'glyph-group');
      g.style.cursor = 'pointer';

      const hitbox = document.createElementNS(ns, 'circle');
      hitbox.setAttribute('class', 'glyph-hitbox');
      hitbox.setAttribute('cx', '40');
      hitbox.setAttribute('cy', '40');
      hitbox.setAttribute('r', '44');
      hitbox.setAttribute('fill', 'transparent');
      hitbox.setAttribute('pointer-events', 'all');
      g.appendChild(hitbox);

      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('fill', color);
      path.setAttribute('pointer-events', 'none');
      g.appendChild(path);

      vgNode.appendChild(g);
    });

    setHasRendered(true);
    setRenderVersion(v => v + 1);
  }, [enabled, fonts, glyphPaths, svgRef]);

  // ── Glyph switch: swap paths in place (viewport + highlight clone) so
  // layout, zoom, selection and filter state are untouched ──
  useEffect(() => {
    if (!svgRef.current || !displayPaths || !fonts || fonts.length === 0) return;
    const fontById = new Map(fonts.map(f => [f.id, f]));
    svgRef.current.querySelectorAll('g.glyph-group').forEach(group => {
      const font = fontById.get(group.getAttribute('data-font-id'));
      const pathD = font && lookupPath(displayPaths, font);
      const path = group.querySelector('path');
      if (pathD && path && path.getAttribute('d') !== pathD) path.setAttribute('d', pathD);
    });
  }, [displayPaths, fonts, svgRef]);

  // ── Color updates (dark mode / category colors toggle) ──
  // Iterate over every g.glyph-group in the SVG (viewport + highlight clone)
  // so the focused letter follows the toggles too.
  useEffect(() => {
    if (!svgRef.current) return;

    svgRef.current.querySelectorAll('g.glyph-group').forEach(group => {
      const category = group.getAttribute('data-category');
      const color = getGlyphColor(category, useCategoryColors, darkMode);
      group.querySelectorAll('path').forEach(el => {
        el.setAttribute('fill', color);
      });
    });
  }, [darkMode, useCategoryColors, svgRef]);

  // ── Category centroid labels on the map ──
  useEffect(() => {
    if (!svgRef.current || !fonts || fonts.length === 0) return;
    const svg = d3.select(svgRef.current);
    const viewportGroup = svg.select('.viewport-group');
    if (viewportGroup.empty()) return;

    // Labels go in a sibling group AFTER viewport-group so they render on top
    svg.selectAll('.centroids-group').remove();

    const { mapX, mapY } = mappingRef.current;
    if (!mapX || !mapY) return;

    const centroids = {};
    fonts.forEach(font => {
      const cat = font.family;
      if (!centroids[cat]) centroids[cat] = { x: 0, y: 0, n: 0 };
      centroids[cat].x += font.x;
      centroids[cat].y += font.y;
      centroids[cat].n += 1;
    });

    // Copy the current viewport transform so labels follow zoom/pan
    const currentTransform = viewportGroup.attr('transform') || '';
    const centroidsGroup = svg.append('g')
      .attr('class', 'centroids-group')
      .attr('transform', currentTransform)
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    const fillColor = useCategoryColors
      ? null
      : (darkMode ? '#ffffff' : '#000000');
    const haloColor = darkMode ? '#000000' : '#ffffff';

    Object.entries(centroids).forEach(([cat, c]) => {
      const x = mapX(c.x / c.n);
      const y = mapY(c.y / c.n);
      const color = fillColor || (CATEGORY_COLORS[cat] || FALLBACK_CATEGORY_COLOR);

      centroidsGroup.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .attr('font-weight', 'bold')
        .attr('fill', color)
        .attr('stroke', haloColor)
        .attr('paint-order', 'stroke fill')
        .attr('class', 'centroid-label')
        .text(cat);
    });

    // Keep labels at a constant on-screen size: convert the desired pixel
    // size into reference units by undoing both the zoom scale (k) and the
    // viewBox contain-fit factor. Called on every zoom event and on resize.
    const svgNode = svgRef.current;
    const updateLabels = () => {
      const rect = svgNode.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const fit = Math.min(rect.width / REF_WIDTH, rect.height / REF_HEIGHT);
      const k = d3.zoomTransform(svgNode).k || 1;
      const fontSize = LABEL_SCREEN_PX / (k * fit);

      let opacity = 1;
      if (k >= LABEL_FADE_END) opacity = 0;
      else if (k > LABEL_FADE_START) {
        opacity = 1 - (k - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START);
      }

      // Focus mode (a font is selected): labels are hidden at once, whatever the zoom
      const focused = !!useFontMapStore.getState().selectedFont;
      centroidsGroup.style('display', focused ? 'none' : null);
      if (focused) return;

      centroidsGroup.selectAll('.centroid-label')
        .attr('font-size', fontSize)
        .attr('stroke-width', fontSize * LABEL_HALO_RATIO)
        .style('opacity', opacity);
    };

    updateLabels();
    window.updateCentroidLabels = updateLabels;

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateLabels);
      resizeObserver.observe(svgNode);
    }

    // React to selection straight from the store, without waiting for a render
    const unsubscribe = useFontMapStore.subscribe((state, prev) => {
      if (!!state.selectedFont !== !!prev.selectedFont) updateLabels();
    });

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      unsubscribe();
      delete window.updateCentroidLabels;
    };
  }, [fonts, useCategoryColors, darkMode, svgRef]);

  // ── Visual isolation (selection) + opacity (filter/search) ──
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const viewportGroup = svg.select('.viewport-group');
    if (viewportGroup.empty()) return;

    // Always clear the previous highlight
    svg.selectAll('.highlight-group').remove();

    if (selectedFont) {
      // ── Isolation mode: dim the whole group (a single DOM op) ──
      viewportGroup.attr('opacity', 0.1);

      // Clone the selected glyph into a sibling group outside the dimmed one
      const selectedGlyph = viewportGroup.select(
        `g.glyph-group[data-font-id="${selectedFont.id}"]`
      );

      if (!selectedGlyph.empty()) {
        const currentTransform = viewportGroup.attr('transform') || '';
        const highlightGroup = svg.append('g')
          .attr('class', 'highlight-group')
          .attr('transform', currentTransform)
          .style('pointer-events', 'none');

        const clone = selectedGlyph.node().cloneNode(true);
        clone.setAttribute('opacity', '1');
        highlightGroup.node().appendChild(clone);
      }

      // Every glyph stays clickable to change the selection
      viewportGroup.selectAll('g.glyph-group')
        .style('pointer-events', 'all');
    } else {
      // ── Normal mode: restore the group opacity ──
      viewportGroup.attr('opacity', 1);

      const hasFilter = filter !== 'all' || searchTerm || styleTag;

      if (hasFilter) {
        const matchingIds = new Set(filterFonts(fonts || [], filter, searchTerm, styleTag).map(f => f.id));
        viewportGroup.selectAll('g.glyph-group').each(function () {
          const group = this;
          const match = matchingIds.has(group.getAttribute('data-font-id'));
          group.setAttribute('opacity', match ? '1' : '0.06');
          group.style.pointerEvents = match ? 'all' : 'none';
        });
      } else {
        // No filter: remove the opacity attributes (SVG default = 1)
        viewportGroup.selectAll('g.glyph-group').each(function () {
          this.removeAttribute('opacity');
          this.style.pointerEvents = 'all';
        });
      }
    }

    // Category labels fade out in focus mode, together with the dimmed map
    if (window.updateCentroidLabels) window.updateCentroidLabels();
  }, [fonts, filter, searchTerm, styleTag, selectedFont, renderVersion, svgRef]);

  // ── Interactions: hover and click (event delegation) ──
  useEffect(() => {
    if (!svgRef.current || !fonts || fonts.length === 0) return;

    const svg = svgRef.current;

    const findGlyphGroup = (target) => {
      let el = target;
      while (el && el !== svg) {
        if (el.classList && el.classList.contains('glyph-group')) return el;
        el = el.parentElement;
      }
      return null;
    };

    const getFontFromGroup = (group) => {
      const fontId = group.getAttribute('data-font-id');
      return fonts.find(f => f.id === fontId) || null;
    };

    // Short debounce so sweeping the cursor across the map doesn't trigger a
    // tooltip (and its sentence-image fetch) for every glyph crossed.
    let hoverTimer = null;

    const handleMouseOver = (e) => {
      const state = useFontMapStore.getState();
      if (state.isTransitioning) return;
      // Mobile: ignore synthetic mouseover events - clicks handle everything
      // explicitly. Avoids flicker during pan/drag.
      if (isMobile) return;
      const group = findGlyphGroup(e.target);
      if (!group) return;
      const font = getFontFromGroup(group);
      if (!font) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => setHoveredFont(font), 80);
    };

    const handleMouseOut = (e) => {
      // On mobile, hover only happens on click - no mouseout.
      if (isMobile) return;
      if (useFontMapStore.getState().isTransitioning) return;
      const group = findGlyphGroup(e.target);
      if (!group) return;
      clearTimeout(hoverTimer);
      setHoveredFont(null);
    };

    const handleClick = (e) => {
      clearTimeout(hoverTimer);
      const group = findGlyphGroup(e.target);
      if (isMobile) {
        // Mobile:
        // - tap on a different glyph → switch the tooltip to that glyph
        // - tap on the same glyph → dismiss (toggle off)
        // - tap on empty space → dismiss
        // The Open button is handled by the delegated handler on the
        // tooltip itself (sibling of the SVG).
        const current = useFontMapStore.getState().hoveredFont;
        if (!group) {
          if (current) setHoveredFont(null);
          return;
        }
        const font = getFontFromGroup(group);
        if (!font) return;
        if (current && current.id === font.id) {
          setHoveredFont(null);
          return;
        }
        if (current) setHoveredFont(null);
        if (window.panToGlyph) {
          window.panToGlyph(group, () => setHoveredFont(font));
        } else {
          setHoveredFont(font);
        }
        return;
      }
      if (!group) {
        if (selectedFontRef.current) setSelectedFont(null);
        return;
      }
      const font = getFontFromGroup(group);
      if (!font) return;
      setHoveredFont(null);
      const cur = selectedFontRef.current;
      setSelectedFont(cur && cur.id === font.id ? null : font);
    };

    svg.addEventListener('mouseover', handleMouseOver);
    svg.addEventListener('mouseout', handleMouseOut);
    svg.addEventListener('click', handleClick);

    return () => {
      clearTimeout(hoverTimer);
      svg.removeEventListener('mouseover', handleMouseOver);
      svg.removeEventListener('mouseout', handleMouseOut);
      svg.removeEventListener('click', handleClick);
    };
  }, [fonts, setSelectedFont, setHoveredFont, svgRef, isMobile]);

  return { mappingRef, dimensionsRef, hasRendered };
}

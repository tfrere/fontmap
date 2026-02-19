import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useFontMapStore } from '../../../store/fontMapStore';

const GLYPH_SCALE = 0.25;

const CATEGORY_COLORS = {
  'sans-serif': '#3498db',
  'serif':      '#e74c3c',
  'display':    '#f39c12',
  'handwriting':'#9b59b6',
  'monospace':  '#2ecc71',
};

function getGlyphColor(category, useCategoryColors, darkMode) {
  if (useCategoryColors) {
    return CATEGORY_COLORS[category] || '#95a5a6';
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

  const mapX = (x) => ((x - xMin) / (xMax - xMin)) * (width - 2 * padding) + padding;
  const mapY = (y) => ((yMax - y) / (yMax - yMin)) * (height - 2 * padding) + padding;

  return { mapX, mapY };
}

function getOrCreateViewportGroup(svg) {
  let vg = svg.select('.viewport-group');
  if (vg.empty()) {
    vg = svg.append('g').attr('class', 'viewport-group');
  }
  return vg;
}

/**
 * Hook de rendu — utilise le sprite SVG pré-chargé (0 requête réseau).
 */
export function useMapRenderer({ svgRef, fonts, glyphPaths, filter, searchTerm, darkMode, loading, enabled = true }) {
  const mappingRef = useRef({ mapX: null, mapY: null });
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const hasRenderedRef = useRef(false);
  const selectedFontRef = useRef(null);

  const {
    selectedFont,
    setSelectedFont,
    setHoveredFont,
    useCategoryColors
  } = useFontMapStore();

  selectedFontRef.current = selectedFont;

  // ── Rendu principal : synchrone depuis le sprite, aucun fetch ──
  useEffect(() => {
    if (!enabled || !fonts || fonts.length === 0 || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const parentEl = svgRef.current.parentElement;
    if (!parentEl) return;

    const width = parentEl.clientWidth || window.innerWidth;
    const height = parentEl.clientHeight || window.innerHeight;
    dimensionsRef.current = { width, height };

    svg
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`);

    const viewportGroup = getOrCreateViewportGroup(svg);
    viewportGroup.selectAll('g.glyph-group').remove();

    const { mapX, mapY } = calculateMappingDimensions(fonts, width, height);
    mappingRef.current = { mapX, mapY };

    const hasSprite = glyphPaths && Object.keys(glyphPaths).length > 0;
    const vgNode = viewportGroup.node();
    const ns = 'http://www.w3.org/2000/svg';

    fonts.forEach(font => {
      const pathD = hasSprite ? glyphPaths[font.id] : null;
      if (!pathD) return;

      const x = mapX(font.x);
      const y = mapY(font.y);
      const color = getGlyphColor(font.family, useCategoryColors, darkMode);

      const g = document.createElementNS(ns, 'g');
      g.setAttribute('transform', `translate(${x}, ${y}) scale(${GLYPH_SCALE})`);
      g.setAttribute('data-original-transform', `translate(${x}, ${y})`);
      g.setAttribute('data-font-id', font.id);
      g.setAttribute('data-font-name', font.name);
      g.setAttribute('data-category', font.family);
      g.setAttribute('class', 'glyph-group');
      g.style.cursor = 'pointer';

      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('fill', color);
      g.appendChild(path);

      vgNode.appendChild(g);
    });

    hasRenderedRef.current = true;
  }, [enabled, fonts, glyphPaths, darkMode, useCategoryColors, svgRef]);

  // ── Mise à jour des couleurs (dark mode / category colors toggle) ──
  useEffect(() => {
    if (!svgRef.current) return;
    const viewportGroup = svgRef.current.querySelector('.viewport-group');
    if (!viewportGroup) return;

    viewportGroup.querySelectorAll('g.glyph-group').forEach(group => {
      const category = group.getAttribute('data-category');
      const color = getGlyphColor(category, useCategoryColors, darkMode);
      group.querySelectorAll('*').forEach(el => {
        if (el.nodeType === Node.ELEMENT_NODE) {
          el.setAttribute('fill', color);
        }
      });
    });
  }, [darkMode, useCategoryColors, svgRef]);

  // ── Labels centroïdes sur la map ──
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

    Object.entries(centroids).forEach(([cat, c]) => {
      const x = mapX(c.x / c.n);
      const y = mapY(c.y / c.n);
      const color = fillColor || (CATEGORY_COLORS[cat] || '#95a5a6');

      centroidsGroup.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', color)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', '8px')
        .attr('paint-order', 'stroke fill')
        .attr('class', 'centroid-label')
        .text(cat);
    });
  }, [fonts, useCategoryColors, darkMode, svgRef]);

  // ── Isolation visuelle (sélection) + opacité (filtre/recherche) ──
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const viewportGroup = svg.select('.viewport-group');
    if (viewportGroup.empty()) return;

    // Toujours nettoyer le highlight précédent
    svg.selectAll('.highlight-group').remove();

    if (selectedFont) {
      // ── Mode isolation : dim le groupe entier (1 seule op DOM) ──
      viewportGroup.attr('opacity', 0.1);

      // Cloner le glyphe sélectionné dans un groupe frère hors du dim
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

      // Tous les glyphes restent cliquables pour changer de sélection
      viewportGroup.selectAll('g.glyph-group')
        .style('pointer-events', 'all');
    } else {
      // ── Mode normal : restaurer l'opacité du groupe ──
      viewportGroup.attr('opacity', 1);

      const hasFilter = filter !== 'all' || searchTerm;

      if (hasFilter) {
        const searchLower = searchTerm ? searchTerm.toLowerCase() : '';
        viewportGroup.selectAll('g.glyph-group').each(function () {
          const group = this;
          const fontFamily = group.getAttribute('data-category');
          const fontName = group.getAttribute('data-font-name');

          const familyMatch = filter === 'all' || fontFamily === filter;
          const searchMatch = !searchLower ||
            (fontName && fontName.toLowerCase().includes(searchLower)) ||
            (fontFamily && fontFamily.toLowerCase().includes(searchLower));

          const match = familyMatch && searchMatch;
          group.setAttribute('opacity', match ? '1' : '0.06');
          group.style.pointerEvents = match ? 'all' : 'none';
        });
      } else {
        // Aucun filtre → retirer les attributs d'opacité (état par défaut SVG = 1)
        viewportGroup.selectAll('g.glyph-group').each(function () {
          this.removeAttribute('opacity');
          this.style.pointerEvents = 'all';
        });
      }
    }
  }, [filter, searchTerm, selectedFont, svgRef]);

  // ── Interactions : hover et click (délégation d'événements) ──
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

    const handleMouseOver = (e) => {
      if (useFontMapStore.getState().isTransitioning) return;
      const group = findGlyphGroup(e.target);
      if (!group) return;
      const font = getFontFromGroup(group);
      if (font) setHoveredFont(font);
    };

    const handleMouseOut = (e) => {
      if (useFontMapStore.getState().isTransitioning) return;
      const group = findGlyphGroup(e.target);
      if (!group) return;
      setHoveredFont(null);
    };

    const handleClick = (e) => {
      const group = findGlyphGroup(e.target);
      if (!group) {
        if (selectedFontRef.current) setSelectedFont(null);
        return;
      }
      const font = getFontFromGroup(group);
      if (font) {
        setHoveredFont(null);
        const cur = selectedFontRef.current;
        setSelectedFont(cur && cur.id === font.id ? null : font);
      }
    };

    svg.addEventListener('mouseover', handleMouseOver);
    svg.addEventListener('mouseout', handleMouseOut);
    svg.addEventListener('click', handleClick);

    return () => {
      svg.removeEventListener('mouseover', handleMouseOver);
      svg.removeEventListener('mouseout', handleMouseOut);
      svg.removeEventListener('click', handleClick);
    };
  }, [fonts, setSelectedFont, setHoveredFont, svgRef]);

  return { mappingRef, dimensionsRef };
}

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { createGlyphTransform } from '../utils/mappingUtils.js';

/**
 * Simplified glyph renderer for FontMapV2
 * Uses pre-extracted glyph paths from useStaticFontData
 */
export function useGlyphRendererV2({ svgRef, fonts, glyphPaths, darkMode, baseGlyphSize = 1.0 }) {
    const abortControllerRef = useRef(null);

    useEffect(() => {
        if (!svgRef.current || !fonts || fonts.length === 0 || !glyphPaths) {
            console.log('useGlyphRendererV2: Missing required data');
            return;
        }

        // Cleanup previous
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const svg = svgRef.current;

        // Get or create viewport group
        let viewportGroup = d3.select(svg).select('.viewport-group');
        if (viewportGroup.empty()) {
            console.warn('useGlyphRendererV2: viewport-group not found, this should have been created already');
            viewportGroup = d3.select(svg).append('g').attr('class', 'viewport-group');
        } else {
            viewportGroup.selectAll('g.glyph-group').remove();
        }

        console.log(`✅ Rendering ${fonts.length} glyphs with ${Object.keys(glyphPaths).length} paths`);

        // Render all glyphs directly (no batching needed since paths are already loaded)
        fonts.forEach(font => {
            renderGlyph(viewportGroup, font, glyphPaths, baseGlyphSize, darkMode);
        });

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [svgRef, fonts, glyphPaths, darkMode, baseGlyphSize]);

    return {};
}

/**
 * Render a single glyph using direct path from glyphPaths
 */
function renderGlyph(viewportGroup, font, glyphPaths, baseGlyphSize, darkMode) {
    // Create group for this glyph  
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const transform = createGlyphTransform(font.x, font.y, baseGlyphSize);

    group.setAttribute('transform', transform);
    group.setAttribute('data-original-transform', transform);
    group.setAttribute('data-category', font.family);
    group.setAttribute('data-font-id', font.id);
    group.setAttribute('class', 'glyph-group');

    // The sprite keys are in format: {font-id}_a
    const pathId = `${font.id}_a`;
    const pathData = glyphPaths[pathId];

    if (pathData) {
        // Create path element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', darkMode ? '#ffffff' : '#000000');
        group.appendChild(path);
    } else {
        // Log missing for debugging
        if (Math.random() < 0.01) {
            console.warn('Missing path for:', pathId, 'Available sample:', Object.keys(glyphPaths).slice(0, 3));
        }
    }

    // Add to viewport
    viewportGroup.node().appendChild(group);
}

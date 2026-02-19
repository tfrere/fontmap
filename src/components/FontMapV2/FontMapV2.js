import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { useStaticFontData } from '../../hooks/useStaticFontData';
import { useGlyphRendererV2 } from './hooks/useGlyphRendererV2';
import { useZoomV2 } from './hooks/useZoomV2';
import { calculateMappingDimensions } from './utils/mappingUtils';
import './FontMapV2.css';

/**
 * FontMapV2 - Clean implementation using DebugUMAP's proven rendering approach
 * Phase 1: Just the map with working rendering
 */
const FontMapV2 = ({ darkMode = false }) => {
    const svgRef = useRef(null);
    const { fonts, glyphPaths, loading, error } = useStaticFontData();

    // Calculate mapped coordinates
    const mappedFonts = React.useMemo(() => {
        if (!fonts || fonts.length === 0) return [];

        const { mapX, mapY } = calculateMappingDimensions(fonts);

        return fonts.map(font => ({
            ...font,
            x: mapX(font.x),
            y: mapY(font.y)
        }));
    }, [fonts]);

    // Initialize SVG and viewport group
    useEffect(() => {
        if (!svgRef.current) {
            console.log('FontMapV2: svgRef not ready');
            return;
        }

        const svg = svgRef.current;
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.backgroundColor = darkMode ? '#1a1a1a' : '#ffffff';

        // Create viewport group if it doesn't exist
        const d3svg = d3.select(svg);
        if (d3svg.select('.viewport-group').empty()) {
            d3svg.append('g').attr('class', 'viewport-group');
            console.log('✅ FontMapV2: Created viewport-group');
        } else {
            console.log('FontMapV2: viewport-group already exists');
        }
    }, [darkMode]);

    // Setup zoom FIRST (before rendering glyphs)
    useZoomV2(svgRef, darkMode);

    // Render glyphs AFTER zoom is set up
    useGlyphRendererV2({
        svgRef,
        fonts: mappedFonts,
        glyphPaths,
        darkMode,
        baseGlyphSize: 0.2 // Small base size since we're using 80x80 viewBox
    });

    if (loading) {
        return (
            <div className="fontmap-v2-container">
                <div className="loading">Loading FontMapV2...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fontmap-v2-container">
                <div className="error">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="fontmap-v2-container">
            <svg ref={svgRef} className="fontmap-v2-svg"></svg>
            <div className="info">
                <div>FontMapV2 - Phase 1</div>
                <div>{fonts.length} fonts loaded</div>
                <div>{Object.keys(glyphPaths).length} glyph paths</div>
            </div>
        </div>
    );
};

export default FontMapV2;

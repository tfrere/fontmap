import * as d3 from 'd3';

/**
 * Calculate mapping functions for font coordinates
 * Simplified version - just returns the scale functions
 */
export function calculateMappingDimensions(fonts, width = 2000, height = 2000) {
    const padding = 50;

    const xExtent = d3.extent(fonts, d => d.x);
    const yExtent = d3.extent(fonts, d => d.y);

    const mapX = d3.scaleLinear()
        .domain(xExtent)
        .range([padding, width - padding]);

    const mapY = d3.scaleLinear()
        .domain(yExtent)
        .range([padding, height - padding]);

    return { mapX, mapY };
}

/**
 * Create transform string for a glyph
 */
export function createGlyphTransform(x, y, scale = 1.0) {
    return `translate(${x}, ${y}) scale(${scale})`;
}

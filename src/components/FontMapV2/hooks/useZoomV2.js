import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

/**
 * Simplified zoom hook for FontMapV2
 */
export function useZoomV2(svgRef, darkMode = false) {
    const zoomRef = useRef(null);
    const isInitializedRef = useRef(false);

    useEffect(() => {
        if (isInitializedRef.current) {
            return;
        }

        const initializeZoom = () => {
            if (!svgRef.current) {
                console.log('useZoomV2: SVG not ready, retrying...');
                return false;
            }

            const svg = d3.select(svgRef.current);

            const viewportGroup = svg.select('.viewport-group');
            if (viewportGroup.empty()) {
                console.error('useZoomV2: viewport-group not found! Zoom will not work.');
                return false;
            }

            console.log('useZoomV2: Found viewport-group, setting up zoom...');

            // Create zoom behavior
            const zoom = d3.zoom()
                .scaleExtent([0.3, 5.0])
                .on('zoom', (event) => {
                    viewportGroup.attr('transform', event.transform);
                });

            // Apply zoom to SVG
            svg.call(zoom);

            // Calculate initial center based on viewport size
            const svgRect = svg.node().getBoundingClientRect();
            const centerX = svgRect.width / 2;
            const centerY = svgRect.height / 2;

            // Start at 80% zoom, centered
            const initialScale = 0.8;
            const initialTransform = d3.zoomIdentity
                .translate(centerX, centerY)
                .scale(initialScale)
                .translate(-1000, -1000); // Center of data space (2000x2000 with 50px padding)

            svg.call(zoom.transform, initialTransform);

            zoomRef.current = zoom;
            isInitializedRef.current = true;
            console.log('useZoomV2: Zoom initialized successfully');
            return true;
        };

        // Try to initialize immediately
        if (!initializeZoom()) {
            // If failed, retry after a short delay
            const timer = setTimeout(() => {
                initializeZoom();
            }, 100);

            return () => clearTimeout(timer);
        }

        return () => {
            if (svgRef.current) {
                d3.select(svgRef.current).on('.zoom', null);
            }
            zoomRef.current = null;
            isInitializedRef.current = false;
        };
    }, [svgRef, darkMode]);

    const resetZoom = () => {
        if (zoomRef.current && svgRef.current) {
            const svg = d3.select(svgRef.current);
            const width = svg.node().clientWidth;
            const height = svg.node().clientHeight;

            const centerX = width / 2;
            const centerY = height / 2;
            const scale = 0.8;

            const resetTransform = d3.zoomIdentity
                .translate(centerX, centerY)
                .scale(scale)
                .translate(-1000, -1000);

            svg.transition().duration(750).call(zoomRef.current.transform, resetTransform);
        }
    };

    return { resetZoom };
}

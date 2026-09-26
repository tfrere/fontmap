import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';

/**
 * Tooltip management hook
 * Keeps positioning and display logic separate
 */
export const useTooltipOptimized = (darkMode, isMobile = false, onOpenFont = null) => {
  const selectedTooltipRef = useRef(null);
  const hoverTooltipRef = useRef(null);
  const currentTransformRef = useRef(d3.zoomIdentity);
  const imageLoadTimeoutsRef = useRef(new Map());
  const currentFontRef = useRef(null);
  const onOpenFontRef = useRef(onOpenFont);
  useEffect(() => { onOpenFontRef.current = onOpenFont; }, [onOpenFont]);

  // Memoise the tooltip styles for the current theme
  const tooltipStyles = useMemo(() => ({
    dark: {
      backgroundColor: 'var(--color-bg-primary-dark)',
      borderColor: 'var(--color-border-primary-dark)',
      color: '#ffffff'
    },
    light: {
      backgroundColor: 'var(--color-bg-primary)',
      borderColor: 'var(--color-border-primary)',
      color: '#000000'
    }
  }), []);

  // Create the tooltip elements
  useEffect(() => {
    // Tooltip for the selected font
    selectedTooltipRef.current = d3.select('body')
      .append('div')
      .attr('class', 'font-tooltip font-tooltip-selected')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('z-index', 1001)
      .style('transition', 'opacity 0.2s ease');

    // Tooltip for the hovered font
    hoverTooltipRef.current = d3.select('body')
      .append('div')
      .attr('class', 'font-tooltip font-tooltip-hover')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('z-index', 1000)
      .style('transition', 'opacity 0.2s ease');

    // Mobile: click delegation for the Open button in the tooltip.
    // The button is only rendered on mobile (see createTooltipContent),
    // and it is the only element with pointer-events: auto.
    const onHoverClick = (e) => {
      if (!e.target.closest('.tooltip-open-btn')) return;
      const font = currentFontRef.current;
      const cb = onOpenFontRef.current;
      if (font && cb) cb(font);
    };
    const hoverNode = hoverTooltipRef.current.node();
    if (hoverNode) hoverNode.addEventListener('click', onHoverClick);

    return () => {
      if (hoverNode) hoverNode.removeEventListener('click', onHoverClick);
      d3.selectAll('.font-tooltip').remove();
      // Clear timeouts
      const currentTimeouts = imageLoadTimeoutsRef.current;
      currentTimeouts.forEach(timeout => clearTimeout(timeout));
      currentTimeouts.clear();
    };
  }, []);

  // Update styles for the current theme
  useEffect(() => {
    const updateTooltipStyles = (tooltip) => {
      if (!tooltip) return;
      
      tooltip.classed('dark-mode', darkMode);
      
      const styles = darkMode ? tooltipStyles.dark : tooltipStyles.light;
      tooltip
        .style('background-color', styles.backgroundColor)
        .style('border-color', styles.borderColor)
        .style('color', styles.color);
    };

    updateTooltipStyles(selectedTooltipRef.current);
    updateTooltipStyles(hoverTooltipRef.current);
  }, [darkMode, tooltipStyles]);

  // Build the tooltip content
  // No inline colors - everything is driven by CSS via .font-tooltip.dark-mode
  // so the dark/light toggle stays consistent while the tooltip is open.
  const createTooltipContent = useCallback((font) => {
    const imageName = font.imageName || font.name;
    const sentenceImagePath = `/data/sentences/${imageName.toLowerCase().replace(/\s+/g, '_')}_sentence.svg`;
    const openButton = isMobile
      ? `<button type="button" class="tooltip-open-btn">Open</button>`
      : '';

    return `
      <div class="simple-tooltip">
        <div class="tooltip-font-name">${font.name}</div>
        <div class="tooltip-sentence-preview">
          <div class="tooltip-image-container" style="position: relative; min-height: 44px; display: flex; align-items: center; justify-content: center;">
            <img src="${sentenceImagePath}"
                 alt=""
                 class="sentence-image"
                 style="max-width: 200px; height: auto; opacity: 0; transition: opacity 0.2s ease;"
                 onload="this.style.opacity='1'; this.parentElement.querySelector('.tooltip-spinner').style.display='none';"
                 onerror="this.style.display='none'; this.parentElement.querySelector('.tooltip-spinner').style.display='flex'; this.parentElement.querySelector('.tooltip-spinner').innerHTML='⚠️ Loading error';"
            />
            <div class="tooltip-spinner" style="display: flex; align-items: center; justify-content: center; font-size: 12px; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
              <div style="width: 16px; height: 16px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
              Loading...
            </div>
          </div>
        </div>
        ${openButton}
      </div>
    `;
  }, [isMobile]);

  // Position a tooltip
  const positionTooltip = useCallback((tooltip, svgElement) => {
    if (!tooltip || !svgElement) return;

    const tooltipNode = tooltip.node();
    const tooltipRect = tooltipNode.getBoundingClientRect();
    const elementRect = svgElement.getBoundingClientRect();

    // Tooltip just above the visible glyph (gap stays constant regardless
    // of zoom - elementRect already grows with zoom).
    const centerX = elementRect.left + (elementRect.width / 2);
    const gap = 6;

    let x = centerX - (tooltipRect.width / 2);
    let y = elementRect.top - tooltipRect.height - gap;

    // Keep the tooltip on screen
    const margin = 10;
    if (x < margin) x = margin;
    if (x + tooltipRect.width > window.innerWidth - margin) {
      x = window.innerWidth - tooltipRect.width - margin;
    }
    if (y < margin) {
      y = elementRect.bottom + gap;
    }

    tooltip
      .style('left', `${x}px`)
      .style('top', `${y}px`);
  }, []);

  // Show a tooltip
  const showTooltip = useCallback((tooltip, font, svgElement) => {
    if (!tooltip || !font) return;

    if (tooltip === hoverTooltipRef.current) currentFontRef.current = font;

    // Set content, measure and position synchronously, THEN fade in - avoids
    // the tooltip flashing at its previous position before jumping.
    tooltip.html(createTooltipContent(font));
    positionTooltip(tooltip, svgElement);
    tooltip.style('opacity', 1);
  }, [createTooltipContent, positionTooltip]);

  // Hide a tooltip
  const hideTooltip = useCallback((tooltip) => {
    if (!tooltip) return;
    tooltip.style('opacity', 0);
  }, []);

  // Update tooltip positions
  const updatePositions = useCallback(() => {
    const svg = d3.select('.fontmap-svg');
    if (svg.empty()) return;

    const viewportGroup = svg.select('.viewport-group');
    if (viewportGroup.empty()) return;

    // Selected tooltip
    if (selectedTooltipRef.current && selectedTooltipRef.current.style('opacity') !== '0') {
      const selectedName = window.currentSelectedFont?.name;
      if (selectedName) {
        const glyphElement = viewportGroup.node().querySelector(`[data-font="${CSS.escape(selectedName)}"]`);
        if (glyphElement) {
          positionTooltip(selectedTooltipRef.current, glyphElement);
        }
      }
    }

    // Hover tooltip
    if (hoverTooltipRef.current && hoverTooltipRef.current.style('opacity') !== '0') {
      const hoveredName = window.currentHoveredFont?.name;
      if (hoveredName) {
        const glyphElement = viewportGroup.node().querySelector(`[data-font="${CSS.escape(hoveredName)}"]`);
        if (glyphElement) {
          positionTooltip(hoverTooltipRef.current, glyphElement);
        }
      }
    }
  }, [positionTooltip]);

  // Update the transform
  const updateTransform = useCallback((transform) => {
    currentTransformRef.current = transform;
    setTimeout(() => {
      updatePositions();
    }, 0);
  }, [updatePositions]);

  // Handle font selection
  const handleFontSelect = useCallback((font, svgElement) => {
    if (!font) {
      hideTooltip(selectedTooltipRef.current);
      return;
    }

    hideTooltip(hoverTooltipRef.current);
    showTooltip(selectedTooltipRef.current, font, svgElement);
  }, [showTooltip, hideTooltip]);

  // Handle font hover
  const handleFontHover = useCallback((font, svgElement) => {
    if (!font) {
      hideTooltip(hoverTooltipRef.current);
      return;
    }

    showTooltip(hoverTooltipRef.current, font, svgElement);
  }, [showTooltip, hideTooltip]);

  // Handle hover end
  const handleFontUnhover = useCallback(() => {
    hideTooltip(hoverTooltipRef.current);
  }, [hideTooltip]);

  return {
    handleFontSelect,
    handleFontHover,
    handleFontUnhover,
    updateTransform,
    updatePositions
  };
};

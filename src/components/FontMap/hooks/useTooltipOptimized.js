import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';

/**
 * Hook optimisé pour la gestion des tooltips
 * Séparation claire entre logique de positionnement et affichage
 */
export const useTooltipOptimized = (darkMode, isMobile = false, onOpenFont = null) => {
  const selectedTooltipRef = useRef(null);
  const hoverTooltipRef = useRef(null);
  const currentTransformRef = useRef(d3.zoomIdentity);
  const imageLoadTimeoutsRef = useRef(new Map());
  const currentFontRef = useRef(null);
  const onOpenFontRef = useRef(onOpenFont);
  useEffect(() => { onOpenFontRef.current = onOpenFont; }, [onOpenFont]);

  // Mémoriser les styles du tooltip selon le mode sombre
  const tooltipStyles = useMemo(() => ({
    dark: {
      backgroundColor: '#000000',
      borderColor: '#404040',
      color: '#ffffff'
    },
    light: {
      backgroundColor: '#ffffff',
      borderColor: '#e0e0e0',
      color: '#000000'
    }
  }), []);

  // Créer les éléments tooltip
  useEffect(() => {
    // Tooltip pour la police sélectionnée
    selectedTooltipRef.current = d3.select('body')
      .append('div')
      .attr('class', 'font-tooltip font-tooltip-selected')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('z-index', 1001)
      .style('transition', 'opacity 0.2s ease');

    // Tooltip pour la police survolée
    hoverTooltipRef.current = d3.select('body')
      .append('div')
      .attr('class', 'font-tooltip font-tooltip-hover')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('z-index', 1000)
      .style('transition', 'opacity 0.2s ease');

    // Mobile: délégation de clic pour le bouton Open dans le tooltip.
    // Le bouton n'existe dans le HTML que sur mobile (cf. createTooltipContent),
    // et lui seul a pointer-events: auto.
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
      // Nettoyer les timeouts
      const currentTimeouts = imageLoadTimeoutsRef.current;
      currentTimeouts.forEach(timeout => clearTimeout(timeout));
      currentTimeouts.clear();
    };
  }, []);

  // Mettre à jour les styles selon le mode sombre
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

  // Fonction optimisée pour créer le contenu du tooltip
  // Pas de couleurs inline — tout est piloté par CSS via .font-tooltip.dark-mode
  // pour que le toggle dark/light reste cohérent même si le tooltip est ouvert.
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

  // Fonction optimisée pour positionner un tooltip
  const positionTooltip = useCallback((tooltip, svgElement) => {
    if (!tooltip || !svgElement) return;

    const tooltipNode = tooltip.node();
    const tooltipRect = tooltipNode.getBoundingClientRect();
    const elementRect = svgElement.getBoundingClientRect();

    // Tooltip just above the visible glyph (gap stays constant regardless
    // of zoom — elementRect already grows with zoom).
    const centerX = elementRect.left + (elementRect.width / 2);
    const gap = 6;

    let x = centerX - (tooltipRect.width / 2);
    let y = elementRect.top - tooltipRect.height - gap;

    // Ajuster si le tooltip sort de l'écran
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

  // Fonction optimisée pour afficher un tooltip
  const showTooltip = useCallback((tooltip, font, svgElement) => {
    if (!tooltip || !font) return;

    if (tooltip === hoverTooltipRef.current) currentFontRef.current = font;

    // Set content, measure and position synchronously, THEN fade in — avoids
    // the tooltip flashing at its previous position before jumping.
    tooltip.html(createTooltipContent(font));
    positionTooltip(tooltip, svgElement);
    tooltip.style('opacity', 1);
  }, [createTooltipContent, positionTooltip]);

  // Fonction pour masquer un tooltip
  const hideTooltip = useCallback((tooltip) => {
    if (!tooltip) return;
    tooltip.style('opacity', 0);
  }, []);

  // Fonction optimisée pour mettre à jour les positions des tooltips
  const updatePositions = useCallback(() => {
    const svg = d3.select('.fontmap-svg');
    if (svg.empty()) return;

    const viewportGroup = svg.select('.viewport-group');
    if (viewportGroup.empty()) return;

    // Mettre à jour le tooltip sélectionné
    if (selectedTooltipRef.current && selectedTooltipRef.current.style('opacity') !== '0') {
      const selectedName = window.currentSelectedFont?.name;
      if (selectedName) {
        const glyphElement = viewportGroup.node().querySelector(`[data-font="${CSS.escape(selectedName)}"]`);
        if (glyphElement) {
          positionTooltip(selectedTooltipRef.current, glyphElement);
        }
      }
    }

    // Mettre à jour le tooltip hover
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

  // Fonction pour mettre à jour la transformation
  const updateTransform = useCallback((transform) => {
    currentTransformRef.current = transform;
    setTimeout(() => {
      updatePositions();
    }, 0);
  }, [updatePositions]);

  // Fonction pour gérer la sélection d'une police
  const handleFontSelect = useCallback((font, svgElement) => {
    if (!font) {
      hideTooltip(selectedTooltipRef.current);
      return;
    }

    hideTooltip(hoverTooltipRef.current);
    showTooltip(selectedTooltipRef.current, font, svgElement);
  }, [showTooltip, hideTooltip]);

  // Fonction pour gérer le hover d'une police
  const handleFontHover = useCallback((font, svgElement) => {
    if (!font) {
      hideTooltip(hoverTooltipRef.current);
      return;
    }

    showTooltip(hoverTooltipRef.current, font, svgElement);
  }, [showTooltip, hideTooltip]);

  // Fonction pour gérer la fin du hover
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

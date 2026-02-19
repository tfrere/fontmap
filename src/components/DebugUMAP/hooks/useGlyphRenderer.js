import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { calculateMappingDimensions, createGlyphTransform } from '../utils/mappingUtils.js';
import { applyColorsToGlyphGroup } from '../utils/colorUtils.js';
import { getConfig } from '../config/mapConfig.js';
import { useDebugUMAPStore } from '../store';

/**
 * Hook pour gérer le rendu des glyphes avec Zustand
 */
export function useGlyphRenderer({ svgRef, enabled = true }) {
  const configs = useDebugUMAPStore((state) => state.configs);
  const currentConfigIndex = useDebugUMAPStore((state) => state.currentConfigIndex);
  const baseGlyphSize = useDebugUMAPStore((state) => state.baseGlyphSize);
  const useCategoryColors = useDebugUMAPStore((state) => state.useCategoryColors);
  const darkMode = useDebugUMAPStore((state) => state.darkMode);
  const showCentroids = useDebugUMAPStore((state) => state.showCentroids);
  const setCurrentFonts = useDebugUMAPStore((state) => state.setCurrentFonts);
  const setMappingFunctions = useDebugUMAPStore((state) => state.setMappingFunctions);
  const setGlyphsLoaded = useDebugUMAPStore((state) => state.setGlyphsLoaded);

  // Références pour le cleanup
  const abortControllerRef = useRef(null);
  const timeoutRefs = useRef([]);

  console.log('useGlyphRenderer: Hook appelé avec:', {
    configsLength: configs.length,
    currentConfigIndex,
    baseGlyphSize,
    svgRef: !!svgRef.current
  });
  // Charger et afficher les glyphes - SEULEMENT au premier chargement
  useEffect(() => {
    console.log('useGlyphRenderer: useEffect déclenché, enabled:', enabled, 'configs.length:', configs.length);
    
    // Cleanup des opérations précédentes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current = [];
    
    if (!enabled || configs.length === 0) {
      console.log('useGlyphRenderer: Pas activé ou pas de configurations, sortie');
      return;
    }

    const config = configs[currentConfigIndex];
    if (!config) {
      console.log('useGlyphRenderer: Pas de config pour l\'index', currentConfigIndex);
      return;
    }

    console.log('useGlyphRenderer: Chargement de la config:', config.filename || 'live');

    // Créer un AbortController pour ce fetch
    abortControllerRef.current = new AbortController();

    // Si la config a déjà les fonts (résultat live UMAP), utiliser directement
    const dataPromise = config.fonts 
      ? Promise.resolve(config)  // Données déjà présentes (live)
      : fetch(`/debug-umap/${config.filename}`, {  // Charger depuis fichier
          signal: abortControllerRef.current.signal
        }).then(res => res.json());

    dataPromise
      .then(data => {
        const svg = svgRef.current;
        if (!svg) return;

        // Créer ou récupérer le groupe viewport (sans nettoyer le SVG)
        let viewportGroup = d3.select(svg).select('.viewport-group');
        if (viewportGroup.empty()) {
          viewportGroup = d3.select(svg).append('g').attr('class', 'viewport-group');
        } else {
          // Nettoyer seulement les glyphes et centroïdes, pas le groupe viewport
          viewportGroup.selectAll('g.glyph-group').remove();
          viewportGroup.selectAll('.centroid-label').remove();
        }

        // Calculer les dimensions de mapping
        const { mapX, mapY } = calculateMappingDimensions(data.fonts);
        
        // Stocker les données pour les centroïdes
        setCurrentFonts(data.fonts);
        setMappingFunctions({ mapX, mapY });
        setGlyphsLoaded(false);

        // Charger les glyphes par batch pour éviter ERR_INSUFFICIENT_RESOURCES
        const batchSize = getConfig('glyph.batchLoading.batchSize', 40);
        const fonts = data.fonts;
        
        const loadBatch = (startIndex) => {
          const endIndex = Math.min(startIndex + batchSize, fonts.length);
          const batch = fonts.slice(startIndex, endIndex);
          
          // Charger le batch actuel
          const promises = batch.map(font => 
            fetch(`/data/char/${font.id}_a.svg`, {
              signal: abortControllerRef.current.signal
            })
              .then(res => res.text())
              .then(svgContent => {
                // Vérifier si le composant est toujours monté
                if (!svgRef.current || abortControllerRef.current.signal.aborted) {
                  return;
                }
                renderGlyph(viewportGroup, svgContent, font, mapX, mapY, baseGlyphSize, useCategoryColors, darkMode);
              })
              .catch((err) => {
                if (err.name !== 'AbortError') {
                  console.warn('Erreur lors du chargement du glyphe:', font.id, err);
                }
              })
          );
          
          // Attendre que le batch soit terminé avant de continuer
          Promise.all(promises).then(() => {
            // Vérifier si le composant est toujours monté
            if (!svgRef.current || abortControllerRef.current.signal.aborted) {
              return;
            }
            
            if (endIndex < fonts.length) {
              // Charger le batch suivant après un petit délai
              const delay = getConfig('glyph.batchLoading.delay', 10);
              const timeout = setTimeout(() => loadBatch(endIndex), delay);
              timeoutRefs.current.push(timeout);
            } else {
              // Tous les glyphes sont chargés, créer les centroïdes maintenant
              setGlyphsLoaded(true);
              
              if (showCentroids) {
                const centroidTimeout = setTimeout(() => {
                  if (!abortControllerRef.current.signal.aborted) {
                    createCentroids(data.fonts, mapX, mapY, viewportGroup, darkMode, useCategoryColors);
                  }
                }, 50);
                timeoutRefs.current.push(centroidTimeout);
              }
            }
          });
        };
        
        // Commencer le chargement par batch
        loadBatch(0);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Erreur:', err);
        }
      });

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current = [];
    };
  }, [enabled, configs, currentConfigIndex]);

  // Mettre à jour les couleurs des glyphes existants
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const viewportGroup = svg.querySelector('.viewport-group');
    if (!viewportGroup) return;
    
    const glyphGroups = viewportGroup.querySelectorAll('g.glyph-group');
    
    glyphGroups.forEach(group => {
      const category = group.getAttribute('data-category');
      applyColorsToGlyphGroup(group, category, useCategoryColors, darkMode);
    });
    
    // Mettre à jour les couleurs des centroïdes
    const centroidLabels = viewportGroup.querySelectorAll('.centroid-label');
    const strokeColors = getConfig('color.centroid.stroke', { light: '#ffffff', dark: '#000000' });
    const strokeColor = darkMode ? strokeColors.dark : strokeColors.light;
    
    const categoryColors = getConfig('color.categories', {});
    const fallbackColor = getConfig('color.centroid.fallback', '#95a5a6');
    const defaultColors = getConfig('color.defaults', { light: '#333333', dark: '#ffffff' });
    
    centroidLabels.forEach(label => {
      const category = label.textContent;
      const fillColor = useCategoryColors 
        ? (categoryColors[category] || fallbackColor)
        : (darkMode ? defaultColors.dark : defaultColors.light);
      
      label.setAttribute('fill', fillColor);
      label.setAttribute('stroke', strokeColor);
    });
  }, [useCategoryColors, darkMode]);

  // Gérer l'affichage/masquage des centroïdes
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const viewportGroup = svg.querySelector('.viewport-group');
    if (!viewportGroup) return;
    
    const centroidLabels = viewportGroup.querySelectorAll('.centroid-label');
    centroidLabels.forEach(label => {
      label.style.display = showCentroids ? 'block' : 'none';
    });
  }, [showCentroids]);

  // Gérer les changements de taille des glyphes
  useEffect(() => {
    if (!svgRef.current || !enabled) return;

    const svg = svgRef.current;
    const viewportGroup = svg.querySelector('.viewport-group');
    if (!viewportGroup) return;
    
    const glyphGroups = viewportGroup.querySelectorAll('g.glyph-group');
    glyphGroups.forEach(group => {
      const originalTransform = group.getAttribute('data-original-transform');
      if (originalTransform) {
        // Extraire les coordonnées x,y de la transformation originale
        const match = originalTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
          
          // Appliquer la transformation avec scaling centré
          // Utiliser la formule : translate(x, y) scale(s) avec transform-origin center
          const newTransform = `translate(${x}, ${y}) scale(${baseGlyphSize})`;
          group.setAttribute('transform', newTransform);
        }
      }
    });
  }, [enabled, baseGlyphSize]);

  // Pas besoin de retourner quoi que ce soit, tout est dans le store
  return {};
}

/**
 * Rend un glyphe individuel
 */
function renderGlyph(viewportGroup, svgContent, font, mapX, mapY, baseGlyphSize, useCategoryColors, darkMode) {
  // Créer un groupe pour chaque glyphe
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const originalTransform = createGlyphTransform(
    mapX(font.x), 
    mapY(font.y), 
    baseGlyphSize
  );
  
  group.setAttribute('transform', originalTransform);
  group.setAttribute('data-original-transform', originalTransform);
  group.setAttribute('data-category', font.family);
  group.setAttribute('class', 'glyph-group');
  
  // Parser le SVG et l'ajouter au groupe
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgElement = svgDoc.querySelector('svg');
  
  if (svgElement) {
    // Copier le contenu du SVG
    while (svgElement.firstChild) {
      const child = svgElement.firstChild;
      group.appendChild(child);
    }
  }
  
  // Ajouter au groupe viewport
  viewportGroup.node().appendChild(group);
  
  // Appliquer les couleurs immédiatement
  applyColorsToGlyphGroup(group, font.family, useCategoryColors, darkMode);
}

/**
 * Créer les centroïdes des catégories
 */
function createCentroids(fonts, mapX, mapY, viewportGroup, darkMode, useCategoryColors = true) {
  // Calculer les centroïdes par catégorie
  const centroids = {};
  const categoryCounts = {};

  fonts.forEach(font => {
    const category = font.family;
    if (!centroids[category]) {
      centroids[category] = { x: 0, y: 0, count: 0 };
      categoryCounts[category] = 0;
    }
    
    centroids[category].x += font.x;
    centroids[category].y += font.y;
    centroids[category].count += 1;
    categoryCounts[category] += 1;
  });

  // Calculer les moyennes
  Object.keys(centroids).forEach(category => {
    centroids[category].x /= centroids[category].count;
    centroids[category].y /= centroids[category].count;
  });

  // Nettoyer les centroïdes existants
  viewportGroup.selectAll('.centroid-label').remove();

  // Créer les centroïdes (juste du texte avec bordure blanche)
  Object.entries(centroids).forEach(([category, centroid]) => {
    const x = mapX(centroid.x);
    const y = mapY(centroid.y);
    
    // Utiliser les couleurs de catégorie ou noir/blanc selon useCategoryColors
    const categoryColors = getConfig('color.categories', {});
    const fallbackColor = getConfig('color.centroid.fallback', '#95a5a6');
    const defaultColors = getConfig('color.defaults', { light: '#333333', dark: '#ffffff' });
    
    const color = useCategoryColors 
      ? (categoryColors[category] || fallbackColor)
      : (darkMode ? defaultColors.dark : defaultColors.light);

    // Texte avec bordure adaptée au mode sombre
    const strokeColors = getConfig('color.centroid.stroke', { light: '#ffffff', dark: '#000000' });
    const strokeColor = darkMode ? strokeColors.dark : strokeColors.light;
    
    const textConfig = getConfig('centroid.text', {
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: 'Arial, Helvetica, sans-serif',
      strokeWidth: 4
    });
    
    viewportGroup.append('text')
      .attr('x', x)
      .attr('y', y)
      .attr('text-anchor', 'middle')
      .attr('font-size', `${textConfig.fontSize}px`)
      .attr('font-weight', textConfig.fontWeight)
      .attr('font-family', textConfig.fontFamily)
      .attr('fill', color)
      .attr('stroke', strokeColor)
      .attr('stroke-width', `${textConfig.strokeWidth}px`)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('paint-order', 'stroke fill')
      .attr('class', 'centroid-label')
      .text(category);
  });
}

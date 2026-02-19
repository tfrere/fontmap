import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { CATEGORY_COLORS } from '../utils/constants.js';

/**
 * Composant pour afficher les centroïdes des catégories
 */
export function CategoryCentroids({ 
  fonts, 
  mapX, 
  mapY, 
  darkMode, 
  showCentroids = true 
}) {
  const centroidsRef = useRef(null);

  useEffect(() => {
    if (!fonts || !showCentroids || !mapX || !mapY) return;

    // Délai pour s'assurer que les glyphes sont chargés
    const timer = setTimeout(() => {
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

    // Créer ou récupérer le groupe des centroïdes dans le viewport-group
    const svg = d3.select(centroidsRef.current?.closest('svg'));
    if (svg.empty()) return;

    let viewportGroup = svg.select('.viewport-group');
    if (viewportGroup.empty()) {
      viewportGroup = svg.append('g').attr('class', 'viewport-group');
    }

    let centroidsGroup = viewportGroup.select('.centroids-group');
    if (centroidsGroup.empty()) {
      centroidsGroup = viewportGroup.append('g').attr('class', 'centroids-group');
    }

    // Nettoyer les centroïdes existants seulement si nécessaire
    if (centroidsGroup.selectAll('text.centroid-label').size() > 0) {
      centroidsGroup.selectAll('text.centroid-label').remove();
    }

    // Créer les centroïdes (juste du texte avec bordure blanche)
    Object.entries(centroids).forEach(([category, centroid]) => {
      const x = mapX(centroid.x);
      const y = mapY(centroid.y);
      const color = CATEGORY_COLORS[category] || '#95a5a6';
      const count = categoryCounts[category];

      // Texte avec bordure blanche épaisse (effet stroke)
      centroidsGroup.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', color)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', '4px')
        .attr('paint-order', 'stroke fill')
        .attr('class', 'centroid-label')
        .text(`${category} (${count})`);
    });

    }, 500); // Délai de 500ms pour laisser le temps aux glyphes de se charger

    return () => clearTimeout(timer);
  }, [fonts, mapX, mapY, darkMode, showCentroids]);

  return <g ref={centroidsRef} className="category-centroids" />;
}

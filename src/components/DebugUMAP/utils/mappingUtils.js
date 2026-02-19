// Utilitaires de mapping et calculs de coordonnées
import { getConfig } from '../config/mapConfig.js';

/**
 * Calcule les dimensions de mapping pour les coordonnées UMAP
 * @param {Array} fonts - Array des données de polices
 * @returns {Object} - Objet contenant les fonctions de mapping et les dimensions
 */
export function calculateMappingDimensions(fonts) {
  const xValues = fonts.map(d => d.x);
  const yValues = fonts.map(d => d.y);
  
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  const offset = getConfig('ui.positions.leva.top', 20); // Utiliser la position de Leva comme offset
  const mapX = (x) => ((x - xMin) / (xMax - xMin)) * (window.innerWidth - 2 * offset) + offset;
  const mapY = (y) => ((yMax - y) / (yMax - yMin)) * (window.innerHeight - 2 * offset) + offset;

  return {
    mapX,
    mapY,
    dimensions: { xMin, xMax, yMin, yMax, offset }
  };
}

/**
 * Génère une transformation SVG pour un glyphe
 * @param {number} x - Coordonnée X
 * @param {number} y - Coordonnée Y
 * @param {number} scale - Facteur d'échelle
 * @returns {string} - Transformation SVG
 */
export function createGlyphTransform(x, y, scale) {
  return `translate(${x}, ${y}) scale(${scale})`;
}

/**
 * Applique une transformation de zoom à une transformation existante
 * @param {string} originalTransform - Transformation originale
 * @param {Object} zoomTransform - Transformation de zoom D3
 * @param {number} baseGlyphSize - Taille de base des glyphes
 * @returns {string} - Nouvelle transformation
 */
export function applyZoomTransform(originalTransform, zoomTransform, baseGlyphSize) {
  const translateMatch = originalTransform.match(/translate\(([^,]+),([^)]+)\)/);
  if (!translateMatch) return zoomTransform;

  const origX = parseFloat(translateMatch[1]);
  const origY = parseFloat(translateMatch[2]);
  
  const newX = zoomTransform.applyX(origX);
  const newY = zoomTransform.applyY(origY);
  const inverseScale = zoomTransform.k;
  
  return `translate(${newX},${newY}) scale(${baseGlyphSize * inverseScale})`;
}

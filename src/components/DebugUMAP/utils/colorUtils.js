// Utilitaires de gestion des couleurs
import { CATEGORY_COLORS, DEFAULT_COLORS } from './constants.js';

/**
 * Obtient la couleur appropriée pour un glyphe selon le mode et la catégorie
 * @param {string} category - Catégorie de la police
 * @param {boolean} useCategoryColors - Utiliser les couleurs par catégorie
 * @param {boolean} darkMode - Mode sombre activé
 * @returns {string} - Couleur hexadécimale
 */
export function getGlyphColor(category, useCategoryColors, darkMode) {
  if (useCategoryColors) {
    return CATEGORY_COLORS[category] || '#95a5a6';
  }
  return darkMode ? DEFAULT_COLORS.dark : DEFAULT_COLORS.light;
}

/**
 * Applique une couleur à un élément SVG
 * @param {Element} element - Élément SVG
 * @param {string} color - Couleur à appliquer
 */
export function applyColorToElement(element, color) {
  if (element.nodeType === Node.ELEMENT_NODE) {
    element.setAttribute('fill', color);
  }
}

/**
 * Applique les couleurs à tous les éléments d'un groupe de glyphes
 * @param {Element} group - Groupe de glyphes
 * @param {string} category - Catégorie de la police
 * @param {boolean} useCategoryColors - Utiliser les couleurs par catégorie
 * @param {boolean} darkMode - Mode sombre activé
 */
export function applyColorsToGlyphGroup(group, category, useCategoryColors, darkMode) {
  const color = getGlyphColor(category, useCategoryColors, darkMode);
  const elements = group.querySelectorAll('*');
  
  elements.forEach(element => {
    applyColorToElement(element, color);
  });
}

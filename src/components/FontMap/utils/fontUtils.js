// NOTE: d3 import supprimé car non utilisé dans ce fichier

/**
 * Utilitaires pour la gestion des polices
 */

/**
 * Obtient l'ID du symbole SVG pour une police donnée
 * Utilise directement l'ID de la police + "_a" (plus besoin de mapping)
 */
export const getFontSymbolId = (fontName) => {
  if (!fontName) return 'fallback_a';
  
  // Utiliser directement l'ID de la police + "_a"
  // L'ID est déjà normalisé dans font-index.json
  return fontName.toLowerCase() + '_a';
};

/**
 * Vérifie si une police correspond à un terme de recherche
 */
export const matchesSearch = (font, searchTerm) => {
  if (!searchTerm) return true;
  const searchLower = searchTerm.toLowerCase();
  return font.name.toLowerCase().includes(searchLower) || 
         font.family.toLowerCase().includes(searchLower);
};

/**
 * Forge une URL Google Fonts pour une police donnée
 * Gère correctement les espaces, majuscules et caractères spéciaux
 */
export const generateGoogleFontsUrl = (fontName) => {
  if (!fontName) return null;
  
  // Nettoyer et formater le nom de police pour l'URL Google Fonts
  const formattedName = fontName
    .trim()
    .replace(/\s+/g, '+')  // Remplacer les espaces par des +
    .replace(/[^\w\s+]/g, '') // Supprimer les caractères spéciaux sauf +
    .replace(/\s+/g, '+'); // S'assurer que tous les espaces sont des +
  
  return `https://fonts.google.com/specimen/${formattedName}`;
};

/**
 * Filtre les polices selon les critères donnés
 */
export const filterFonts = (fonts, filter, searchTerm) => {
  return fonts.filter(font => {
    // Filtrage par famille
    const familyMatch = filter === 'all' || font.family === filter;
    
    // Filtrage par recherche
    const searchMatch = matchesSearch(font, searchTerm);
    
    return familyMatch && searchMatch;
  });
};

// NOTE: calculatePositions a été déplacé vers voronoiDilation.js
// pour éviter les doublons et centraliser la logique de dilatation

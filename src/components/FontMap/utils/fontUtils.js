import { fontHasStyleTag, matchesSearch } from './fontSearch';

/**
 * Font helpers
 */

/**
 * SVG symbol id of a font
 * The font id + "_a" (no mapping needed)
 */
export const getFontSymbolId = (fontName) => {
  if (!fontName) return 'fallback_a';
  
  // Font id + "_a"
  // The id is already normalised in font-index.json
  return fontName.toLowerCase() + '_a';
};

/**
 * Build a Google Fonts URL for a font
 * Handles spaces, capitals and special characters
 */
export const generateGoogleFontsUrl = (fontName) => {
  if (!fontName) return null;
  
  // Clean and format the font name for the Google Fonts URL
  const formattedName = fontName
    .trim()
    .replace(/\s+/g, '+')  // Spaces to +
    .replace(/[^\w\s+]/g, '') // Drop special characters except +
    .replace(/\s+/g, '+'); // Make sure every space is a +
  
  return `https://fonts.google.com/specimen/${formattedName}`;
};

/**
 * Filter fonts by the given criteria
 */
export const filterFonts = (fonts, filter, searchTerm, styleTag = null) => {
  return fonts.filter(font => {
    // Filtrage par famille
    const familyMatch = filter === 'all' || font.family === filter;
    
    // Filtrage par recherche
    const searchMatch = matchesSearch(font, searchTerm);

    const styleMatch = !styleTag || fontHasStyleTag(font, styleTag);
    
    return familyMatch && searchMatch && styleMatch;
  });
};


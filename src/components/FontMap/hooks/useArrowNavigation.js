import { useEffect, useCallback } from 'react';

/**
 * Hook pour la navigation aux flèches entre les polices
 * Permet de naviguer vers la police la plus proche dans la direction souhaitée
 */
export const useArrowNavigation = (
  selectedFont,
  fonts,
  filter,
  searchTerm,
  onFontSelect
) => {
  // Fonction pour filtrer les polices selon les critères actuels
  const getFilteredFonts = useCallback(() => {
    if (!fonts || fonts.length === 0) return [];
    
    return fonts.filter(font => {
      // Filtrage par famille
      const familyMatch = filter === 'all' || font.family === filter;
      
      // Filtrage par recherche
      const searchMatch = !searchTerm || 
        font.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        font.family.toLowerCase().includes(searchTerm.toLowerCase());
      
      return familyMatch && searchMatch;
    });
  }, [fonts, filter, searchTerm]);

  // NOTE: calculateDistance supprimé car non utilisé

  // Fonction pour trouver la police la plus proche dans une direction
  const findNearestFontInDirection = useCallback((direction) => {
    if (!selectedFont || !onFontSelect) return;
    
    const filteredFonts = getFilteredFonts();
    if (filteredFonts.length <= 1) return; // Pas assez de polices pour naviguer
    
    // Trouver la police sélectionnée dans la liste filtrée
    const currentFont = filteredFonts.find(font => font.name === selectedFont.name);
    if (!currentFont) return;
    
    let bestFont = null;
    let bestDistance = Infinity;
    
    // Approche simple : trouver la police la plus proche dans la direction
    filteredFonts.forEach(font => {
      if (font.name === selectedFont.name) return; // Ignorer la police actuelle
      
      const dx = font.x - currentFont.x;
      const dy = font.y - currentFont.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance === 0) return; // Éviter les polices à la même position
      
      let isInDirection = false;
      
      // Vérifier si la police est dans la direction souhaitée (critères simples)
      switch (direction) {
        case 'ArrowUp':
          // Police au-dessus - inversé car les coordonnées semblent inversées
          isInDirection = dy > 0 && Math.abs(dx) <= Math.abs(dy) * 2;
          break;
        case 'ArrowDown':
          // Police en-dessous - inversé car les coordonnées semblent inversées
          isInDirection = dy < 0 && Math.abs(dx) <= Math.abs(dy) * 2;
          break;
        case 'ArrowLeft':
          // Police à gauche (x plus petit) - accepter un peu de décalage vertical
          isInDirection = dx < 0 && Math.abs(dy) <= Math.abs(dx) * 2;
          break;
        case 'ArrowRight':
          // Police à droite (x plus grand) - accepter un peu de décalage vertical
          isInDirection = dx > 0 && Math.abs(dy) <= Math.abs(dx) * 2;
          break;
        default:
          return;
      }
      
      // Si la police est dans la bonne direction et plus proche que la meilleure actuelle
      if (isInDirection && distance < bestDistance) {
        bestDistance = distance;
        bestFont = font;
      }
    });
    
    // Sélectionner la police la plus proche trouvée
    if (bestFont) {
      onFontSelect(bestFont);
    }
  }, [selectedFont, getFilteredFonts, onFontSelect]);

  // Gestionnaire d'événements clavier
  const handleKeyDown = useCallback((event) => {
    // Vérifier si une police est sélectionnée
    if (!selectedFont) return;
    
    // Vérifier si on est dans un champ de saisie
    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true'
    )) {
      return; // Ne pas intercepter les flèches dans les champs de saisie
    }
    
    // Gérer les touches fléchées
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); // Empêcher le scroll de la page
      findNearestFontInDirection(event.key);
    }
  }, [selectedFont, findNearestFontInDirection]);

  // Ajouter l'écouteur d'événements
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Retourner des informations utiles pour le debug
  return {
    canNavigate: selectedFont && getFilteredFonts().length > 1,
    filteredFontsCount: getFilteredFonts().length,
    selectedFontName: selectedFont?.name
  };
};

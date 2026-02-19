import { useMemo, useRef } from 'react';

/**
 * Hook pour mettre en cache les calculs d'opacité
 * Évite les recalculs inutiles
 */
export const useOpacityCache = () => {
  const opacityCacheRef = useRef(new Map());
  
  // Fonction pour calculer l'opacité avec cache
  const getOpacity = useMemo(() => {
    return (font, filter, searchTerm, selectedFont) => {
      // Créer une clé de cache
      const cacheKey = `${font.name}-${filter}-${searchTerm}-${selectedFont?.name || 'none'}`;
      
      // Vérifier le cache
      if (opacityCacheRef.current.has(cacheKey)) {
        return opacityCacheRef.current.get(cacheKey);
      }
      
      // Calculer l'opacité
      const familyMatch = filter === 'all' || font.family === filter;
      const searchMatch = !searchTerm || 
        font.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        font.family.toLowerCase().includes(searchTerm.toLowerCase());
      const isActive = selectedFont && selectedFont.name === font.name;
      
      const opacity = isActive ? 1 : (familyMatch && searchMatch ? 1 : 0.2);
      
      // Mettre en cache (limiter la taille du cache)
      if (opacityCacheRef.current.size > 10000) {
        opacityCacheRef.current.clear();
      }
      opacityCacheRef.current.set(cacheKey, opacity);
      
      return opacity;
    };
  }, []);
  
  // Fonction pour invalider le cache
  const invalidateCache = () => {
    opacityCacheRef.current.clear();
  };
  
  return {
    getOpacity,
    invalidateCache
  };
};

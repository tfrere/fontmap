import { useEffect } from 'react';
import { useDebugUMAPStore } from '../store';

/**
 * Hook pour gérer l'état visuel de l'application avec Zustand
 */
export function useVisualState() {
  const useCategoryColors = useDebugUMAPStore((state) => state.useCategoryColors);
  const baseGlyphSize = useDebugUMAPStore((state) => state.baseGlyphSize);
  const darkMode = useDebugUMAPStore((state) => state.darkMode);
  const showCentroids = useDebugUMAPStore((state) => state.showCentroids);
  const setUseCategoryColors = useDebugUMAPStore((state) => state.setUseCategoryColors);
  const setBaseGlyphSize = useDebugUMAPStore((state) => state.setBaseGlyphSize);
  const setDarkMode = useDebugUMAPStore((state) => state.setDarkMode);
  const setShowCentroids = useDebugUMAPStore((state) => state.setShowCentroids);

  // Écouter les changements de préférence système
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      setDarkMode(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []); // Pas de dépendances pour éviter la boucle infinie

  return {
    useCategoryColors,
    setUseCategoryColors,
    baseGlyphSize,
    setBaseGlyphSize,
    darkMode,
    setDarkMode,
    showCentroids,
    setShowCentroids
  };
}

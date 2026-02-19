import { useState, useEffect } from 'react';

/**
 * Hook personnalisé pour gérer le mode sombre avec détection des préférences système
 * et persistance dans localStorage
 */
export const useDarkMode = () => {
  const [darkMode, setDarkMode] = useState(() => {
    // Vérifier d'abord localStorage pour une préférence utilisateur
    const savedPreference = localStorage.getItem('darkMode');
    if (savedPreference !== null) {
      return JSON.parse(savedPreference);
    }
    
    // Sinon, utiliser les préférences système
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    // Fallback par défaut
    return false;
  });

  // Écouter les changements de préférences système
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e) => {
      // Ne changer que si l'utilisateur n'a pas de préférence sauvegardée
      const savedPreference = localStorage.getItem('darkMode');
      if (savedPreference === null) {
        setDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  // Fonction pour basculer le mode sombre
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', JSON.stringify(newDarkMode));
  };

  // Fonction pour réinitialiser aux préférences système
  const resetToSystemPreference = () => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(systemPreference);
      localStorage.removeItem('darkMode');
    }
  };

  return {
    darkMode,
    toggleDarkMode,
    resetToSystemPreference
  };
};

import { useEffect } from 'react';
import { useDebugUMAPStore } from '../store';

/**
 * Hook pour gérer la navigation au clavier
 * Flèches gauche/droite pour changer de configuration de manière rotative
 */
export function useKeyboardNavigation() {
  const configs = useDebugUMAPStore((state) => state.configs);
  const currentConfigIndex = useDebugUMAPStore((state) => state.currentConfigIndex);
  const setCurrentConfigIndex = useDebugUMAPStore((state) => state.setCurrentConfigIndex);

  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ignorer si on est dans un input ou textarea
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
      }

      // Ignorer si on n'a pas de configurations
      if (configs.length === 0) {
        return;
      }

      let newIndex = currentConfigIndex;

      switch (event.key) {
        case 'ArrowLeft':
        case '-':
          // Configuration précédente (rotatif)
          newIndex = currentConfigIndex > 0 
            ? currentConfigIndex - 1 
            : configs.length - 1;
          break;
        
        case 'ArrowRight':
        case '+':
        case '=':
          // Configuration suivante (rotatif)
          newIndex = currentConfigIndex < configs.length - 1 
            ? currentConfigIndex + 1 
            : 0;
          break;
        
        default:
          return; // Pas une touche qui nous intéresse
      }

      // Empêcher le comportement par défaut
      event.preventDefault();
      
      // Changer de configuration
      if (newIndex !== currentConfigIndex) {
        console.log(`Navigation clavier: ${event.key} -> config ${newIndex}`);
        setCurrentConfigIndex(newIndex);
      }
    };

    // Ajouter l'écouteur d'événements
    document.addEventListener('keydown', handleKeyDown);

    // Nettoyer l'écouteur d'événements
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [configs.length, currentConfigIndex, setCurrentConfigIndex]);

  return {
    currentConfigIndex,
    totalConfigs: configs.length
  };
}
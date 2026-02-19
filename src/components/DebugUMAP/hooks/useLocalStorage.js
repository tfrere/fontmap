import { useEffect } from 'react';
import { useDebugUMAPStore } from '../store';

/**
 * Hook pour gérer la persistance en localStorage
 * Charge automatiquement la configuration sauvegardée au démarrage
 */
export function useLocalStorage() {
  const loadFromLocalStorage = useDebugUMAPStore((state) => state.loadFromLocalStorage);
  const saveToLocalStorage = useDebugUMAPStore((state) => state.saveToLocalStorage);

  useEffect(() => {
    // Charger la configuration sauvegardée au démarrage
    console.log('useLocalStorage: Tentative de chargement de la configuration...');
    const loaded = loadFromLocalStorage();
    if (loaded) {
      console.log('useLocalStorage: ✅ Configuration restaurée depuis localStorage');
    } else {
      console.log('useLocalStorage: ❌ Aucune configuration sauvegardée trouvée');
    }
  }, [loadFromLocalStorage]);

  // Sauvegarder automatiquement avant de quitter la page
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveToLocalStorage();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveToLocalStorage]);

  return {
    loadFromLocalStorage,
    saveToLocalStorage
  };
}

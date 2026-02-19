import { useEffect } from 'react';
import { useDebugUMAPStore } from '../store';

/**
 * Hook pour gérer le chargement et la gestion des configurations UMAP avec Zustand
 */
export function useConfigs() {
  const setConfigs = useDebugUMAPStore((state) => state.setConfigs);
  const setLoading = useDebugUMAPStore((state) => state.setLoading);
  const setError = useDebugUMAPStore((state) => state.setError);

  // Charger les configurations
  useEffect(() => {
    console.log('useConfigs: Début du chargement des configurations');
    setLoading(true);
    setError(null);
    
    fetch('/debug-umap/index.json')
      .then(res => {
        console.log('useConfigs: Réponse reçue:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('useConfigs: Données reçues:', data);
        setConfigs(data.configs);
        setLoading(false);
        console.log('useConfigs: Configurations chargées:', data.configs?.length);
      })
      .catch(err => {
        console.error('useConfigs: Erreur lors du chargement:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []); // Pas de dépendances pour éviter la boucle infinie

  // Ce hook ne retourne rien, il charge juste les configurations
  return {};
}

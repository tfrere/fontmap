import { useCallback, useRef } from 'react';

/**
 * Hook pour debouncer les mises à jour
 * Évite les mises à jour excessives
 */
export const useDebouncedUpdates = (delay = 16) => { // 16ms = ~60fps
  const timeoutRef = useRef(null);
  const pendingUpdateRef = useRef(null);
  
  // Fonction debounced pour les mises à jour
  const debouncedUpdate = useCallback((updateFn) => {
    // Stocker la fonction de mise à jour
    pendingUpdateRef.current = updateFn;
    
    // Annuler le timeout précédent
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Programmer la mise à jour
    timeoutRef.current = setTimeout(() => {
      if (pendingUpdateRef.current) {
        pendingUpdateRef.current();
        pendingUpdateRef.current = null;
      }
    }, delay);
  }, [delay]);
  
  // Fonction pour forcer une mise à jour immédiate
  const flushUpdate = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pendingUpdateRef.current) {
      pendingUpdateRef.current();
      pendingUpdateRef.current = null;
    }
  }, []);
  
  // Fonction pour annuler les mises à jour en attente
  const cancelUpdate = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingUpdateRef.current = null;
  }, []);
  
  return {
    debouncedUpdate,
    flushUpdate,
    cancelUpdate
  };
};

import React, { useEffect, useRef } from 'react';
import Stats from 'stats.js';

/**
 * Composant pour afficher un moniteur FPS en mode debug
 * Utilise stats.js pour mesurer les performances
 */
const FPSMonitor = ({ isDebugMode = false }) => {
  const containerRef = useRef(null);
  const statsRef = useRef(null);

  useEffect(() => {
    // Ne s'affiche qu'en mode debug
    if (!isDebugMode) {
      return;
    }

    if (!containerRef.current) return;

    // Créer l'instance de Stats.js
    const stats = new Stats();
    
    // Configuration du style
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    stats.dom.style.position = 'fixed';
    stats.dom.style.top = '20px';
    stats.dom.style.right = '80px';
    stats.dom.style.left = 'auto'; // Force à ignorer left
    stats.dom.style.zIndex = '10000';
    stats.dom.style.pointerEvents = 'none';
    stats.dom.style.marginLeft = '0'; // Reset margin
    stats.dom.style.marginRight = '0';
    // Ajouter au DOM
    containerRef.current.appendChild(stats.dom);
    
    // Stocker la référence
    statsRef.current = stats;

    // Fonction de mise à jour
    const updateStats = () => {
      stats.begin();
      // Simulation d'une tâche
      stats.end();
      requestAnimationFrame(updateStats);
    };

    // Démarrer le monitoring
    updateStats();

    // Cleanup
    return () => {
      const currentContainer = containerRef.current;
      if (statsRef.current && currentContainer) {
        currentContainer.removeChild(statsRef.current.dom);
        statsRef.current = null;
      }
    };
  }, [isDebugMode]);

  // Ne rien rendre si pas en mode debug
  if (!isDebugMode) {
    return null;
  }

  return <div ref={containerRef} />;
};

export default FPSMonitor;

import { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import { GLYPH_CONFIG } from '../utils/constants.js';
import { useDebugUMAPStore } from '../store';

/**
 * Hook pour gérer l'interface Tweakpane avec Zustand
 */
export function useTweakpane({ onResetZoom }) {
  const configs = useDebugUMAPStore((state) => state.configs);
  const currentConfigIndex = useDebugUMAPStore((state) => state.currentConfigIndex);
  const setCurrentConfigIndex = useDebugUMAPStore((state) => state.setCurrentConfigIndex);
  const getTotalConfigs = useDebugUMAPStore((state) => state.getTotalConfigs);
  const useCategoryColors = useDebugUMAPStore((state) => state.useCategoryColors);
  const setUseCategoryColors = useDebugUMAPStore((state) => state.setUseCategoryColors);
  const baseGlyphSize = useDebugUMAPStore((state) => state.baseGlyphSize);
  const setBaseGlyphSize = useDebugUMAPStore((state) => state.setBaseGlyphSize);
  const darkMode = useDebugUMAPStore((state) => state.darkMode);
  const setDarkMode = useDebugUMAPStore((state) => state.setDarkMode);
  const resetToDefaults = useDebugUMAPStore((state) => state.resetToDefaults);
  const paneRef = useRef(null);
  const paneInstanceRef = useRef(null);
  const bindingsRef = useRef({});

  // Gestion de la navigation au clavier
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (configs.length === 0) return;
      
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const newIndex = currentConfigIndex > 0 
          ? currentConfigIndex - 1 
          : configs.length - 1; // Boucler à la fin
        setCurrentConfigIndex(newIndex);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const newIndex = currentConfigIndex < configs.length - 1 
          ? currentConfigIndex + 1 
          : 0; // Boucler au début
        setCurrentConfigIndex(newIndex);
      }
    };

    // Ajouter l'écouteur d'événements
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [configs.length, currentConfigIndex]);

  // Initialiser Tweakpane
  useEffect(() => {
    console.log('Tweakpane useEffect déclenché:', {
      configsLength: configs.length,
      hasPaneInstance: !!paneInstanceRef.current,
      shouldInitialize: configs.length > 0 && !paneInstanceRef.current
    });
    
    if (configs.length === 0 || paneInstanceRef.current) return;
    
    // Vérifier que les valeurs sont valides
    console.log('Valeurs Tweakpane:', {
      currentConfigIndex,
      useCategoryColors,
      baseGlyphSize,
      darkMode,
      types: {
        currentConfigIndex: typeof currentConfigIndex,
        useCategoryColors: typeof useCategoryColors,
        baseGlyphSize: typeof baseGlyphSize,
        darkMode: typeof darkMode
      }
    });
    
    if (typeof currentConfigIndex !== 'number' || 
        typeof useCategoryColors !== 'boolean' || 
        typeof baseGlyphSize !== 'number' || 
        typeof darkMode !== 'boolean') {
      console.warn('Valeurs invalides pour Tweakpane, attente...', {
        currentConfigIndex,
        useCategoryColors,
        baseGlyphSize,
        darkMode
      });
      return;
    }

    // Vérifier que le conteneur existe
    console.log('Conteneur Tweakpane:', paneRef.current);
    if (!paneRef.current) {
      console.warn('Conteneur Tweakpane non trouvé');
      return;
    }

    const pane = new Pane({
      container: paneRef.current,
      title: 'UMAP Debug',
      expanded: true,
    });

    // Créer les bindings un par un pour éviter les erreurs
    try {
      // Slider de configuration
      const maxConfigIndex = Math.max(0, configs.length - 1);
      const validConfigIndex = Math.min(Math.max(0, currentConfigIndex), maxConfigIndex);
      
      bindingsRef.current.config = pane.addBinding(
        { configuration: validConfigIndex }, 
        'configuration', 
        {
          min: 0,
          max: maxConfigIndex,
          step: 1,
          label: 'Configuration (← →)',
        }
      ).on('change', (ev) => {
        setCurrentConfigIndex(ev.value);
      });

      // Toggle pour les couleurs
      bindingsRef.current.useCategoryColors = pane.addBinding(
        { useCategoryColors }, 
        'useCategoryColors', 
        {
          label: 'Category Colors',
        }
      ).on('change', (ev) => {
        setUseCategoryColors(ev.value);
      });

      // Slider pour la taille des glyphes
      const validGlyphSize = Math.min(Math.max(GLYPH_CONFIG.minSize, baseGlyphSize), GLYPH_CONFIG.maxSize);
      
      bindingsRef.current.baseGlyphSize = pane.addBinding(
        { baseGlyphSize: validGlyphSize }, 
        'baseGlyphSize', 
        {
          min: GLYPH_CONFIG.minSize,
          max: GLYPH_CONFIG.maxSize,
          step: GLYPH_CONFIG.stepSize,
          label: 'Glyph Size',
        }
      ).on('change', (ev) => {
        setBaseGlyphSize(ev.value);
      });

      // Toggle pour le dark mode
      bindingsRef.current.darkMode = pane.addBinding(
        { darkMode }, 
        'darkMode', 
        {
          label: 'Dark Mode',
        }
      ).on('change', (ev) => {
        setDarkMode(ev.value);
      });

      // Bouton pour reset le zoom
      pane.addButton({
        title: 'Reset Zoom',
      }).on('click', onResetZoom);

      paneInstanceRef.current = pane;
      console.log('Tweakpane initialisé avec succès!');
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de Tweakpane:', error);
      console.error('Détails de l\'erreur:', {
        configsLength: configs.length,
        currentConfigIndex,
        useCategoryColors,
        baseGlyphSize,
        darkMode
      });
    }

    return () => {
      if (paneInstanceRef.current) {
        paneInstanceRef.current.dispose();
        paneInstanceRef.current = null;
        bindingsRef.current = {};
      }
    };
  }, [configs.length]);

  // Mettre à jour les valeurs des contrôles (seulement si nécessaire)
  useEffect(() => {
    if (!paneInstanceRef.current) return;
    
    // Mettre à jour le slider de configuration seulement si la valeur a changé
    if (bindingsRef.current.config && bindingsRef.current.config.value !== currentConfigIndex) {
      try {
        bindingsRef.current.config.value = currentConfigIndex;
      } catch (error) {
        console.warn('Erreur lors de la mise à jour du slider de configuration:', error);
      }
    }
  }, [currentConfigIndex]);

  useEffect(() => {
    if (!paneInstanceRef.current) return;
    
    // Mettre à jour les autres contrôles seulement si les valeurs ont changé
    if (bindingsRef.current.useCategoryColors && bindingsRef.current.useCategoryColors.value !== useCategoryColors) {
      try {
        bindingsRef.current.useCategoryColors.value = useCategoryColors;
      } catch (error) {
        console.warn('Erreur lors de la mise à jour des couleurs:', error);
      }
    }
  }, [useCategoryColors]);

  useEffect(() => {
    if (!paneInstanceRef.current) return;
    
    if (bindingsRef.current.baseGlyphSize && bindingsRef.current.baseGlyphSize.value !== baseGlyphSize) {
      try {
        bindingsRef.current.baseGlyphSize.value = baseGlyphSize;
      } catch (error) {
        console.warn('Erreur lors de la mise à jour de la taille:', error);
      }
    }
  }, [baseGlyphSize]);

  useEffect(() => {
    if (!paneInstanceRef.current) return;
    
    if (bindingsRef.current.darkMode && bindingsRef.current.darkMode.value !== darkMode) {
      try {
        bindingsRef.current.darkMode.value = darkMode;
      } catch (error) {
        console.warn('Erreur lors de la mise à jour du dark mode:', error);
      }
    }
  }, [darkMode]);

  return { paneRef, paneInstanceRef };
}

import { useEffect, useRef, useCallback, useState } from 'react';
import { Pane } from 'tweakpane';
import { useFontMapStore } from '../../../store/fontMapStore';

/**
 * Hook pour gérer Tweakpane avec les contrôles de taille
 * Activé uniquement en mode debug (touche D)
 * Maintenant utilise Zustand pour éviter le props drilling
 */
export const useTweakpane = (darkMode) => {
  // Récupérer l'état depuis le store Zustand
  const {
    characterSize,
    variantSizeImpact,
    debugMode,
    setCharacterSize,
    setVariantSizeImpact,
    setDebugMode
  } = useFontMapStore();
  const paneRef = useRef(null);
  const paramsRef = useRef({
    size: characterSize,
    variantSizeImpact: variantSizeImpact,
    debugMode: debugMode
  });
  const [isDebugMode, setIsDebugMode] = useState(false);

  // Charger l'état du debug depuis localStorage
  useEffect(() => {
    const savedDebugState = localStorage.getItem('fontmap-debug-mode');
    if (savedDebugState === 'true') {
      setIsDebugMode(true);
    }
  }, []);

  // Fonction pour créer le pane Tweakpane
  const createPane = useCallback(() => {
    if (paneRef.current) return; // Déjà créé

    // Créer le pane
    const pane = new Pane({
      title: 'FontMap Debug Controls',
      container: document.body,
      expanded: true
    });

    // Configuration du style
    pane.element.style.position = 'fixed';
    pane.element.style.top = '80px';
    pane.element.style.right = '20px';
    pane.element.style.zIndex = '10000';
    pane.element.style.fontSize = '12px';
    pane.element.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    pane.element.style.border = '1px solid #333';
    pane.element.style.borderRadius = '8px';


    // Contrôle de debug mode
    pane.addBinding(paramsRef.current, 'debugMode', {
      label: '🐛 Debug Logs'
    }).on('change', (ev) => {
      console.log('🎯 Debug mode changed to:', ev.value);
      setDebugMode(ev.value);
    });

    // Contrôle de taille
    pane.addBinding(paramsRef.current, 'size', {
      label: 'Font Size',
      min: 0.1,
      max: 2.0,
      step: 0.05,
      format: (value) => `${value.toFixed(2)}x`
    }).on('change', (ev) => {
      setCharacterSize(ev.value);
    });

    // Checkbox pour l'impact des variantes sur la taille
    pane.addBinding(paramsRef.current, 'variantSizeImpact', {
      label: 'Variant Size Impact'
    }).on('change', (ev) => {
      setVariantSizeImpact(ev.value);
    });

    // Bouton pour réinitialiser
    pane.addButton({
      title: 'Reset'
    }).on('click', () => {
      setCharacterSize(1); // Valeur par défaut
      setVariantSizeImpact(false); // Valeur par défaut
      paramsRef.current.size = 1;
      paramsRef.current.variantSizeImpact = false;
      pane.refresh();
    });

    paneRef.current = pane;
  }, [setCharacterSize, setVariantSizeImpact, setDebugMode]);

  // Fonction pour détruire le pane
  const destroyPane = useCallback(() => {
    if (paneRef.current) {
      paneRef.current.dispose();
      paneRef.current = null;
    }
  }, []);

  // Fonction pour toggle le mode debug
  const toggleDebugMode = useCallback(() => {
    const newDebugMode = !isDebugMode;
    setIsDebugMode(newDebugMode);
    localStorage.setItem('fontmap-debug-mode', newDebugMode.toString());
    
    if (newDebugMode) {
      createPane();
      console.log('🐛 Debug mode activated - Press D to toggle');
    } else {
      destroyPane();
      console.log('🐛 Debug mode deactivated');
    }
  }, [isDebugMode, createPane, destroyPane]);

  // Initialiser le pane si le mode debug est activé
  useEffect(() => {
    if (isDebugMode) {
      createPane();
    } else {
      destroyPane();
    }
  }, [isDebugMode, createPane, destroyPane]);

  // Gestionnaire de touches pour activer/désactiver le debug
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Activer le debug avec la touche D
      if (event.key.toLowerCase() === 'd' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Vérifier que ce n'est pas dans un input
        const target = event.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
          return;
        }
        
        event.preventDefault();
        toggleDebugMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleDebugMode]);

  // Mettre à jour les valeurs quand elles changent
  useEffect(() => {
    if (paneRef.current) {
      paramsRef.current.size = characterSize;
      paramsRef.current.variantSizeImpact = variantSizeImpact;
      paneRef.current.refresh();
    }
  }, [characterSize, variantSizeImpact]);

  return {
    isDebugMode,
    toggleDebugMode
  };
};
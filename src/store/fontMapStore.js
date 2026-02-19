import { create } from 'zustand';

/**
 * Store Zustand pour gérer l'état global de la FontMap
 * Remplace le props drilling pour les valeurs les plus problématiques
 */
export const useFontMapStore = create((set, get) => ({
  // État de navigation
  selectedFont: null,
  hoveredFont: null,
  
  // État de visualisation
  characterSize: 1.5,
  variantSizeImpact: false,
  useCategoryColors: false,
  
  // Animated transition state (zoom/pan to font)
  isTransitioning: false,
  
  // Mode debug
  debugMode: false,
  
  // Actions pour la navigation
  setSelectedFont: (font) => {
    console.log('🎯 Store: Setting selectedFont to', font?.name || 'null');
    set({ selectedFont: font });
  },
  
  setHoveredFont: (font) => {
    console.log('🎯 Store: Setting hoveredFont to', font?.name || 'null');
    set({ hoveredFont: font });
  },
  
  // Actions pour la visualisation
  setCharacterSize: (size) => {
    console.log('🎯 Store: Setting characterSize to', size);
    set({ characterSize: size });
  },
  
  setVariantSizeImpact: (impact) => {
    console.log('🎯 Store: Setting variantSizeImpact to', impact);
    set({ variantSizeImpact: impact });
  },
  
  setUseCategoryColors: (val) => set({ useCategoryColors: val }),
  
  setIsTransitioning: (val) => set({ isTransitioning: val }),
  
  // Actions pour le debug
  setDebugMode: (debug) => {
    console.log('🎯 Store: Setting debugMode to', debug);
    set({ debugMode: debug });
  },
  
  // Action utilitaire pour réinitialiser l'état
  resetState: () => {
    console.log('🎯 Store: Resetting state');
    set({
      selectedFont: null,
      hoveredFont: null,
      isTransitioning: false,
      characterSize: 1.5,
      variantSizeImpact: false,
      useCategoryColors: false,
      debugMode: false
    });
  }
}));

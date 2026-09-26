import { create } from 'zustand';

/**
 * Zustand store for the FontMap global state
 * Replaces props drilling for the most shared values
 */
export const useFontMapStore = create((set, get) => ({
  // Navigation state
  selectedFont: null,
  hoveredFont: null,
  
  // Display state
  characterSize: 1.5,
  variantSizeImpact: false,
  useCategoryColors: false,
  glyph: 'A',
  
  // Animated transition state (zoom/pan to font)
  isTransitioning: false,
  
  // Custom preview text for the font panel (session only). Non-empty = text mode.
  previewText: '',
  // Mobile keeps the image preview until the user opts in
  previewTextOptIn: false,

  // Debug mode
  debugMode: false,

  setPreviewText: (previewText) => set({ previewText }),

  setPreviewTextOptIn: (previewTextOptIn) => set({ previewTextOptIn }),
  
  // Navigation actions
  setSelectedFont: (font) => set({ selectedFont: font }),

  setHoveredFont: (font) => set({ hoveredFont: font }),

  // Display actions
  setCharacterSize: (size) => set({ characterSize: size }),

  setVariantSizeImpact: (impact) => set({ variantSizeImpact: impact }),

  setUseCategoryColors: (val) => set({ useCategoryColors: val }),

  setGlyph: (glyph) => set({ glyph }),

  setIsTransitioning: (val) => set({ isTransitioning: val }),

  // Exploration state only: theme, category colors and glyph are preferences and survive
  clearExploration: () => set({
    selectedFont: null,
    hoveredFont: null,
    previewText: '',
    previewTextOptIn: false,
  }),
  
  // Debug actions
  setDebugMode: (debug) => set({ debugMode: debug }),

  // Reset the state
  resetState: () => {
    set({
      selectedFont: null,
      hoveredFont: null,
      isTransitioning: false,
      characterSize: 1.5,
      variantSizeImpact: false,
      useCategoryColors: false,
      glyph: 'A',
      debugMode: false
    });
  }
}));

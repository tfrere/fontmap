import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

/**
 * Store Zustand pour gérer l'état global de DebugUMAP
 */
export const useDebugUMAPStore = create(
  devtools(
    persist(
      (set, get) => ({
      // === État des configurations ===
      configs: [],
      currentConfigIndex: 0,
      loading: false,
      error: null,

      // === État visuel ===
      useCategoryColors: true,
      baseGlyphSize: 0.25,
      darkMode: false,
      showCentroids: true,

      // === Overlap removal (forceCollide post-UMAP) ===
      overlapRadius: 10,
      overlapTicks: 140,
      overlapOriginStrength: 0.03,

      // === État des glyphes ===
      currentFonts: [],
      dilatedFonts: [],       // fonts with overlap-resolved screen positions
      mappingFunctions: { mapX: null, mapY: null },
      glyphsLoaded: false,

      // === Actions pour les configurations ===
      setConfigs: (configs) => set({ configs }),
      setCurrentConfigIndex: (index) => set({ currentConfigIndex: index }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      
      // === Action pour définir un résultat UMAP calculé en direct ===
      setLiveResult: (result) => {
        console.log('📍 Store: Définition du résultat UMAP en direct');
        // Remplace toutes les configs par ce résultat unique
        set({
          configs: [result],
          currentConfigIndex: 0,
          error: null
        });
      },

      // === Actions pour l'état visuel ===
      setUseCategoryColors: (useCategoryColors) => set({ useCategoryColors }),
      setBaseGlyphSize: (baseGlyphSize) => set({ baseGlyphSize }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setShowCentroids: (showCentroids) => set({ showCentroids }),

      // === Actions pour l'overlap removal ===
      setOverlapRadius: (v) => set({ overlapRadius: v }),
      setOverlapTicks: (v) => set({ overlapTicks: v }),
      setOverlapOriginStrength: (v) => set({ overlapOriginStrength: v }),

      // === Actions pour les glyphes ===
      setCurrentFonts: (fonts) => set({ currentFonts: fonts }),
      setDilatedFonts: (fonts) => set({ dilatedFonts: fonts }),
      setMappingFunctions: (functions) => set({ mappingFunctions: functions }),
      setGlyphsLoaded: (loaded) => set({ glyphsLoaded: loaded }),

      // === Actions composites ===
      resetToDefaults: () => set({
        currentConfigIndex: 0,
        useCategoryColors: true,
        baseGlyphSize: 0.25,
        darkMode: false,
        showCentroids: true,
        overlapRadius: 10,
        overlapTicks: 140,
        overlapOriginStrength: 0.03,
        currentFonts: [],
        dilatedFonts: [],
        mappingFunctions: { mapX: null, mapY: null },
        glyphsLoaded: false,
        error: null
      }),

      // === Getters utiles ===
      getCurrentConfig: () => {
        const { configs, currentConfigIndex } = get();
        return configs[currentConfigIndex] || null;
      },

      getTotalConfigs: () => {
        const { configs } = get();
        return configs.length;
      }
    }),
    {
      name: 'debug-umap-persist',
      version: 2,
      partialize: (state) => ({
        useCategoryColors: state.useCategoryColors,
        baseGlyphSize: state.baseGlyphSize,
        darkMode: state.darkMode,
        showCentroids: state.showCentroids,
      }),
      migrate: (persisted) => ({
        useCategoryColors: persisted?.useCategoryColors ?? true,
        baseGlyphSize: persisted?.baseGlyphSize ?? 0.25,
        darkMode: persisted?.darkMode ?? false,
        showCentroids: persisted?.showCentroids ?? true,
      }),
    }
    ),
    {
      name: 'debug-umap-store', // Nom pour les devtools
    }
  )
);

// Export direct du store pour une utilisation simple

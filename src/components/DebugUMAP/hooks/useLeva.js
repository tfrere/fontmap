import React from 'react';
import { useControls } from 'leva';
import { useDebugUMAPStore } from '../store';
import { getConfig } from '../config/mapConfig.js';

const getStore = () => useDebugUMAPStore.getState();

/**
 * Hook pour gérer l'interface Leva avec Zustand.
 * All onChange callbacks read the store via getState() to avoid stale closures.
 */
export function useLeva({ onResetZoom }) {
  const configs = useDebugUMAPStore((state) => state.configs);
  const resetToDefaults = useDebugUMAPStore((state) => state.resetToDefaults);

  const maxConfig = Math.max(0, configs.length - 1);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [controls, setLeva] = useControls(() => ({
    Configuration: {
      value: Math.min(getStore().currentConfigIndex, maxConfig),
      min: 0,
      max: maxConfig,
      step: 1,
      onChange: (v) => {
        const s = getStore();
        const upperBound = s.configs.length - 1;
        const clamped = Math.max(0, Math.min(v, upperBound));
        s.setCurrentConfigIndex(clamped);
      },
    },
    'Category Colors': {
      value: getStore().useCategoryColors,
      onChange: (v) => { getStore().setUseCategoryColors(v); },
    },
    'Glyph Size': {
      value: getStore().baseGlyphSize,
      min: getConfig('glyph.size.min', 0.05),
      max: getConfig('glyph.size.max', 1.0),
      step: getConfig('glyph.size.step', 0.05),
      onChange: (v) => { getStore().setBaseGlyphSize(v); },
    },
    'Dark Mode': {
      value: getStore().darkMode,
      onChange: (v) => { getStore().setDarkMode(v); },
    },
    'Show Centroids': {
      value: getStore().showCentroids,
      onChange: (v) => { getStore().setShowCentroids(v); },
    },
    'Reset Zoom': { button: true },
    'Reset Defaults': { button: true },
  }), [maxConfig]);

  const resetZoomFlag = controls['Reset Zoom'];
  const resetDefaultsFlag = controls['Reset Defaults'];

  React.useEffect(() => {
    if (resetZoomFlag) onResetZoom();
  }, [resetZoomFlag, onResetZoom]);

  React.useEffect(() => {
    if (resetDefaultsFlag) {
      resetToDefaults();
      if (setLeva) {
        setLeva({
          Configuration: 0,
          'Category Colors': true,
          'Glyph Size': 0.25,
          'Dark Mode': false,
          'Show Centroids': true,
        });
      }
    }
  }, [resetDefaultsFlag, resetToDefaults, setLeva]);

  return {};
}

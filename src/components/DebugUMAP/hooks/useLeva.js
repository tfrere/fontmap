import React from 'react';
import { useControls, folder } from 'leva';
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
    'Overlap Removal 🔧': folder({
      'Radius (px)': {
        value: getStore().overlapRadius,
        min: 0,
        max: 80,
        step: 1,
        onChange: (v) => { getStore().setOverlapRadius(v); },
      },
      Ticks: {
        value: getStore().overlapTicks,
        min: 0,
        max: 300,
        step: 10,
        onChange: (v) => { getStore().setOverlapTicks(v); },
      },
      'Pull to origin': {
        value: getStore().overlapOriginStrength,
        min: 0,
        max: 0.5,
        step: 0.01,
        onChange: (v) => { getStore().setOverlapOriginStrength(v); },
      },
    }, { collapsed: true }),
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

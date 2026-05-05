/**
 * Panneau de calcul UMAP en direct (via Leva)
 */

import React, { useEffect, useRef, useState } from 'react';
import { useControls, button, folder } from 'leva';
import { useLiveUMAP } from '../hooks';
import { useDebugUMAPStore } from '../store';

const DEFAULTS = { nNeighbors: 12, minDist: 1.0, enableFontFusion: true };

const LiveUMAPPanel = ({ onResult }) => {
  const { calculate, isCalculating, progress, error, result: lastResult } = useLiveUMAP();
  const dilatedFonts = useDebugUMAPStore((state) => state.dilatedFonts);
  const timeoutRef = useRef(null);
  const userChangedRef = useRef(false);

  const lastResultRef = useRef(lastResult);
  useEffect(() => {
    lastResultRef.current = lastResult;
  }, [lastResult]);

  const [config, setConfig] = useState(DEFAULTS);

  const handleUserChange = (key, v) => {
    setConfig(prev => {
      if (prev[key] === v) return prev;
      userChangedRef.current = true;
      return { ...prev, [key]: v };
    });
  };

  const dilatedFontsRef = useRef(dilatedFonts);
  useEffect(() => { dilatedFontsRef.current = dilatedFonts; }, [dilatedFonts]);

  const handleExport = () => {
    const result = lastResultRef.current;
    if (!result) {
      console.warn('⚠️ Aucun résultat à exporter');
      return;
    }

    // If overlap removal was applied, export the dilated positions
    const fonts = dilatedFontsRef.current?.length > 0 ? dilatedFontsRef.current : result.fonts;
    const exportData = { ...result, fonts };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'font-map.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('💾 Export lancé !');
  };

  // eslint-disable-next-line no-unused-vars
  const [, set] = useControls(() => ({
    'Live UMAP 🧪': folder({
      nNeighbors: {
        value: DEFAULTS.nNeighbors,
        min: 5,
        max: 50,
        step: 1,
        label: 'Neighbors',
        onChange: (v) => handleUserChange('nNeighbors', v)
      },
      minDist: {
        value: DEFAULTS.minDist,
        min: 0.1,
        max: 2.0,
        step: 0.1,
        label: 'Min Dist',
        onChange: (v) => handleUserChange('minDist', v)
      },
      enableFontFusion: {
        value: DEFAULTS.enableFontFusion,
        label: 'Fusion Families',
        onChange: (v) => handleUserChange('enableFontFusion', v)
      },
      'Export JSON': button(() => handleExport()),
      Status: {
        value: 'Idle',
        editable: false,
        label: 'Status'
      }
    }, { collapsed: false })
  }));

  useEffect(() => {
    const statusText = isCalculating
      ? `${progress?.stage || 'Calculating'}... ${progress?.progress || 0}%`
      : (lastResult ? 'Ready' : 'Idle');

    set({ Status: statusText });
  }, [isCalculating, progress, lastResult, set]);

  // Only calculate when the user has actually interacted with the controls
  useEffect(() => {
    if (!userChangedRef.current) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      console.log('🔄 Triggering Live UMAP calculation...', config);
      try {
        const result = await calculate({
          nNeighbors: config.nNeighbors,
          minDist: config.minDist,
          enableFontFusion: config.enableFontFusion,
          randomSeed: 42
        });

        if (onResult) {
          onResult(result);
        }
      } catch (err) {
        console.error('❌ Error in Live UMAP:', err);
      }
    }, 600);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [config.nNeighbors, config.minDist, config.enableFontFusion, calculate, onResult]);

  // Rendu minimal (juste pour le debug ou les erreurs critiques)
  if (error) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: '#ffebee',
        color: '#c62828',
        padding: '10px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 10000
      }}>
        ❌ {error}
      </div>
    );
  }

  return null; // Tout est dans Leva !
};

export default LiveUMAPPanel;

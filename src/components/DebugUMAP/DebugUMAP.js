import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useLeva, useZoom, useGlyphRenderer, useConfigs, useKeyboardNavigation } from './hooks';
import { ConfigDisplay, MapContainer, ErrorDisplay, LoadingDisplay, LiveUMAPPanel } from './components';
import { useDebugUMAPStore } from './store';
import './styles/index.css';

/**
 * Composant principal DebugUMAP - Version refactorisée avec Zustand
 */
const DebugUMAP = () => {
  console.log('DebugUMAP: Composant rendu');
  const svgRef = useRef(null);
  const [svgReady, setSvgReady] = useState(false);
  const [showLivePanel, setShowLivePanel] = useState(true);

  const error = useDebugUMAPStore((state) => state.error);
  const loading = useDebugUMAPStore((state) => state.loading);
  const baseGlyphSize = useDebugUMAPStore((state) => state.baseGlyphSize);
  const darkMode = useDebugUMAPStore((state) => state.darkMode);
  const setLiveResult = useDebugUMAPStore((state) => state.setLiveResult);

  // Hook pour charger les configurations
  useConfigs();

  // Détecter quand le SVG est monté
  useEffect(() => {
    if (svgRef.current && !svgReady) {
      console.log('DebugUMAP: SVG détecté, marqué comme prêt');
      setSvgReady(true);
    }
  }, [svgReady]);

  // Hook pour le rendu des glyphes
  useGlyphRenderer({ svgRef, enabled: svgReady });

  // Hook pour le zoom
  const { resetZoom } = useZoom(svgRef, baseGlyphSize, svgReady, darkMode);

  // Hook pour Leva
  useLeva({ onResetZoom: resetZoom });

  // Hook pour la navigation au clavier
  useKeyboardNavigation();

  // Gestion du résultat UMAP calculé en direct
  const handleLiveResult = useCallback((result) => {
    console.log('✅ Résultat UMAP reçu:', result);
    setLiveResult(result);
  }, [setLiveResult]);

  // États de chargement et d'erreur
  if (loading) {
    return <LoadingDisplay />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  return (
    <div className={`debug-umap-container ${darkMode ? 'dark-mode' : ''}`}>
      <ConfigDisplay />
      <MapContainer ref={svgRef} />

      {/* Panneau de calcul UMAP en direct */}
      {showLivePanel && (
        <LiveUMAPPanel onResult={handleLiveResult} />
      )}

      {/* Bouton pour afficher/masquer le panneau */}
      <button
        onClick={() => setShowLivePanel(!showLivePanel)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 20px',
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 10001,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
      >
        {showLivePanel ? '🙈 Hide Live UMAP' : '🧪 Show Live UMAP'}
      </button>
    </div>
  );
};

export default DebugUMAP;

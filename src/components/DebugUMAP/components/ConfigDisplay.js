import React, { useState, useEffect } from 'react';
import { useDebugUMAPStore } from '../store';

/**
 * Composant pour afficher les informations de la configuration actuelle
 */
export function ConfigDisplay() {
  const currentConfig = useDebugUMAPStore((state) => state.getCurrentConfig());
  const darkMode = useDebugUMAPStore((state) => state.darkMode);
  const [fontCount, setFontCount] = useState(null);

  // Charger le nombre de polices pour cette configuration
  useEffect(() => {
    if (!currentConfig?.filename) {
      setFontCount(null);
      return;
    }

    fetch(`/debug-umap/${currentConfig.filename}`)
      .then(res => res.json())
      .then(data => {
        setFontCount(data.fonts?.length || 0);
      })
      .catch(() => {
        setFontCount(null);
      });
  }, [currentConfig?.filename]);

  if (!currentConfig) return null;

  return (
    <div className={`config-display ${darkMode ? 'dark-mode' : ''}`}>
      <div className="config-section">
        <h4>Configuration UMAP</h4>
        <div className="config-item">
          <span className="config-label">Run</span>
          <span className="config-value">{currentConfig.testName || 'N/A'}</span>
        </div>
        
        <div className="config-item">
          <span className="config-label">nNeighbors</span>
          <span className="config-value">{currentConfig.config?.nNeighbors || 'N/A'}</span>
        </div>
        
        <div className="config-item">
          <span className="config-label">minDist</span>
          <span className="config-value">{currentConfig.config?.minDist || 'N/A'}</span>
        </div>
        
        <div className="config-item">
          <span className="config-label">randomSeed</span>
          <span className="config-value">{currentConfig.config?.randomSeed || 'N/A'}</span>
        </div>
      </div>

      <div className="config-section">
        <h4>Métadonnées</h4>
        {currentConfig.metadata && (
          <>
            <div className="config-item">
              <span className="config-label">Méthode</span>
              <span className="config-value">{currentConfig.metadata.method || 'N/A'}</span>
            </div>
            
            <div className="config-item">
              <span className="config-label">Généré le</span>
              <span className="config-value">
                {currentConfig.metadata.generated_at ? 
                  new Date(currentConfig.metadata.generated_at).toLocaleString('fr-FR') : 'N/A'}
              </span>
            </div>
            
            {currentConfig.metadata.note && (
              <div className="config-item">
                <span className="config-label">Note</span>
                <span className="config-value">{currentConfig.metadata.note}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="config-section">
        <h4>Statistiques</h4>
        {fontCount !== null && (
          <div className="config-item">
            <span className="config-label">Total Fonts</span>
            <span className="config-value">{fontCount}</span>
          </div>
        )}
        
        {currentConfig.stats && (
          <>
            <div className="config-item">
              <span className="config-label">embeddingDimensions</span>
              <span className="config-value">{currentConfig.stats.embeddingDimensions || 'N/A'}</span>
            </div>
            
            <div className="config-item">
              <span className="config-label">categoryDimensions</span>
              <span className="config-value">{currentConfig.stats.categoryDimensions || 'N/A'}</span>
            </div>
            
            {currentConfig.stats.xRange && currentConfig.stats.yRange && (
              <div className="config-item">
                <span className="config-label">Aire</span>
                <span className="config-value">
                  {((currentConfig.stats.xRange[1] - currentConfig.stats.xRange[0]) * 
                    (currentConfig.stats.yRange[1] - currentConfig.stats.yRange[0])).toFixed(2)}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import React from 'react';

/**
 * Composant pour afficher l'état de chargement
 */
export function LoadingDisplay() {
  return (
    <div className="debug-umap-container">
      <div className="loading">
        Chargement des configurations UMAP...
      </div>
    </div>
  );
}

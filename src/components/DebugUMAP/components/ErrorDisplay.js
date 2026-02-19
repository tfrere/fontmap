import React from 'react';

/**
 * Composant pour afficher les erreurs
 */
export function ErrorDisplay({ error }) {
  if (!error) return null;

  return (
    <div className="debug-umap-container">
      <div className="error">
        <h2>Erreur</h2>
        <p>{error}</p>
        <p>Assurez-vous d'avoir exécuté les commandes suivantes :</p>
        <pre>
          npm run batch-test<br/>
          npm run copy-results
        </pre>
      </div>
    </div>
  );
}

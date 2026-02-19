import React from 'react';

/**
 * Composant spinner léger réutilisable
 */
const Spinner = ({ 
  size = '16px', 
  color = 'currentColor', 
  className = '',
  minHeight = null,
  centered = true
}) => {
  const spinnerElement = (
    <div 
      className={`spinner ${className}`}
      style={{
        width: size,
        height: size,
        border: `2px solid transparent`,
        borderTop: `2px solid ${color}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        display: 'inline-block'
      }}
    />
  );

  // Si minHeight est spécifiée, wrapper dans un conteneur avec la hauteur minimale
  if (minHeight) {
    return (
      <div 
        style={{
          minHeight: minHeight,
          display: centered ? 'flex' : 'block',
          justifyContent: centered ? 'center' : 'flex-start',
          alignItems: centered ? 'center' : 'flex-start',
          width: '100%',
          boxSizing: 'border-box' /* Améliorer la gestion de l'espace */
        }}
      >
        {spinnerElement}
      </div>
    );
  }

  return spinnerElement;
};

export default Spinner;

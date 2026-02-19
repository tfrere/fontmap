import React, { useState, useEffect } from 'react';
import Spinner from './Spinner';

/**
 * Composant pour afficher un glyphe de police avec spinner
 */
const FontGlyph = ({ 
  symbolId, 
  size = 16, 
  className = '',
  style = {},
  onLoad = null,
  onError = null
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbolId) {
      setLoading(false);
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);

    // Vérifier si le symbole existe dans le sprite
    const checkSymbol = () => {
      const symbol = document.getElementById(symbolId);
      if (symbol) {
        setLoading(false);
        setError(false);
        if (onLoad) onLoad();
      } else {
        // Attendre un peu et réessayer
        setTimeout(checkSymbol, 50);
      }
    };

    checkSymbol();
  }, [symbolId, onLoad, onError]);

  if (loading) {
    return (
      <div 
        className={`font-glyph-loading ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          ...style
        }}
      >
        <Spinner size={`${size * 0.6}px`} color="currentColor" />
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className={`font-glyph-error ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          color: '#999',
          fontSize: `${size * 0.5}px`,
          ...style
        }}
      >
        A
      </div>
    );
  }

  return (
    <svg 
      className={className}
      style={{
        width: size,
        height: size,
        ...style
      }}
    >
      <use href={`#${symbolId}`} />
    </svg>
  );
};

export default FontGlyph;

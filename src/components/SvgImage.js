import React, { useState, useEffect } from 'react';
import Spinner from './Spinner';

/**
 * Composant wrapper pour les images SVG avec spinner de chargement
 */
const SvgImage = ({ 
  src, 
  alt = '', 
  className = '', 
  style = {},
  spinnerSize = '16px',
  spinnerColor = 'currentColor',
  onLoad = null,
  onError = null
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);

    // Créer une image pour tester le chargement
    const img = new Image();
    
    img.onload = () => {
      setLoading(false);
      setError(false);
      if (onLoad) onLoad();
    };
    
    img.onerror = () => {
      setLoading(false);
      setError(true);
      if (onError) onError();
    };
    
    img.src = src;
  }, [src, onLoad, onError]);

  if (loading) {
    return (
      <div 
        className={`svg-image-loading ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style
        }}
      >
        <Spinner size={spinnerSize} color={spinnerColor} />
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className={`svg-image-error ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: '12px',
          ...style
        }}
      >
        ⚠️
      </div>
    );
  }

  return (
    <img 
      src={src}
      alt={alt}
      className={className}
      style={style}
    />
  );
};

export default SvgImage;

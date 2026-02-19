import React, { forwardRef, useEffect, useState } from 'react';

/**
 * Composant conteneur pour la carte SVG
 */
export const MapContainer = forwardRef(({ className = '', children }, ref) => {
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  return (
    <div className="map-container">
      <svg 
        ref={ref} 
        className={`debug-umap-svg ${className}`}
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        {children}
      </svg>
    </div>
  );
});

MapContainer.displayName = 'MapContainer';

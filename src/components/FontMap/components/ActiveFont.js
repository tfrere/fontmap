import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getFontSymbolId, generateGoogleFontsUrl } from '../utils/fontUtils';
import Spinner from '../../Spinner';

const DEFAULT_FONTS = [
  'Arial, sans-serif',
  'Times New Roman, serif',
  'Georgia, serif',
  'Helvetica, sans-serif',
  'Courier New, monospace',
  'Verdana, sans-serif',
  'Trebuchet MS, sans-serif',
  'Tahoma, sans-serif'
];

/**
 * Component to display the active font details and similar fonts
 */
const ActiveFont = ({ selectedFont, fonts, darkMode, onClose, onFontSelect }) => {
  const [fontPreviewLoaded, setFontPreviewLoaded] = useState(false);
  const [sentencePreviewLoaded, setSentencePreviewLoaded] = useState(false);
  const [similarFontsLoaded, setSimilarFontsLoaded] = useState({});
  const imageLoadTimeouts = useRef({});
  const mainSentenceTimeout = useRef(null);
  const [placeholderFontIndex, setPlaceholderFontIndex] = useState(0);

  // Reset loading states UNIQUEMENT quand selectedFont change
  useEffect(() => {
    setFontPreviewLoaded(false);
    setSentencePreviewLoaded(false);
    setSimilarFontsLoaded({});

    Object.values(imageLoadTimeouts.current).forEach(timeout => clearTimeout(timeout));
    imageLoadTimeouts.current = {};

    if (mainSentenceTimeout.current) {
      clearTimeout(mainSentenceTimeout.current);
      mainSentenceTimeout.current = null;
    }

    // <use> elements don't fire onLoad — simulate with a short timeout
    const timer = setTimeout(() => setFontPreviewLoaded(true), 100);

    mainSentenceTimeout.current = setTimeout(() => setSentencePreviewLoaded(true), 500);

    return () => {
      clearTimeout(timer);
      if (mainSentenceTimeout.current) {
        clearTimeout(mainSentenceTimeout.current);
      }
    };
  }, [selectedFont]);

  useEffect(() => {
    if (selectedFont) return;

    const interval = setInterval(() => {
      setPlaceholderFontIndex(prev => (prev + 1) % DEFAULT_FONTS.length);
    }, 200);

    return () => clearInterval(interval);
  }, [selectedFont]);

  const handleImageLoad = useCallback((fontName) => {
    if (imageLoadTimeouts.current[fontName]) {
      clearTimeout(imageLoadTimeouts.current[fontName]);
      delete imageLoadTimeouts.current[fontName];
    }
    setSimilarFontsLoaded(prev => ({ ...prev, [fontName]: true }));
  }, []);

  const similarFonts = useMemo(() => {
    if (!selectedFont || !fonts || fonts.length === 0) return [];
    const sel = fonts.find(f => f.name === selectedFont.name);
    if (!sel) return [];

    // Use pre-computed high-dimensional k-NN neighbors when available
    if (sel.neighbors && sel.neighbors.length > 0) {
      const fontById = new Map(fonts.map(f => [f.id, f]));
      return sel.neighbors
        .map((neighborId, rank) => {
          const font = fontById.get(neighborId);
          if (!font) return null;
          return { font, distance: rank + 1 };
        })
        .filter(Boolean)
        .slice(0, 4);
    }

    // Fallback: Euclidean distance in UMAP 2D space
    return fonts
      .filter(f => f.name !== selectedFont.name)
      .map(f => {
        const dx = f.x - sel.x;
        const dy = f.y - sel.y;
        return { font: f, distance: Math.sqrt(dx * dx + dy * dy) };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
  }, [selectedFont, fonts]);

  useEffect(() => {
    if (similarFonts.length === 0) return;
    const newTimeouts = {};
    similarFonts.forEach(({ font }) => {
      if (!similarFontsLoaded[font.name] && !imageLoadTimeouts.current[font.name]) {
        const id = setTimeout(() => {
          handleImageLoad(font.name);
        }, 1000);
        imageLoadTimeouts.current[font.name] = id;
        newTimeouts[font.name] = id;
      }
    });
    return () => {
      Object.values(newTimeouts).forEach(id => clearTimeout(id));
    };
  }, [similarFonts, similarFontsLoaded, handleImageLoad]);

  if (!selectedFont) {
    return (
      <div className="font-details">
        <div className="font-details-placeholder">
          <div className="placeholder-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
              <text 
                x="11" 
                y="14" 
                textAnchor="middle" 
                fontSize="10" 
                fill="currentColor" 
                fontWeight="100"
                opacity={0.65}
                style={{ 
                  fontFamily: DEFAULT_FONTS[placeholderFontIndex],
                  fontStyle: 'normal',
                  fontVariant: 'normal'
                }}
              >
                A
              </text>
            </svg>
          </div>
          <div className="placeholder-content">
            <h3>Explore fonts</h3>
            <p>Click any font on the map to discover its details and find similar typefaces.</p>
          </div>
        </div>
      </div>
    );
  }

  const symbolId = getFontSymbolId(selectedFont.imageName || selectedFont.name);
  const category = selectedFont.family || 'sans-serif';
  
  // Générer l'URL Google Fonts (utiliser l'URL existante ou en forger une nouvelle)
  const googleFontsUrl = selectedFont.google_fonts_url || generateGoogleFontsUrl(selectedFont.name);
  
  // Vérifier si c'est une police fusionnée
  const isMergedFont = selectedFont.fusionInfo && selectedFont.fusionInfo.merged;
  const variantCount = selectedFont.variantCount || 1;

  return (
    <div className="font-details">
      <div className="font-details-content">
        {/* Label Active Font en dehors de la carte */}
        <div className="active-font-label">Active Font</div>
        
        {/* Carte unifiée avec active font et bouton Google Fonts */}
        <div className="active-font-card">
          <div className="active-font-content">
            {/* Lettre à gauche */}
            <div className="font-letter-preview">
              {!fontPreviewLoaded && (
                <Spinner 
                  size="20px" 
                  color={darkMode ? '#ffffff' : '#000000'} 
                  minHeight="120px"
                  centered={true}
                />
              )}
              <svg 
                width="120" 
                height="120" 
                viewBox="0 0 120 120"
                style={{ 
                  display: fontPreviewLoaded ? 'block' : 'none',
                  transition: 'opacity 0.15s ease-in-out'
                }}
              >
                {symbolId && (
                  <use 
                    href={`#${symbolId}`} 
                    fill={darkMode ? '#ffffff' : '#000000'}
                    style={{ fill: darkMode ? '#ffffff' : '#000000' }}
                  />
                )}
              </svg>
            </div>
            
            {/* Info à droite */}
            <div className="font-info-compact">
              <h2 className="font-name-compact">{selectedFont.name}</h2>
              {isMergedFont && (
                <div className="font-fusion-badge" style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  color: darkMode ? '#ffffff' : '#000000'
                }}>
                  <span className="fusion-text">{variantCount} variants</span>
                </div>
              )}
              <p className="font-category-compact">{category}</p>
              
              {/* Weights et Styles en discret */}
              <div className="font-metadata">
                {selectedFont.weights && selectedFont.weights.length > 0 && (
                  <span className="font-weights">
                    {selectedFont.weights.join(', ')}
                  </span>
                )}
                {selectedFont.styles && selectedFont.styles.length > 0 && (
                  <span className="font-styles">
                    {selectedFont.styles.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Sentence en dessous */}
          <div className="font-sentence-compact">
            {!sentencePreviewLoaded && (
              <Spinner 
                size="16px" 
                color={darkMode ? '#ffffff' : '#000000'} 
                minHeight="49px"
                centered={true}
                className="sentence-preview-spinner"
              />
            )}
            <img 
              src={`/data/sentences/${(selectedFont.imageName || selectedFont.name).toLowerCase().replace(/\s+/g, '_')}_sentence.svg`}
              alt={`${selectedFont.name} sentence preview`}
              style={{ 
                width: '100%', 
                height: 'auto', 
                maxWidth: '100%',
                minHeight: '49px', /* Hauteur fixe des images SVG de sentence (165x49) */
                filter: darkMode ? 'invert(1)' : 'none',
                display: sentencePreviewLoaded ? 'block' : 'none',
                transition: 'opacity 0.15s ease-in-out'
              }}
              onLoad={() => setSentencePreviewLoaded(true)}
              onError={(e) => {
                e.target.style.display = 'none';
                setSentencePreviewLoaded(true);
              }}
            />
          </div>

          {/* Bouton Google Fonts intégré dans la carte */}
          <div className="font-action-section"> 
            <a 
              href={googleFontsUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="action-btn ghost google-fonts-link"
              title={`View ${selectedFont.name} on Google Fonts`}
              style={{ display: googleFontsUrl ? 'flex' : 'none' }}
            >
              Find on Google Fonts
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15,3 21,3 21,9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Similar Fonts */}
        <div className="similar-fonts">
          <h4 className="similar-fonts-title">Similar Fonts</h4>
          {similarFonts.length === 0 ? (
            <p className="no-similar">No similar fonts found</p>
          ) : (
            <div className="similar-fonts-list">
              {similarFonts.map(({ font, distance }) => {
                const imageName = font.imageName || font.name;
                const sentenceImagePath = `/data/sentences/${imageName.toLowerCase().replace(/\s+/g, '_')}_sentence.svg`;

                return (
                  <div 
                    key={font.name} 
                    className="similar-font-item"
                    title={`${font.name} (distance: ${distance.toFixed(2)})`}
                    onClick={() => onFontSelect && onFontSelect(font)}
                  >
                    <div className="similar-font-glyph">
                      <svg 
                        width="32" 
                        height="32" 
                        viewBox="0 0 24 24"
                        className="font-glyph-small"
                      >
                        <use 
                          href={`#${getFontSymbolId(font.imageName || font.name)}`} 
                          fill={darkMode ? '#ffffff' : '#000000'}
                          style={{ fill: darkMode ? '#ffffff' : '#000000' }}
                        />
                      </svg>
                    </div>
                    <div className="similar-font-info">
                      <span className="font-name">{font.name}</span>
                      <span className="font-family">{font.family}</span>
                    </div>
                    <div className="similar-font-sentence">
                      {!similarFontsLoaded[font.name] && (
                        <Spinner 
                          size="16px" 
                          color={darkMode ? '#ffffff' : '#000000'} 
                          minHeight="49px"
                          centered={true}
                          className="similar-font-spinner"
                        />
                      )}
                      <img 
                        src={sentenceImagePath}
                        alt={`${font.name} sentence preview`}
                        style={{ 
                          height: 'auto', 
                          minHeight: '49px', /* Hauteur fixe des images SVG de sentence (165x49) */
                          maxHeight: '49px',
                          maxWidth: '100%',
                          objectFit: 'contain',
                          filter: darkMode ? 'invert(1)' : 'none',
                          display: similarFontsLoaded[font.name] ? 'block' : 'none',
                          transition: 'opacity 0.15s ease-in-out'
                        }}
                        onLoad={() => {
                          handleImageLoad(font.name);
                        }}
                        onError={(e) => {
                          // Hide image if it doesn't exist
                          e.target.style.display = 'none';
                          handleImageLoad(font.name);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActiveFont;

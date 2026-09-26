import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { getFontSymbolId, generateGoogleFontsUrl } from '../utils/fontUtils';
import { formatGoogleCategory } from '../utils/categories';
import { formatTag, getFontStyleTags } from '../utils/fontSearch';
import { useFontMapStore } from '../../../store/fontMapStore';
import { useDwell, useWebFont } from '../hooks/useWebFont';
import { ActivePreviewText, SimilarPreviewText } from './PreviewText';
import Spinner from '../../Spinner';

// A held arrow key (30 ms auto-repeat) commits a new selection every 50-100 ms,
// bounded by the map re-render. A font kept ~30 ms longer than that slowest step
// is where the user stopped, so only then is its web font requested.
const ACTIVE_FONT_DWELL_MS = 130;
const SIMILAR_FONTS_DWELL_MS = 300;

// Fonts cycled inside the empty state magnifier; system fonts only, nothing to download.
const DEFAULT_FONTS = [
  'Georgia, serif',
  'Helvetica, Arial, sans-serif',
  'Courier New, monospace',
  'Times New Roman, serif',
  'Trebuchet MS, sans-serif',
  'Didot, Bodoni 72, serif',
  'Futura, Avenir, sans-serif',
];
const PLACEHOLDER_CYCLE_MS = 450;

const MAX_VISIBLE_ALIASES = 2;

/**
 * Component to display the active font details and similar fonts
 */
const ActiveFont = ({ selectedFont, fonts, darkMode, isMobile = false, onClose, onFontSelect, onStyleSelect, activeStyleTag = null }) => {
  const previewText = useFontMapStore(s => s.previewText);
  const setPreviewText = useFontMapStore(s => s.setPreviewText);
  const previewOptIn = useFontMapStore(s => s.previewTextOptIn);
  const setPreviewOptIn = useFontMapStore(s => s.setPreviewTextOptIn);
  const [previewFocused, setPreviewFocused] = useState(false);
  const previewInputRef = useRef(null);
  const textMode = previewText.length > 0;
  const previewEditable = !isMobile || previewOptIn || textMode;
  const activeWebFont = useWebFont(selectedFont, { enabled: textMode, delay: ACTIVE_FONT_DWELL_MS });
  const activeSettled = activeWebFont.status === 'loaded' || activeWebFont.status === 'failed';
  const similarDwellDone = useDwell(selectedFont?.name, textMode, SIMILAR_FONTS_DWELL_MS);
  const canLoadSimilar = textMode && similarDwellDone && activeSettled;

  const enablePreviewText = () => {
    // Synchronous render so focus() runs inside the tap (iOS only opens the keyboard then)
    flushSync(() => setPreviewOptIn(true));
    previewInputRef.current?.focus();
  };

  const clearPreviewText = (event) => {
    event.stopPropagation();
    setPreviewText('');
    previewInputRef.current?.blur();
  };

  const [fontPreviewLoaded, setFontPreviewLoaded] = useState(false);
  const [sentencePreviewLoaded, setSentencePreviewLoaded] = useState(false);
  const [similarFontsLoaded, setSimilarFontsLoaded] = useState({});
  const imageLoadTimeouts = useRef({});
  const mainSentenceTimeout = useRef(null);
  const [placeholderFontIndex, setPlaceholderFontIndex] = useState(0);

  // Reset loading states ONLY when selectedFont changes
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

    // <use> elements don't fire onLoad - simulate with a short timeout
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
    if (selectedFont) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const interval = setInterval(() => {
      setPlaceholderFontIndex(prev => (prev + 1) % DEFAULT_FONTS.length);
    }, PLACEHOLDER_CYCLE_MS);
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
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg width="88" height="88" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle className="empty-state-lens-fill" cx="10.5" cy="10.5" r="7.5" />
              <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="0.9" />
              <path d="m16.1 16.1 5.2 5.2" stroke="currentColor" strokeWidth="1.6" />
              <text
                className="empty-state-glyph"
                x="10.5"
                y="13.6"
                textAnchor="middle"
                fontSize="9"
                style={{ fontFamily: DEFAULT_FONTS[placeholderFontIndex] }}
              >
                A
              </text>
            </svg>
          </div>

          <h3 className="empty-state-title">Explore fonts</h3>
          <p className="empty-state-lead">
            Click any font on the map to discover its details and find similar typefaces.
          </p>

          {/* Pointer and touch variants are swapped in CSS; keyboard-only rows hide on touch */}
          <ul className="empty-state-hints">
            <li>
              <span className="hint-pointer"><kbd>drag</kbd><kbd>scroll</kbd></span>
              <span className="hint-touch"><kbd>drag</kbd><kbd>pinch</kbd></span>
              to move around
            </li>
            <li className="hint-keyboard">
              <span>
                <kbd aria-label="Left">←</kbd><kbd aria-label="Up">↑</kbd><kbd aria-label="Down">↓</kbd><kbd aria-label="Right">→</kbd>
              </span>
              to step between neighbours
            </li>
            <li className="hint-keyboard">
              <span><kbd>a</kbd><span className="hint-range">-</span><kbd>z</kbd></span>
              to switch the glyph
            </li>
          </ul>
        </div>
      </div>
    );
  }

  const symbolId = getFontSymbolId(selectedFont.imageName || selectedFont.name);
  const category = selectedFont.family || 'sans-serif';
  
  // Google Fonts URL (use the existing one or build a new one)
  const googleFontsUrl = selectedFont.google_fonts_url || generateGoogleFontsUrl(selectedFont.name);
  
  // Whether this is a merged font
  const isMergedFont = selectedFont.fusionInfo && selectedFont.fusionInfo.merged;
  const variantCount = selectedFont.variantCount || 1;
  const aliases = selectedFont.aliases || [];
  const styleTags = getFontStyleTags(selectedFont);

  return (
    <div className="font-details">
      <button
        type="button"
        className="font-details-back"
        onClick={onClose}
        aria-label="Back to map"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back</span>
      </button>
      <div className="font-details-content">
        {/* Active Font label outside the card */}
        <div className="active-font-label">Active Font</div>
        
        {/* Card with the active font and the Google Fonts button */}
        <div className="active-font-card">
          <div className="active-font-content">
            {/* Letter on the left */}
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
            
            {/* Info on the right */}
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
              {selectedFont.google_category && selectedFont.google_category !== category && (
                <p className="font-google-category">
                  Google Fonts: {formatGoogleCategory(selectedFont.google_category)}
                </p>
              )}
              
              {/* Weights and styles, low-key */}
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
              {styleTags.length > 0 && (
                <div className="font-style-tags" aria-label="Styles">
                  {styleTags.map(({ tag, predicted }) => (
                    <button
                      key={tag}
                      type="button"
                      className={`font-style-tag ${predicted ? 'predicted' : ''} ${activeStyleTag === tag ? 'active' : ''}`}
                      onClick={() => onStyleSelect && onStyleSelect(tag)}
                      title={predicted
                        ? `Predicted from the glyph shapes (not tagged by Google Fonts). Highlight ${formatTag(tag)} fonts on the map`
                        : `Highlight ${formatTag(tag)} fonts on the map`}
                    >
                      {formatTag(tag)}{predicted && <span aria-hidden="true">?</span>}
                    </button>
                  ))}
                </div>
              )}
              {aliases.length > 0 && (
                <p className="font-aliases" title={aliases.join(', ')}>
                  Same Latin glyphs as: {aliases.slice(0, MAX_VISIBLE_ALIASES).join(', ')}
                  {aliases.length > MAX_VISIBLE_ALIASES && `, +${aliases.length - MAX_VISIBLE_ALIASES} more`}
                </p>
              )}
            </div>
          </div>
          
          {/* Sentence below */}
          <div
            className={`font-sentence-compact preview-sentence${textMode ? ' is-text-mode' : ''}${previewEditable ? ' is-editable' : ''}${previewFocused ? ' is-focused' : ''}`}
            onClick={previewEditable ? () => previewInputRef.current?.focus() : undefined}
          >
            {!sentencePreviewLoaded && !textMode && (
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
                minHeight: '49px', /* Fixed height of the sentence SVG images (165x49) */
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
            {previewEditable && (
              <ActivePreviewText
                textarea={previewInputRef}
                text={previewText}
                onTextChange={setPreviewText}
                focused={previewFocused}
                onFocusChange={setPreviewFocused}
                webFont={activeWebFont}
                editable={previewEditable}
              />
            )}
            {previewEditable && !textMode && !previewFocused && (
              <span className="preview-text-hint" aria-hidden="true">click to type</span>
            )}
            {textMode && activeWebFont.status === 'failed' && (
              <span className="preview-text-note">couldn't load font</span>
            )}
            {textMode && (
              <button
                type="button"
                className="preview-text-clear"
                onClick={clearPreviewText}
                aria-label="Clear preview text"
                title="Back to the default preview"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {!previewEditable && (
            <button type="button" className="preview-text-try" onClick={enablePreviewText}>
              Try your own text
            </button>
          )}

          {/* Google Fonts button inside the card */}
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
                      {textMode ? (
                        <SimilarPreviewText font={font} text={previewText} canLoad={canLoadSimilar} />
                      ) : (
                        <>
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
                              minHeight: '49px', /* Fixed height of the sentence SVG images (165x49) */
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
                        </>
                      )}
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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../FontMap.css';

import { useStaticFontData } from '../../hooks/useStaticFontData';
import { useMapRenderer } from './hooks/useMapRenderer';
import { useMapZoom } from './hooks/useMapZoom';
import { useArrowNavigation } from './hooks/useArrowNavigation';

import FilterControls from './components/controls/FilterControls';
import SearchBar from './components/controls/SearchBar';
import ZoomControls from './components/controls/ZoomControls';
import CategoryLegend from './components/controls/CategoryLegend';
import ActiveFont from './components/ActiveFont';
import TooltipManager from './components/TooltipManager';
import IntroModal from './components/IntroModal';
import AboutModal from './components/AboutModal';
import FPSMonitor from './components/FPSMonitor';

import { useFontMapStore } from '../../store/fontMapStore';
import './styles/intro-modal.css';
import './styles/about-modal.css';

/**
 * Composant principal FontMap — Moteur de rendu DebugUMAP + UI prod complète.
 * Mode debug activable via ?debug=true dans l'URL.
 */
const FontMap = ({ darkMode = false }) => {
  const svgRef = useRef(null);
  const [searchParams] = useSearchParams();
  const isDebugMode = searchParams.get('debug') === 'true';

  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [appState, setAppState] = useState('loading');
  const [showAboutModal, setShowAboutModal] = useState(false);

  const {
    selectedFont,
    hoveredFont,
    setSelectedFont,
    setHoveredFont
  } = useFontMapStore();

  // ── Data : polices + chemins de glyphes (pour la sidebar ActiveFont) ──
  const { fonts, glyphPaths, loading, error } = useStaticFontData();

  // ── Moteur de rendu (sprite SVG, 0 requêtes réseau supplémentaires) ──
  const svgReady = !loading && fonts.length > 0;
  useMapRenderer({
    svgRef,
    fonts,
    glyphPaths,
    filter,
    searchTerm,
    darkMode,
    loading,
    enabled: svgReady
  });

  // ── Zoom simplifié (DebugUMAP-style) ──
  const { centerOnFont, resetZoom } = useMapZoom(svgRef, svgReady);

  // ── Navigation clavier ──
  useArrowNavigation(selectedFont, fonts, filter, searchTerm, handleFontSelect);

  // ── Callbacks ──
  function handleFontSelect(font) {
    setSelectedFont(font);
  }

  const handleFontHover = useCallback((font) => {
    setHoveredFont(font);
  }, [setHoveredFont]);

  const handleFontUnhover = useCallback(() => {
    setHoveredFont(null);
  }, [setHoveredFont]);

  // ── Centrage sur la police sélectionnée / reset au désélect ──
  useEffect(() => {
    if (selectedFont) {
      centerOnFont(selectedFont);
    } else {
      resetZoom();
    }
  }, [selectedFont, centerOnFont, resetZoom]);

  // ── Callbacks globaux pour le TooltipManager ──
  useEffect(() => {
    window.onFontHover = handleFontHover;
    window.onFontUnhover = handleFontUnhover;
    return () => {
      delete window.onFontHover;
      delete window.onFontUnhover;
    };
  }, [handleFontHover, handleFontUnhover]);

  // ── Transitions d'état ──
  useEffect(() => {
    if (loading) {
      setAppState('loading');
    } else if (fonts.length > 0 && appState === 'loading') {
      setAppState('intro');
    }
  }, [loading, fonts.length, appState]);

  // ── Compteurs pour la recherche ──
  const totalFonts = fonts.length;
  const filterOnlyCount = filter === 'all' ? totalFonts : fonts.filter(f => f.family === filter).length;

  const filteredFonts = useMemo(() => fonts.filter(font => {
    const familyMatch = filter === 'all' || font.family === filter;
    const searchMatch = !searchTerm ||
      font.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      font.family.toLowerCase().includes(searchTerm.toLowerCase());
    return familyMatch && searchMatch;
  }), [fonts, filter, searchTerm]);

  const filteredCount = filteredFonts.length;

  // ── Symboles SVG cachés pour la sidebar (ActiveFont utilise <use>) ──
  const symbolDefs = useMemo(() => {
    if (!glyphPaths || Object.keys(glyphPaths).length === 0) return null;
    return (
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          {Object.entries(glyphPaths).map(([id, pathData]) => (
            <symbol key={id} id={id} viewBox="0 0 80 80">
              <path d={pathData} fill="currentColor" />
            </symbol>
          ))}
        </defs>
      </svg>
    );
  }, [glyphPaths]);

  if (error) {
    return (
      <div className="fontmap-container">
        <div className="error">
          <h3>Erreur de chargement</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Recharger la page</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fontmap-container ${darkMode ? 'dark-mode' : ''}`}>
      {/* Symboles SVG cachés pour la sidebar */}
      {symbolDefs}

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-content">
          <div className="sidebar-header">
            <div className="search-section">
              <SearchBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                darkMode={darkMode}
                big={true}
                filteredCount={filteredCount}
                totalCount={filterOnlyCount}
                filter={filter}
              />
              <FilterControls
                fonts={fonts}
                filter={filter}
                onFilterChange={setFilter}
              />
            </div>
          </div>

          <ActiveFont
            selectedFont={selectedFont}
            fonts={fonts}
            darkMode={darkMode}
            onClose={() => setSelectedFont(null)}
            onFontSelect={handleFontSelect}
          />
        </div>

        <div className="sidebar-footer">
          <button className="about-link" onClick={() => setShowAboutModal(true)} title="How FontMap Works">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            How it works
          </button>
          <a className="source-link" href="https://huggingface.co/spaces/huggingface/fontmap" target="_blank" rel="noopener noreferrer" title="View Source on Hugging Face Spaces">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            Source
          </a>
        </div>
      </div>

      {/* Zone principale */}
      <div className="main-area">
        <h1 className="map-title" data-text="FontMap">FontMap</h1>

        <div className="bottom-controls">
          <CategoryLegend darkMode={darkMode} />
          <ZoomControls />
        </div>

        <div className="map-container">
          <svg ref={svgRef} className="fontmap-svg"></svg>
        </div>

        {!loading && fonts.length > 0 && (
          <TooltipManager
            selectedFont={selectedFont}
            hoveredFont={hoveredFont}
            darkMode={darkMode}
            onFontHover={handleFontHover}
            onFontUnhover={handleFontUnhover}
          />
        )}
      </div>

      {/* Overlays */}
      {appState === 'loading' && (
        <div className="unified-overlay">
          <div className="overlay-spinner" />
        </div>
      )}

      {appState === 'intro' && (
        <IntroModal onStartExploring={() => setAppState('ready')} darkMode={darkMode} />
      )}

      {showAboutModal && (
        <AboutModal onClose={() => setShowAboutModal(false)} darkMode={darkMode} />
      )}

      {isDebugMode && <FPSMonitor isDebugMode={true} />}
    </div>
  );
};

export default FontMap;
export { FontMap };

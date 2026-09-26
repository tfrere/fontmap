import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import '../FontMap.css';

import { useStaticFontData } from '../../hooks/useStaticFontData';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMapRenderer } from './hooks/useMapRenderer';
import { useMapZoom } from './hooks/useMapZoom';
import { useArrowNavigation } from './hooks/useArrowNavigation';
import { useAppReady } from './hooks/useAppReady';
import { useGlyphShortcut } from './hooks/useGlyphShortcut';
import { useGlyphSprite } from '../../hooks/useGlyphSprite';
import { filterFonts } from './utils/fontUtils';
import { buildStyleIndex } from './utils/fontSearch';
import { DEFAULT_GLYPH, GLYPHS } from '../../utils/glyphSprites';

import FilterControls from './components/controls/FilterControls';
import SearchBar from './components/controls/SearchBar';
import ZoomControls from './components/controls/ZoomControls';
import CategoryLegend from './components/controls/CategoryLegend';
import GlyphSwitcher from './components/controls/GlyphSwitcher';
import GlyphLoadingBar from './components/GlyphLoadingBar';
import ActiveFont from './components/ActiveFont';
import TooltipManager from './components/TooltipManager';
import IntroModal from './components/IntroModal';
import HowItWorksPage from './components/HowItWorksPage';
import FPSMonitor from './components/FPSMonitor';
import FocusHint from './components/FocusHint';

import { useFontMapStore } from '../../store/fontMapStore';
import './styles/intro-modal.css';
import './styles/how-it-works.css';

const HOW_IT_WORKS_PATH = '/how-it-works';

/**
 * Main FontMap component: SVG map renderer + full UI.
 * Debug mode is enabled with ?debug=true in the URL.
 */
const FontMap = ({ darkMode: darkModeProp = false }) => {
  const svgRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isDebugMode = searchParams.get('debug') === 'true';
  const location = useLocation();
  const navigate = useNavigate();
  const showHowItWorks = location.pathname === HOW_IT_WORKS_PATH;

  const openHowItWorks = useCallback(() => {
    navigate({ pathname: HOW_IT_WORKS_PATH, search: location.search }, { state: { fromMap: true } });
  }, [navigate, location.search]);

  // Going back keeps the browser history clean when the page was opened from the map;
  // a deep link has nothing to go back to, so replace it with the map instead.
  const closeHowItWorks = useCallback(() => {
    if (location.state?.fromMap) navigate(-1);
    else navigate({ pathname: '/', search: location.search }, { replace: true });
  }, [navigate, location.state, location.search]);

  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  // Google Fonts tag highlighted on the map (e.g. "Sans/Humanist"), from search or the font panel
  const [styleTag, setStyleTag] = useState(null);
  // What sits under the loader: the intro modal, or nothing on a direct
  // how-it-works landing. Loading itself is tracked by useAppReady.
  const [appState, setAppState] = useState(() => (showHowItWorks ? 'ready' : 'intro'));
  // html[data-theme] is resolved before first paint by public/index.html
  // (same storage key, same light default), so start from it to match the loader.
  const [darkMode, setDarkMode] = useState(() => {
    const resolved = document.documentElement.dataset.theme;
    if (resolved) return resolved === 'dark';
    const stored = localStorage.getItem('fontmap-dark-mode');
    return stored !== null ? stored === 'true' : darkModeProp;
  });
  const [iconRotation, setIconRotation] = useState(0);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    localStorage.setItem('fontmap-dark-mode', String(darkMode));
    const theme = darkMode ? 'dark' : 'light';
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = darkMode ? '#121110' : '#fcfbf8';
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setIconRotation(r => r + 360);
    setDarkMode(d => !d);
  }, []);

  // Per-slice selectors: FontMap must NOT subscribe to hoveredFont, otherwise
  // every glyph hover re-renders the whole tree (sidebar included).
  const selectedFont = useFontMapStore((s) => s.selectedFont);
  const setSelectedFont = useFontMapStore((s) => s.setSelectedFont);
  const setHoveredFont = useFontMapStore((s) => s.setHoveredFont);
  const glyph = useFontMapStore((s) => s.glyph);
  const setGlyph = useFontMapStore((s) => s.setGlyph);

  // ── Data: fonts + glyph paths (for the ActiveFont sidebar) ──
  const { fonts, glyphPaths, loading, error } = useStaticFontData();

  // ── Glyph switcher (desktop only; mobile always shows "A") ──
  const { paths: displayPaths, loadingGlyph } = useGlyphSprite(isMobile ? DEFAULT_GLYPH : glyph, glyphPaths);
  useGlyphShortcut(!isMobile && appState === 'ready' && !showHowItWorks);

  // ?glyph= is read once on load, then mirrors the store
  const glyphUrlReadRef = useRef(false);
  useEffect(() => {
    if (isMobile) return;
    const fromUrl = searchParams.get('glyph');
    if (!glyphUrlReadRef.current) {
      glyphUrlReadRef.current = true;
      if (fromUrl && GLYPHS.has(fromUrl) && fromUrl !== glyph) {
        setGlyph(fromUrl);
        return;
      }
    }
    if ((fromUrl || DEFAULT_GLYPH) === glyph) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (glyph === DEFAULT_GLYPH) next.delete('glyph');
      else next.set('glyph', glyph);
      return next;
    }, { replace: true });
  }, [glyph, isMobile, searchParams, setSearchParams, setGlyph]);

  // ── Renderer (SVG sprite, no extra network requests) ──
  const svgReady = !loading && fonts.length > 0;
  const { hasRendered: mapRendered } = useMapRenderer({
    svgRef,
    fonts,
    glyphPaths,
    displayPaths,
    filter,
    searchTerm,
    styleTag,
    darkMode,
    loading,
    enabled: svgReady,
    isMobile,
  });

  // ── Zoom ──
  const { centerOnFont, resetZoom } = useMapZoom(svgRef, svgReady);

  // ── Navigation clavier ──
  useArrowNavigation(selectedFont, fonts, filter, searchTerm, handleFontSelect, styleTag);

  const clearExploration = useFontMapStore((s) => s.clearExploration);

  // Shared by the reset button and Esc
  const resetAll = useCallback(() => {
    setFilter('all');
    setSearchTerm('');
    setStyleTag(null);
    clearExploration();
    resetZoom();
  }, [clearExploration, resetZoom]);

  // Overlays, the glyph popover, the search box and the preview text field
  // handle their own Esc first (capture phase, stopPropagation or preventDefault).
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
      event.preventDefault();
      if (appState === 'intro') {
        setAppState('ready');
        return;
      }
      if (showHowItWorks) return;
      resetAll();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, showHowItWorks, resetAll]);

  // ── Callbacks ──
  function handleFontSelect(font) {
    setHoveredFont(null);
    setSelectedFont(font);
  }

  // Search text and style highlight share the search box: one replaces the other
  const handleSearchChange = useCallback((term) => {
    setSearchTerm(term);
    if (term.trim()) setStyleTag(null);
  }, []);

  // Leaves focus mode so the highlighted style is visible on the map
  const handleStyleSelect = useCallback((tag) => {
    setStyleTag(tag);
    if (tag) {
      setSearchTerm('');
      setHoveredFont(null);
      setSelectedFont(null);
    }
  }, [setHoveredFont, setSelectedFont]);

  const handleCategorySelect = useCallback((category) => {
    setFilter(category);
    setHoveredFont(null);
    setSelectedFont(null);
  }, [setHoveredFont, setSelectedFont]);

  // ── Center on the selected font - the zoom is NOT reset on deselect
  // so the user can keep exploring where they were.
  useEffect(() => {
    if (selectedFont) {
      centerOnFont(selectedFont);
    }
  }, [selectedFont, centerOnFont]);

  // ── Loader: stays up until data, map, overlays and web fonts are final ──
  const { isReady, loaderMounted } = useAppReady({ dataReady: svgReady, contentReady: svgReady && mapRendered });

  // ── Search counters ──
  const totalFonts = fonts.length;
  const filterOnlyCount = filter === 'all' ? totalFonts : fonts.filter(f => f.family === filter).length;

  const filteredFonts = useMemo(() => filterFonts(fonts, filter, searchTerm, styleTag), [fonts, filter, searchTerm, styleTag]);
  const styleIndex = useMemo(() => buildStyleIndex(fonts), [fonts]);
  const styleCount = useMemo(
    () => (styleTag ? filterFonts(fonts, 'all', '', styleTag).length : 0), [fonts, styleTag]);

  const filteredCount = filteredFonts.length;

  // ── Hidden SVG symbols for the sidebar (ActiveFont uses <use>) ──
  // Ids keep the "_a" suffix; their content follows the selected glyph.
  const symbolDefs = useMemo(() => {
    if (!displayPaths || Object.keys(displayPaths).length === 0) return null;
    return (
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          {Object.entries(displayPaths).map(([id, pathData]) => (
            <symbol key={id} id={id} viewBox="0 0 80 80">
              <path d={pathData} fill="currentColor" />
            </symbol>
          ))}
        </defs>
      </svg>
    );
  }, [displayPaths]);

  if (error) {
    return (
      <div className="fontmap-container">
        <div className="error">
          <h3>Loading error</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Reload the page</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fontmap-container ${darkMode ? 'dark-mode' : ''} ${selectedFont ? 'has-focus' : ''}`}>
      {/* Hidden SVG symbols for the sidebar */}
      {symbolDefs}

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-content">
          <div className="sidebar-header">
            <div className="search-section">
              <SearchBar
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                darkMode={darkMode}
                big={true}
                filteredCount={filteredCount}
                totalCount={filterOnlyCount}
                filter={filter}
                fonts={fonts}
                styleIndex={styleIndex}
                styleTag={styleTag}
                styleCount={styleCount}
                onStyleSelect={handleStyleSelect}
                onCategorySelect={handleCategorySelect}
                onFontSelect={handleFontSelect}
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
            isMobile={isMobile}
            onClose={() => setSelectedFont(null)}
            onFontSelect={handleFontSelect}
            onStyleSelect={handleStyleSelect}
            activeStyleTag={styleTag}
          />
        </div>

        <div className="sidebar-footer">
          <button className="about-link" onClick={openHowItWorks} title="How FontMap Works">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            How it works
          </button>
          <a className="source-link" href="https://github.com/tfrere/fontmap" target="_blank" rel="noopener noreferrer" title="View source on GitHub">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            Source
          </a>
        </div>
      </div>

      {/* Zone principale */}
      <div className="main-area">
        <h1 className="map-title" data-text="FontMap">FontMap<span className="title-version">v2</span></h1>

        <div className="bottom-controls">
          <button
            type="button"
            className="map-control dark-mode-toggle"
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
          >
            <span
              className="dark-mode-toggle-icon"
              style={{ transform: `rotate(${iconRotation}deg)` }}
            >
              {darkMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </span>
          </button>
          <CategoryLegend darkMode={darkMode} />
          {!isMobile && <GlyphSwitcher loading={!!loadingGlyph} />}
          <ZoomControls onReset={resetAll} />
        </div>

        <div className={`map-container${loadingGlyph ? ' is-loading-glyph' : ''}`}>
          <svg ref={svgRef} className="fontmap-svg"></svg>
        </div>

        {!isMobile && <GlyphLoadingBar glyph={loadingGlyph} />}

        {selectedFont && <FocusHint />}

        {isMobile && (
          <button type="button" className="map-control mobile-how-button" onClick={openHowItWorks} aria-label="How it works">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        )}

        {!loading && fonts.length > 0 && (
          <TooltipManager
            darkMode={darkMode}
            isMobile={isMobile}
            onOpenFont={handleFontSelect}
          />
        )}
      </div>

      {/* Overlays */}
      {appState === 'intro' && totalFonts > 0 && (
        <IntroModal
          onStartExploring={() => setAppState('ready')}
          onPickFont={handleFontSelect}
          onOpenHowItWorks={() => {
            setAppState('ready');
            openHowItWorks();
          }}
          darkMode={darkMode}
          fontCount={totalFonts}
          fonts={fonts}
          glyphPaths={glyphPaths}
        />
      )}

      {showHowItWorks && totalFonts > 0 && (
        <HowItWorksPage
          onClose={closeHowItWorks}
          onPickFont={handleFontSelect}
          darkMode={darkMode}
          fontCount={totalFonts}
          fonts={fonts}
          glyphPaths={glyphPaths}
        />
      )}

      {loaderMounted && (
        <div className={`app-loader${isReady ? ' is-done' : ''}`} role="status" aria-label="Loading FontMap">
          <div className="app-loader-spinner" />
        </div>
      )}

      {isDebugMode && <FPSMonitor isDebugMode={true} />}
    </div>
  );
};

export default FontMap;
export { FontMap };

import React from 'react';
import ModalPortal from './ModalPortal';
import GlyphMarquee, { MARQUEE_ROWS } from './GlyphMarquee';

/**
 * Introduction modal: a specimen band of real "A" glyphs walking across the map
 * sits above the pitch. Clicking a glyph opens the map on that font. Usage hints
 * live in the sidebar empty state (ActiveFont).
 */
const IntroModal = ({ onStartExploring, onPickFont, onOpenHowItWorks, darkMode, fontCount, fonts, glyphPaths }) => {
  const pick = (font) => {
    onStartExploring();
    onPickFont(font);
  };

  return (
    <ModalPortal isOpen={true}>
      {/* dark-mode class must be re-applied here: the portal renders outside .fontmap-container */}
      <div className={`unified-overlay intro-overlay${darkMode ? ' dark-mode' : ''}`} onClick={onStartExploring}>
        <div
          className="intro-modal"
          role="dialog"
          aria-labelledby="intro-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="intro-band intro-marquee-tilted">
            <GlyphMarquee
              fonts={fonts}
              glyphPaths={glyphPaths}
              rows={MARQUEE_ROWS.top}
              onPick={pick}
            />
            <span className="intro-band-caption" aria-hidden="true">Click a glyph to open it</span>
          </div>

          <div className="intro-modal-content">
            <h1 id="intro-title" className="intro-title">FontMap<span className="title-version">v2</span></h1>
            <p className="intro-subtitle">
              {fontCount.toLocaleString('en-US')}{' '}
              <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer" className="google-fonts-link">Google Fonts</a>{' '}
              on a <strong>single map</strong>, where typefaces that <strong>look alike</strong> sit
              close together. Positions are computed from the <strong>glyphs themselves</strong>,
              so you can <strong>browse by feel</strong> and find alternatives to a font you like.
            </p>
            {/* Mobile only: the sidebar footer with the desktop link is hidden there */}
            {onOpenHowItWorks && (
              <p className="intro-how">
                <button type="button" className="intro-how-link" onClick={onOpenHowItWorks}>
                  How it works
                </button>
              </p>
            )}
          </div>

          {/* Outside the scrollable content so it can straddle the card's bottom edge. */}
          <button className="intro-start-button" onClick={onStartExploring}>
            Start exploring
          </button>
        </div>
      </div>
    </ModalPortal>
  );
};

export default IntroModal;

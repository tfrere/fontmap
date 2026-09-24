import React from 'react';
import ModalPortal from './ModalPortal';

/**
 * Introduction modal component
 */
const IntroModal = ({ onStartExploring, darkMode }) => {
  return (
    <ModalPortal isOpen={true}>
      {/* dark-mode class must be re-applied here: the portal renders outside .fontmap-container */}
      <div className={`unified-overlay${darkMode ? ' dark-mode' : ''}`} onClick={onStartExploring}>
        <div className="intro-modal" onClick={(e) => e.stopPropagation()}>
          <div className="intro-modal-content">
            <h1 className="intro-title">FontMap</h1>
            <p className="intro-subtitle">
              Using artificial intelligence to surface new relationships across fonts.
            </p>
            <p className="intro-description">
              This interactive map of 1,192 <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer" className="google-fonts-link">Google Fonts</a> has been organized using machine learning.
            </p>
            
            <div className="intro-features">
              <div className="intro-feature">
                <div className="intro-feature-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 3l-6 6"/>
                    <path d="M3 21l6-6"/>
                    <path d="M21 3l-6 6"/>
                    <path d="M3 21l6-6"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <span>Pan and Zoom to explore</span>
              </div>
              
              <div className="intro-feature">
                <div className="intro-feature-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <span>Search for a font by name</span>
              </div>
            </div>
            
            <button 
              className="intro-start-button"
              onClick={onStartExploring}
            >
              START EXPLORING
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default IntroModal;
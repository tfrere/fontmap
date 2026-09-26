import React from 'react';

/**
 * Zoom column; the reset button at its foot sits in the bottom controls row.
 */
const ZoomControls = ({ onReset }) => {
  return (
    <div className="zoom-controls">
      <button
        type="button"
        className="map-control zoom-btn zoom-in"
        onClick={() => window.zoomIn && window.zoomIn()}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
          <line x1="11" y1="8" x2="11" y2="14"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <button
        type="button"
        className="map-control zoom-btn zoom-out"
        onClick={() => window.zoomOut && window.zoomOut()}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <button
        type="button"
        className="map-control zoom-btn zoom-reset"
        onClick={onReset}
        title="Reset view and filters (Esc)"
        aria-label="Reset view and filters"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      </button>
    </div>
  );
};

export default ZoomControls;

import React, { useEffect, useRef } from 'react';
import Stats from 'stats.js';

/**
 * FPS monitor shown in debug mode
 * Uses stats.js to measure performance
 */
const FPSMonitor = ({ isDebugMode = false }) => {
  const containerRef = useRef(null);
  const statsRef = useRef(null);

  useEffect(() => {
    // Only shown in debug mode
    if (!isDebugMode) {
      return;
    }

    if (!containerRef.current) return;

    // Create the Stats.js instance
    const stats = new Stats();
    
    // Style
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    stats.dom.style.position = 'fixed';
    stats.dom.style.top = '20px';
    stats.dom.style.right = '80px';
    stats.dom.style.left = 'auto'; // Override left
    stats.dom.style.zIndex = '10000';
    stats.dom.style.pointerEvents = 'none';
    stats.dom.style.marginLeft = '0'; // Reset margin
    stats.dom.style.marginRight = '0';
    // Add to the DOM
    containerRef.current.appendChild(stats.dom);
    
    // Keep a reference
    statsRef.current = stats;

    // Update loop
    const updateStats = () => {
      stats.begin();
      stats.end();
      requestAnimationFrame(updateStats);
    };

    // Start monitoring
    updateStats();

    // Cleanup
    return () => {
      const currentContainer = containerRef.current;
      if (statsRef.current && currentContainer) {
        currentContainer.removeChild(statsRef.current.dom);
        statsRef.current = null;
      }
    };
  }, [isDebugMode]);

  // Render nothing outside debug mode
  if (!isDebugMode) {
    return null;
  }

  return <div ref={containerRef} />;
};

export default FPSMonitor;

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toggleTheme } from '../engine/view';
import '../experiments.css';

const DISPLAY_FONT_TIMEOUT = 1500;
let displayFont = null;

// Only the experiments use the display serif, so it is fetched on first visit. Titles wait
// for it (up to a timeout) rather than flash in the fallback serif and swap.
export function displayFontReady() {
  if (!displayFont) {
    const loaded = new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital@1&display=swap';
      link.onload = () => document.fonts.load("italic 400 1em 'Playfair Display'").then(resolve, resolve);
      link.onerror = resolve;
      document.head.appendChild(link);
    });
    displayFont = Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, DISPLAY_FONT_TIMEOUT))]);
  }
  return displayFont;
}

export function useExperimentPage(title) {
  useEffect(() => {
    displayFontReady();
    const previous = document.title;
    return () => { document.title = previous; };
  }, []);
  useEffect(() => { if (title) document.title = title; }, [title]);
}

// Mounts a vanilla controller on the page root and tears it down on unmount.
export function useController(mount) {
  const ref = useRef(null);
  const [status, setStatus] = useState('loading');
  const mountRef = useRef(mount);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve(mountRef.current(ref.current, controller.signal))
      .then(() => { if (!controller.signal.aborted) setStatus('ready'); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setStatus('error');
      });
    return () => controller.abort();
  }, []);
  return [ref, status];
}

export const ArrowLeft = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
  </svg>
);

export const MoonIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export function ThemeButton({ className = 'icon', size = 14 }) {
  return (
    <button type="button" className={className} onClick={toggleTheme} title="Toggle dark mode" aria-label="Toggle dark mode">
      <MoonIcon size={size} />
    </button>
  );
}

export function Topbar({ to = '/experiments', label = 'All experiments', children }) {
  return (
    <nav className="topbar" aria-label="Navigation">
      <Link className="back" to={to} title={label}><ArrowLeft /><span>{label}</span></Link>
      {children ?? <Link className="topbar-brand" to="/" title="Open the map">FontMap</Link>}
    </nav>
  );
}

export function Loader({ status }) {
  return (
    <div className={`loader${status === 'ready' ? ' is-done' : ''}`} role="status">
      {status === 'error' ? <p>The map data couldn't be loaded. Try reloading the page.</p> : <div className="spinner" />}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mountHeroMap } from '../heroMap';
import { mountDesignersPreview, mountSizePreview } from '../previews';
import { displayFontReady, ThemeButton, Topbar, useController, useExperimentPage } from './shared';

const ROWS = [
  {
    to: '/experiments/size-by-use',
    key: 'size',
    preview: { mount: mountSizePreview, label: 'Preview: the map grows into a cartogram sized by use' },
    title: 'Size by use',
    desc: 'The same map, with every glyph sized by how often websites use it.',
    figure: '4 fonts',
    figureText: 'get half of all Google Fonts views. Roboto alone gets a quarter.',
  },
  {
    to: '/experiments/designers',
    key: 'designers',
    preview: { mount: mountDesignersPreview, label: 'Preview: designers light up one after another on the map' },
    title: 'Who drew the fonts you know?',
    desc: 'Search a font and meet the people behind it, with everything else they drew.',
    figure: '632',
    figureText: 'designers and foundries. Some range over every style, others never leave one corner.',
  },
  {
    href: 'trailer/index.html',
    key: 'trailer',
    video: { src: 'experiments/previews/trailer.mp4', poster: 'experiments/previews/trailer.jpg' },
    title: 'The trailer',
    desc: 'A typographic trailer for FontMap, written in code on a single canvas.',
    figure: '19 s',
    figureText: 'at 128 BPM, every frame a pure function of time.',
  },
];

function MediaSpinner() {
  return <span className="media-spinner" aria-hidden="true" />;
}

function CanvasPreview({ mount, label }) {
  const [ref] = useController(mount);
  return <><canvas ref={ref} role="img" aria-label={label} /><MediaSpinner /></>;
}

// Muted so it may autoplay; it only loads and plays while on screen.
function VideoPreview({ src, poster }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    video.muted = true;
    const show = () => video.classList.add('is-in');
    const still = new Image();
    still.onload = show;
    still.src = poster;
    video.addEventListener('loadeddata', show);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => { still.onload = null; };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.2 });
    observer.observe(video);
    return () => { still.onload = null; observer.disconnect(); };
  }, [poster]);
  return <><video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" aria-hidden="true" /><MediaSpinner /></>;
}

// The trailer is a standalone page outside the app, so it gets a plain link.
function RowLink({ row, children, ...props }) {
  return row.to ? <Link to={row.to} {...props}>{children}</Link> : <a href={row.href} {...props}>{children}</a>;
}

export default function ExperimentsIndex() {
  useExperimentPage('Experiments · FontMap');
  const [heroRef] = useController(mountHeroMap);
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    let live = true;
    displayFontReady().then(() => { if (live) setFontReady(true); });
    return () => { live = false; };
  }, []);

  return (
    <div className={`exp exp-index${fontReady ? ' is-ready' : ''}`}>
      <Topbar to="/" label="Back to the map">
        <ThemeButton className="round" size={15} />
      </Topbar>

      <header className="hero">
        <canvas id="hero-map" ref={heroRef} aria-hidden="true" />
        <MediaSpinner />
        <div className="hero-text">
          <p className="kicker">FontMap · Experiments</p>
          <h1>Other ways to read <em>the&nbsp;map.</em></h1>
          <p className="hero-lede">
            FontMap places all 1,465 Google Fonts by how they look. These experiments keep that layout
            and lay other data over it: how much each font is used, and who drew it.
          </p>
        </div>
      </header>

      <main className="list">
        {ROWS.map((row) => (
          <RowLink row={row} className="row" key={row.key}>
            <div className={`row-media is-${row.key}`} aria-hidden="true">
              {row.preview ? <CanvasPreview {...row.preview} /> : <VideoPreview {...row.video} />}
            </div>
            <div className="row-text">
              <h2><span className="row-title">{row.title}</span> <span className="row-arrow" aria-hidden="true">→</span></h2>
              <p className="row-desc">{row.desc}</p>
              <p className="figure"><strong>{row.figure}</strong><span>{row.figureText}</span></p>
            </div>
          </RowLink>
        ))}
      </main>

      <footer className="foot">
        <Link className="foot-brand" to="/">FontMap</Link>
        <span>Data from Google Fonts · Layout from FontCLIP + t-SNE</span>
        <a href="https://github.com/tfrere/fontmap" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
      </footer>
    </div>
  );
}

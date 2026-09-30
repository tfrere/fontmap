import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mountDesigners, designerPath, USAGE_TIERS } from '../designers';
import { displayFontReady, Loader, ThemeButton, Topbar, useExperimentPage } from './shared';

const GRID = '/experiments/designers';

export default function Designers() {
  useExperimentPage();
  const { name = null } = useParams();
  const navigate = useNavigate();
  const ref = useRef(null);
  const api = useRef(null);
  const current = useRef(name);
  const nav = useRef(navigate);
  const [status, setStatus] = useState('loading');
  current.current = name;
  nav.current = navigate;

  useEffect(() => {
    const controller = new AbortController();
    const go = (next) => nav.current(next ? designerPath(next) : GRID);
    Promise.all([mountDesigners(ref.current, controller.signal, { go }), displayFontReady()])
      .then(([controls]) => {
        if (!controls) return;
        api.current = controls;
        if (!controls.show(current.current)) nav.current(GRID, { replace: true });
        setStatus('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setStatus('error');
      });
    return () => {
      controller.abort();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    if (api.current && !api.current.show(name)) navigate(GRID, { replace: true });
  }, [name, navigate]);

  return (
    <div className="exp exp-designers is-grid" ref={ref}>
      <canvas id="map" aria-label="Map of Google Fonts highlighting one designer's families" />
      <Topbar />

      <main className="gallery">
        <header className="gallery-head">
          <p className="kicker">Experiment · People</p>
          <h1>Who drew the fonts<br /><em>you know?</em></h1>
          <p className="gallery-lede">
            Google Fonts credits <strong id="designer-count">632</strong> designers and foundries. Each card is one of
            them: their name, where their fonts sit on the map with the ground they cover shaded, and the fonts
            you probably know them for. Some range over every style; others never leave one corner.
          </p>
        </header>

        <div className="gallery-tools">
          <input id="search" type="search" placeholder="Search a font or a designer: Montserrat, Lobster, Poppins…" autoComplete="off" aria-label="Search a font or a designer" />
          <ThemeButton className="round" size={15} />
          <div className="filters">
            <div className="filter">
              <span className="filter-label">Usage</span>
              <div className="segmented usage" role="group" aria-label="Filter designers by how much their fonts are used">
                <button type="button" data-usage="all" className="is-active">All <span className="n" /></button>
                {USAGE_TIERS.map((t) => (
                  <button type="button" data-usage={t.key} key={t.key} title={`Designers ${t.phrase}`}>{t.label} <span className="n" /></button>
                ))}
              </div>
            </div>
            <div className="filter">
              <span className="filter-label">Sort</span>
              <div className="segmented sort" role="group" aria-label="Sort designers">
                <button type="button" data-sort="known" className="is-active">Most viewed</button>
                <button type="button" data-sort="wide">Widest range</button>
                <button type="button" data-sort="focused">Most focused</button>
                <button type="button" data-sort="count">Most fonts</button>
              </div>
            </div>
          </div>
        </div>

        <p className="result-count" id="result-count" />
        <ol className="cards" id="cards" />
        <button type="button" className="more" id="more" hidden />

        <footer className="gallery-foot">
          <p className="source" id="source-grid" />
          <a className="next-inline" href="trailer/index.html"><span>Next experiment</span>The trailer →</a>
        </footer>
      </main>

      <aside className="panel focus-panel" aria-live="polite">
        <a className="panel-back" href={`#${GRID}`} id="panel-back">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          All designers
        </a>
        <p className="designer" id="designer" />
        <p className="known" id="known" />
        <dl className="stats" id="stats" />

        <div className="font-list-head"><span>Their fonts</span><span id="views-label">Views</span></div>
        <ol className="font-list" id="font-list" />

        <div className="actions">
          <label className="check"><input type="checkbox" id="names" defaultChecked /> Names</label>
          <button type="button" id="download" title="Download a 4K PNG of this designer's map">PNG</button>
          <ThemeButton />
        </div>
      </aside>

      <div className="hint">Scroll to zoom · drag to pan · click a grey glyph to switch to its designer · Esc for all designers</div>
      <div className="tooltip" id="tooltip" role="tooltip" />
      <Loader status={status} />
    </div>
  );
}

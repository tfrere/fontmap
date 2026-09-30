import React from 'react';
import { Link } from 'react-router-dom';
import { mountSizeByUse } from '../sizeByUse';
import { Loader, ThemeButton, Topbar, useController, useExperimentPage } from './shared';

export default function SizeByUse() {
  useExperimentPage('Size by use · FontMap experiment');
  const [ref, status] = useController(mountSizeByUse);

  return (
    <div className="exp exp-size" ref={ref}>
      <canvas id="map" aria-label="Map of Google Fonts sized by use" />
      <Topbar />

      <aside className="panel" aria-live="polite">
        <h1>Size by use</h1>
        <p className="lede">
          Each glyph is a Google Font, placed by how it looks and sized by how often Google Fonts served it
          to websites in the last 30 days. Log scale; big glyphs push their neighbours aside instead of covering them.
        </p>

        <dl className="stats" id="stats" />

        <div className="legend" id="legend">
          <div>
            <span className="legend-title">Views, 30 days</span>
            <div className="legend-items" id="legend-items" />
          </div>
        </div>

        <div className="actions">
          <button type="button" id="replay" title="Replay (Space)">Replay</button>
          <label className="check"><input type="checkbox" id="names" defaultChecked /> Names</label>
          <button type="button" id="download" title="Download a 4K PNG of the whole map">PNG</button>
          <ThemeButton />
        </div>

        <p className="source" id="source" />
        <Link className="next" to="/experiments/designers"><span>Next experiment</span>Who drew the fonts you know? →</Link>
      </aside>

      <div className="hint">Scroll to zoom · drag to pan · double-click to reset · click a glyph to open it</div>
      <div className="tooltip" id="tooltip" role="tooltip" />
      <Loader status={status} />
    </div>
  );
}

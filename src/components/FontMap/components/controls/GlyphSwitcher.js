import React, { useEffect, useRef, useState } from 'react';
import { useFontMapStore } from '../../../../store/fontMapStore';
import { GLYPH_ROWS, GLYPH_HINTS, loadGlyphIndex } from '../../../../utils/glyphSprites';

const COLS = Math.max(...GLYPH_ROWS.map(row => row.length));

const isTypingTarget = (el) => !!el && (
  el.isContentEditable
  || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
);

/**
 * Bottom-right control: current glyph button + popover grid to pick the
 * character drawn for every font on the map.
 */
const GlyphSwitcher = ({ loading = false }) => {
  const glyph = useFontMapStore(s => s.glyph);
  const setGlyph = useFontMapStore(s => s.setGlyph);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const gridRef = useRef(null);

  useEffect(() => {
    loadGlyphIndex()
      .then(index => setAvailable(new Set(index.keys())))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = gridRef.current?.querySelector('[aria-pressed="true"]')
      || gridRef.current?.querySelector('button:not(:disabled)');
    current?.focus();

    const handlePointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    // Capture phase so Escape closes the popover without also leaving focus mode
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const select = (char) => {
    setGlyph(char);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleGridKeyDown = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS };
    if (!(e.key in moves) && e.key !== 'Home' && e.key !== 'End') return;
    // Keep arrows away from the map's font navigation
    e.preventDefault();
    e.stopPropagation();
    const buttons = [...gridRef.current.querySelectorAll('button')];
    const from = buttons.indexOf(document.activeElement);
    let to;
    if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = buttons.length - 1;
    else {
      const pos = Number(buttons[from]?.dataset.pos ?? 0) + moves[e.key];
      to = buttons.findIndex(b => Number(b.dataset.pos) === pos);
    }
    if (to >= 0) buttons[to].focus();
  };

  const hint = GLYPH_HINTS[glyph];

  return (
    <div className="glyph-switcher" ref={rootRef}>
      {open && (
        <div
          className="glyph-popover"
          ref={gridRef}
          role="group"
          aria-label="Choose the glyph shown on the map"
          onKeyDown={handleGridKeyDown}
        >
          {GLYPH_ROWS.map((row, r) => (
            <div className="glyph-popover-row" key={row}>
              {[...row].map((char, c) => {
                const selected = char === glyph;
                const diagnostic = GLYPH_HINTS[char];
                return (
                  <button
                    key={char}
                    type="button"
                    data-pos={r * COLS + c}
                    className={`glyph-option${selected ? ' is-selected' : ''}${diagnostic ? ' is-diagnostic' : ''}`}
                    aria-pressed={selected}
                    aria-label={diagnostic ? `Show glyph ${char} (${diagnostic.split(': ')[1]})` : `Show glyph ${char}`}
                    title={diagnostic}
                    tabIndex={selected ? 0 : -1}
                    disabled={available ? !available.has(char) : false}
                    onClick={() => select(char)}
                  >
                    {char}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={`map-control glyph-switcher-toggle${loading ? ' is-loading' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={`Glyph shown on the map: ${glyph}. Choose another glyph`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-busy={loading}
        title={hint ? `Glyph (${hint})` : 'Glyph shown on the map'}
      >
        <span className="glyph-switcher-char">
          {glyph}
          {loading && (
            <span className="glyph-switcher-dots" aria-hidden="true"><i /><i /><i /></span>
          )}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points={open ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
        </svg>
      </button>
    </div>
  );
};

export default GlyphSwitcher;

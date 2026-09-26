import React, { useEffect, useMemo, useRef } from 'react';

/**
 * Well-known, representative Google Fonts shown in the intro marquee.
 * Ids must match `public/data/typography_data.json`; unknown ids are ignored.
 */
const CURATED_POOL = [
  // Serif
  'playfair-display', 'bodoni-moda', 'dm-serif-display', 'fraunces', 'cormorant-garamond',
  'libre-caslon-display', 'eb-garamond', 'abril-fatface', 'libre-baskerville', 'lora',
  'merriweather', 'crimson-pro', 'spectral', 'alegreya', 'young-serif', 'instrument-serif',
  'gloock', 'yeseva-one', 'prata', 'cinzel', 'old-standard-tt', 'roboto-slab', 'zilla-slab',
  'alfa-slab-one', 'ultra', 'noto-serif-display', 'italiana', 'shrikhand',
  // Sans-serif
  'inter', 'space-grotesk', 'syne', 'unbounded', 'bricolage-grotesque', 'archivo-black',
  'bebas-neue', 'anton', 'montserrat', 'poppins', 'work-sans', 'dm-sans', 'manrope', 'sora',
  'oswald', 'raleway', 'josefin-sans', 'jost', 'league-spartan', 'plus-jakarta-sans',
  'epilogue', 'barlow-condensed', 'familjen-grotesk', 'marcellus', 'poiret-one',
  // Display (sans-serif and decorative)
  'righteous', 'monoton', 'bungee', 'bungee-shade', 'rubik-mono-one', 'bowlby-one', 'titan-one',
  'fredoka', 'lilita-one', 'black-ops-one', 'dela-gothic-one', 'climate-crisis', 'tilt-warp',
  'orbitron', 'codystar', 'limelight', 'rye', 'faster-one', 'fascinate', 'megrim', 'audiowide',
  'press-start-2p', 'rampart-one', 'nabla',
  // Monospace
  'space-mono', 'jetbrains-mono', 'ibm-plex-mono', 'major-mono-display', 'fira-code',
  'courier-prime', 'dm-mono', 'syne-mono', 'vt323', 'xanh-mono',
  // Blackletter
  'unifrakturmaguntia', 'unifrakturcook', 'pirata-one', 'grenze-gotisch', 'new-rocker',
];

const MIN_GLYPH_HEIGHT = 24; // in the 80-unit sprite viewBox

/**
 * Fonts whose "A" fills a reasonable part of the cell. Tiny glyphs (small-caps
 * fallbacks, symbol-like designs) read as rendering glitches at marquee size.
 */
function legibleFonts(fonts, glyphPaths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.appendChild(path);
  document.body.appendChild(svg);
  try {
    return fonts.filter(f => {
      const d = glyphPaths[`${f.id}_a`];
      if (!d) return false;
      path.setAttribute('d', d);
      return path.getBBox().height >= MIN_GLYPH_HEIGHT;
    });
  } finally {
    svg.remove();
  }
}

function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const isScript = f => f.family === 'handwriting' || f.family === 'blackletter';

/**
 * Greedy reorder so neighbours differ in category and no three scripts run
 * back to back. Falls back to the next remaining font when no candidate fits.
 */
function varyNeighbours(fonts) {
  const rest = fonts.slice();
  const out = [];
  while (rest.length) {
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    const fits = f =>
      (!prev || f.family !== prev.family) &&
      !(prev && prev2 && isScript(prev) && isScript(prev2) && isScript(f));
    const idx = rest.findIndex(fits);
    out.push(rest.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}

/**
 * Shuffles the curated pool and deals it across rows: each font lands in at
 * most one row, and each category is spread evenly over the rows. If too few
 * curated fonts are legible, random legible fonts from the whole map top it up.
 */
function dealRows(allFonts, glyphPaths, rows) {
  // Handwriting fonts are left out of the intro marquee
  const fonts = allFonts.filter(f => f.family !== 'handwriting');
  const byId = new Map(fonts.map(f => [f.id, f]));
  const curated = CURATED_POOL.map(id => byId.get(id)).filter(Boolean);
  let pool = shuffle(legibleFonts(curated, glyphPaths));

  const needed = rows.reduce((sum, row) => sum + row.count, 0);
  if (pool.length < needed) {
    const inPool = new Set(pool.map(f => f.id));
    const extras = legibleFonts(fonts.filter(f => !inPool.has(f.id)), glyphPaths);
    pool = pool.concat(shuffle(extras).slice(0, needed - pool.length));
  }

  const dealt = rows.map(() => []);
  for (const font of pool) {
    let best = -1;
    let bestScore = Infinity;
    dealt.forEach((row, i) => {
      if (row.length >= rows[i].count) return;
      const sameFamily = row.filter(f => f.family === font.family).length;
      const score = sameFamily * 1000 + row.length / rows[i].count;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best === -1) break;
    dealt[best].push(font);
  }
  return dealt.map(varyNeighbours);
}

const MarqueeRow = ({ fonts, glyphPaths, reverse, duration, onPick }) => {
  const renderGlyph = (font, key) => (
    <button
      key={key}
      type="button"
      className="glyph-marquee-glyph"
      title={font.name}
      tabIndex={-1}
      onClick={() => onPick(font)}
    >
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <path d={glyphPaths[`${font.id}_a`]} />
      </svg>
    </button>
  );

  return (
    <div className="glyph-marquee-row">
      <div
        className={`glyph-marquee-track${reverse ? ' reverse' : ''}`}
        style={{ animationDuration: `${duration}s` }}
      >
        {fonts.map(f => renderGlyph(f, f.id))}
        {fonts.map(f => renderGlyph(f, `${f.id}-copy`))}
      </div>
    </div>
  );
};

export const MARQUEE_ROWS = {
  // The outer rows are mostly cropped by the band; the middle two carry the specimen.
  // `count` and `duration` together set the scroll speed and keep the loop wider than the band.
  top: [
    { count: 18, duration: 91, reverse: true },
    { count: 19, duration: 72 },
    { count: 18, duration: 83, reverse: true },
    { count: 19, duration: 77 },
  ],
};

const HOVER_RATE = 0.22;
const EASE_MS = 600;

const smoothstep = t => t * t * (3 - 2 * t);

/**
 * Eases the playback rate of the CSS scroll animations towards HOVER_RATE while
 * the mouse is over the marquee, and back to 1 on leave. The playbackRate setter
 * keeps currentTime, so the rows never jump. With reduced motion there are no
 * animations and this is a no-op.
 */
function useHoverSlowdown(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getAnimations !== 'function') return undefined;
    let frame = 0;

    const easeTo = (target) => {
      cancelAnimationFrame(frame);
      // Glyph opacity/scale transitions are in the subtree too: only touch the scroll.
      const anims = el.getAnimations({ subtree: true })
        .filter(a => a.effect?.target?.classList?.contains('glyph-marquee-track'));
      if (!anims.length) return;
      const from = anims[0].playbackRate;
      // An interrupted ease covers a shorter distance, so it takes proportionally less time.
      const duration = EASE_MS * Math.abs(target - from) / (1 - HOVER_RATE);
      const start = performance.now();
      const step = (now) => {
        const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
        const rate = from + (target - from) * smoothstep(t);
        anims.forEach(a => { a.playbackRate = rate; });
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const onEnter = (e) => { if (e.pointerType !== 'touch') easeTo(HOVER_RATE); };
    const onLeave = (e) => { if (e.pointerType !== 'touch') easeTo(1); };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [ref]);
}

const GlyphMarquee = ({ fonts, glyphPaths, rows, onPick, className = '' }) => {
  // Reshuffled once per mount, so every page load shows a different line-up.
  const dealt = useMemo(() => dealRows(fonts, glyphPaths, rows), [fonts, glyphPaths, rows]);
  const ref = useRef(null);
  useHoverSlowdown(ref);

  if (dealt.every(r => r.length === 0)) return null;

  return (
    // Decorative for assistive tech: the same fonts are reachable through search.
    <div ref={ref} className={`glyph-marquee ${className}`} aria-hidden="true">
      {dealt.map((rowFonts, i) => (
        <MarqueeRow
          key={i}
          fonts={rowFonts}
          glyphPaths={glyphPaths}
          reverse={rows[i].reverse}
          duration={rows[i].duration}
          onPick={onPick}
        />
      ))}
    </div>
  );
};

export default GlyphMarquee;

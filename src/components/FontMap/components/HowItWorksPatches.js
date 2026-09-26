import React, { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';

// CLIP ViT-B/32: 224 x 224 input, 32 x 32 patches -> 7 x 7 grid
const IMAGE_PX = 224;
const PATCH_PX = 32;
const GRID = IMAGE_PX / PATCH_PX;
const TILE = 28;
const SPREAD = 9;
const GRID_SIZE = GRID * TILE + (GRID - 1) * SPREAD;

const FINGERPRINT_BARS = 14;
const DEPTH = 6;

// render -> patches -> model -> fingerprint: one row on desktop, stacked on phones
const ROW_MID = 34 + GRID_SIZE / 2;
const COL_X = 10;
const COL_MID = COL_X + GRID_SIZE / 2;
const COL_GRID_Y = GRID_SIZE + 110;
const COL_MODEL_Y = COL_GRID_Y + GRID_SIZE + 46;
const COL_MODEL_W = 114;
const COL_MODEL_MID = COL_MODEL_Y + 32;
const LAYOUTS = {
  row: {
    viewBox: `0 0 1040 ${GRID_SIZE + 40}`,
    image: { x: 0, y: 34 },
    grid: { x: GRID_SIZE + 90, y: 34 },
    model: { x: GRID_SIZE * 2 + 170, y: ROW_MID - 75, w: 134, h: 150 },
    fingerprint: { x: 1040 - 124, y: ROW_MID - 50, w: 124, h: 100, labelY: 22 },
    arrows: [
      { x1: GRID_SIZE + 18, y1: ROW_MID, x2: GRID_SIZE + 72, y2: ROW_MID },
      { x1: GRID_SIZE * 2 + 108, y1: ROW_MID, x2: GRID_SIZE * 2 + 156, y2: ROW_MID },
      { x1: GRID_SIZE * 2 + 170 + 134 + DEPTH + 14, y1: ROW_MID, x2: 1040 - 124 - 16, y2: ROW_MID },
    ],
  },
  column: {
    viewBox: `0 0 ${GRID_SIZE + 20} ${COL_MODEL_Y + 64 + DEPTH + 8}`,
    image: { x: COL_X, y: 34 },
    grid: { x: COL_X, y: COL_GRID_Y },
    model: { x: COL_X, y: COL_MODEL_Y, w: COL_MODEL_W, h: 64 },
    fingerprint: { x: COL_X + GRID_SIZE - 92, y: COL_MODEL_MID - 16, w: 92, h: 40, labelY: COL_MODEL_MID - 24 },
    arrows: [
      { x1: COL_MID, y1: GRID_SIZE + 48, x2: COL_MID, y2: GRID_SIZE + 82 },
      { x1: COL_X + COL_MODEL_W / 2, y1: COL_GRID_Y + GRID_SIZE + 10, x2: COL_X + COL_MODEL_W / 2, y2: COL_MODEL_Y - 8 },
      { x1: COL_X + COL_MODEL_W + DEPTH + 8, y1: COL_MODEL_MID, x2: COL_X + GRID_SIZE - 100, y2: COL_MODEL_MID },
    ],
  },
};

// Stable pseudo-random bar heights per font so each specimen gets its own fingerprint
const fingerprintBars = (seed) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: FINGERPRINT_BARS }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return 0.25 + (h % 1000) / 1333;
  });
};

const ModelBlock = ({ x, y, w, h }) => (
  <g className="hiw-patch-model">
    <rect className="hiw-patch-model-depth" x={x + DEPTH} y={y + DEPTH} width={w} height={h} rx={10} />
    <rect className="hiw-patch-model-face" x={x} y={y} width={w} height={h} rx={10} />
    <text className="hiw-patch-model-name" x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle">FontCLIP</text>
    <text className="hiw-patch-model-sub" x={x + w / 2} y={y + h / 2 + 16} textAnchor="middle">vision model</text>
  </g>
);

const Fingerprint = ({ x, y, w, h, labelY, values }) => {
  const step = w / values.length;
  return (
    <g className="hiw-patch-fingerprint">
      <text className="hiw-patch-label" x={x + w / 2} y={labelY} textAnchor="middle">fingerprint</text>
      {values.map((v, i) => (
        <rect
          key={i}
          x={x + i * step + step * 0.15}
          y={y + (h * (1 - v)) / 2}
          width={step * 0.7}
          height={h * v}
          rx={1.5}
          style={{ opacity: 0.35 + v * 0.65 }}
        />
      ))}
    </g>
  );
};

const Arrow = ({ x1, y1, x2, y2 }) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 6;
  const p1 = [x2 - head * Math.cos(angle - 0.5), y2 - head * Math.sin(angle - 0.5)];
  const p2 = [x2 - head * Math.cos(angle + 0.5), y2 - head * Math.sin(angle + 0.5)];
  return (
    <g className="hiw-patch-arrow">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polyline points={`${p1[0]},${p1[1]} ${x2},${y2} ${p2[0]},${p2[1]}`} />
    </g>
  );
};

/**
 * How FontCLIP sees a specimen: the 224 x 224 render is cut into a 7 x 7 grid of
 * 32-pixel patches (real crops of the render), which the model turns into a fingerprint.
 * `specimen` is the URL of the real model input; the map glyph is only a fallback.
 */
const HowItWorksPatches = ({ font, glyph, specimen }) => {
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const layout = isNarrow ? LAYOUTS.column : LAYOUTS.row;
  const ref = useRef(null);
  const [spread, setSpread] = useState(false);

  // Patches peel apart the first time the figure scrolls into view
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSpread(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSpread(true);
        observer.disconnect();
      }
    }, { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Content of the 224 px image, in image pixel coordinates
  let glyphInImage = null;
  if (specimen) {
    glyphInImage = <image className="hiw-specimen-img" href={specimen} width={IMAGE_PX} height={IMAGE_PX} />;
  } else if (glyph) {
    glyphInImage = <path d={glyph} transform="translate(8 8) scale(2.6)" />;
  }
  const { image, grid } = layout;
  // Render and tiles share one scale so each tile is the exact crop of the render;
  // the render sits centered in the footprint of the spread grid
  const imageScale = TILE / PATCH_PX;
  const imageInset = (GRID_SIZE - GRID * TILE) / 2;

  return (
    <svg
      ref={ref}
      className={`hiw-patches${spread ? ' is-spread' : ''}`}
      viewBox={layout.viewBox}
      role="img"
      aria-label={`${font.name}'s "A" rendered at 224 by 224 pixels, cut into a 7 by 7 grid of 32-pixel patches, and fed to the FontCLIP vision model, which outputs a numeric fingerprint.`}
    >
      {/* 224 x 224 render with the patch grid */}
      <g transform={`translate(${image.x + imageInset} ${image.y + imageInset}) scale(${imageScale})`}>
        <rect className="hiw-patch-image" width={IMAGE_PX} height={IMAGE_PX} />
        <g className="hiw-patch-glyph">{glyphInImage}</g>
        {Array.from({ length: GRID - 1 }, (_, i) => (
          <g key={i} className="hiw-patch-gridline">
            <line x1={(i + 1) * PATCH_PX} y1={0} x2={(i + 1) * PATCH_PX} y2={IMAGE_PX} />
            <line x1={0} y1={(i + 1) * PATCH_PX} x2={IMAGE_PX} y2={(i + 1) * PATCH_PX} />
          </g>
        ))}
      </g>
      <text className="hiw-patch-label" x={image.x + GRID_SIZE / 2} y={image.y - 12} textAnchor="middle">224 x 224 px render</text>

      {/* 49 patches */}
      <text className="hiw-patch-label" x={grid.x + GRID_SIZE / 2} y={grid.y - 12} textAnchor="middle">49 patches of 32 x 32 px</text>
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const r = Math.floor(i / GRID);
        const c = i % GRID;
        return (
          <g key={i} transform={`translate(${grid.x + c * TILE} ${grid.y + r * TILE})`}>
            <g className="hiw-patch-tile" style={{ '--dx': `${c * SPREAD}px`, '--dy': `${r * SPREAD}px`, '--delay': `${(r + c) * 35}ms` }}>
              {/* Nested viewport crops the 32 px patch without a shared clipPath */}
              <svg
                className="hiw-patch-crop"
                width={TILE}
                height={TILE}
                viewBox={`${c * PATCH_PX} ${r * PATCH_PX} ${PATCH_PX} ${PATCH_PX}`}
              >
                <rect className="hiw-patch-image" width={IMAGE_PX} height={IMAGE_PX} />
                <g className="hiw-patch-glyph">{glyphInImage}</g>
              </svg>
              <rect className="hiw-patch-border" width={TILE} height={TILE} />
            </g>
          </g>
        );
      })}

      <ModelBlock {...layout.model} />
      <Fingerprint {...layout.fingerprint} values={fingerprintBars(font.name || '')} />

      {layout.arrows.map((a, i) => <Arrow key={i} {...a} />)}
    </svg>
  );
};

export default HowItWorksPatches;

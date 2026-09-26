import React, { useMemo } from 'react';

// Dimetric (2:1) projection: the pipeline axis runs down-right towards the
// viewer, every stage is a plane standing across that axis.
const ANGLE = Math.atan(0.5);
const AXIS = [Math.cos(ANGLE), Math.sin(ANGLE)];
const PLANE_U = [Math.cos(ANGLE), -Math.sin(ANGLE)];
const ORIGIN = [96, 150];
const VIEW_BOX = '0 50 810 550';

const SPECIMEN_COUNT = 7;
const SPECIMEN_GAP = 12;
const SPECIMEN_W = 96;
const SPECIMEN_H = 112;
// FontCLIP, same geometry as HowItWorksPatches: 224 px render, 7 x 7 patches of 32 px
const IMAGE_PX = 224;
const PATCH_PX = 32;
const GRID = IMAGE_PX / PATCH_PX;
const PATCH_T = 235;
const TILE = 14;
const TILE_GAP = 5;
const PATCH_SPAN = GRID * TILE + (GRID - 1) * TILE_GAP;
const EMBED_T = 375;
const EMBED_SIZE = 96;
const TAG_PILLS = ['Sans / Humanist', 'Script / Formal'];
const PROJ_T = 625;
const PROJ_W = 240;
const PROJ_H = 180;
const STAGE_LABELS = ['Render specimens', 'FontCLIP', 'Fingerprint', 't-SNE map'];
const STAGE_NOTES = [
  ['one image per design:', '"Hamburgefonstiv"'],
  null,
  ['FontCLIP + tags + proportions', 'weighted 0.5 / 0.5 / 0.2'],
  'squashed to 2D, overlaps removed',
];

// The fingerprint fed to t-SNE: one vector stacked from three blocks, heights follow their weights
const FP_PAD = 8;
const FP_GAP = 7;
const FP_CELL_GAP = 2;
const FP_BLOCKS = [
  { id: 'clip', label: 'FontCLIP', weight: 0.5, rows: 2, cols: 8 },
  { id: 'tags', label: 'style tags', weight: 0.5, rows: 2, cols: 8 },
  { id: 'metrics', label: 'proportions', weight: 0.2, rows: 1, cols: 7 },
];
const FP_INNER = EMBED_SIZE - 2 * FP_PAD;
const FP_LAYOUT = (() => {
  const total = FP_BLOCKS.reduce((sum, b) => sum + b.weight, 0);
  const avail = FP_INNER - FP_GAP * (FP_BLOCKS.length - 1);
  let v = -FP_INNER / 2;
  return FP_BLOCKS.map((b) => {
    const h = (b.weight / total) * avail;
    const block = { ...b, v, h };
    v += h + FP_GAP;
    return block;
  });
})();

// Deterministic per-font shades so each font gets its own-looking fingerprint
const seededShades = (seed, count) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: count }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>> 0) % 1000) / 1000;
  });
};

const formatTag = (tag) => (tag ? tag.replace('/', ' / ') : 'Serif / Didone');

const onAxis = (t) => [ORIGIN[0] + AXIS[0] * t, ORIGIN[1] + AXIS[1] * t];

// Screen position of plane-local (u right, v down) coordinates, plane centred on the axis at t
const inPlane = (t, u, v) => {
  const [x, y] = onAxis(t);
  return [x + PLANE_U[0] * u, y + PLANE_U[1] * u + v];
};

const planeMatrix = (t) => {
  const [x, y] = onAxis(t);
  return `matrix(${PLANE_U[0]} ${PLANE_U[1]} 0 1 ${x} ${y})`;
};

const glyphTransform = (u, v, size) => `translate(${u - size / 2} ${v - size / 2}) scale(${size / 80})`;

// Label written on the plane at t, so it follows the slope of the plane's edges
const AnnoText = ({ t, u, v, children }) => (
  <text className="hiw-iso-anno" transform={planeMatrix(t)} x={u} y={v} textAnchor="middle">{children}</text>
);

const StepNumber = ({ n, x, y, label, note, title, onJump, anchor = 'start' }) => {
  const activate = () => onJump(n - 1);
  const labelX = anchor === 'end' ? x - 20 : x + 20;
  return (
    <g
      className="hiw-iso-step"
      role="button"
      tabIndex={0}
      aria-label={`Go to step ${n}: ${title}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <circle className="hiw-iso-num" cx={x} cy={y} r={12} />
      <text className="hiw-iso-num-text" x={x} y={y} textAnchor="middle" dominantBaseline="central">{n}</text>
      {label && (
        <text className="hiw-iso-label" x={labelX} y={y} textAnchor={anchor} dominantBaseline="central">{label}</text>
      )}
      {label && note && [].concat(note).map((line, i) => (
        <text key={i} className="hiw-iso-note" x={labelX} y={y + 17 + i * 15} textAnchor={anchor} dominantBaseline="central">{line}</text>
      ))}
    </g>
  );
};

/**
 * Isometric overview of the pipeline, after IDEO's Font Map diagram: specimens,
 * FontCLIP patches, style tags blended into the embedding and the t-SNE map,
 * all following one real font. The numbered circles match steps 1 to 4 of the page.
 */
const HowItWorksDiagram = ({ focus, specimens, fonts, glyphFor, specimenFor = () => null, stepTitles, onJump }) => {
  const model = useMemo(() => {
    const xs = fonts.map(f => f.x);
    const ys = fonts.map(f => f.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const norm = (f) => [(f.x - xMin) / Math.max(1, xMax - xMin), (yMax - f.y) / Math.max(1, yMax - yMin)];

    // Stage 4: every font as a faint dot, plane shifted so the axis hits the focus font
    const [fx, fy] = norm(focus);
    const projOffset = [-PROJ_W * fx, -PROJ_H * fy];
    const projDots = fonts.map(f => {
      const [nx, ny] = norm(f);
      return [projOffset[0] + nx * PROJ_W, projOffset[1] + ny * PROJ_H];
    });

    return { projOffset, projDots };
  }, [fonts, focus]);

  const focusGlyph = glyphFor(focus);
  // The followed font is the front specimen, the others fan out behind it
  const highlighted = SPECIMEN_COUNT - 1;
  const specimenList = [...specimens.filter(f => f.id !== focus.id).slice(0, SPECIMEN_COUNT - 1), focus];
  // The axis is drawn over every plane, so it starts where it leaves the front specimen's
  // outline instead of crossing its glyph: along the axis, plane u grows 1:1 and v by 2 sin(angle).
  const specimenExit = Math.min(SPECIMEN_W / 2, SPECIMEN_H / 2 / (2 * Math.sin(ANGLE)));
  const lineStart = onAxis(highlighted * SPECIMEN_GAP + specimenExit);
  const lineEnd = onAxis(PROJ_T);
  const axisPath = `M${lineStart[0]},${lineStart[1]} L${lineEnd[0]},${lineEnd[1]}`;

  const num = (n, t, u, v, anchor) => {
    const [x, y] = inPlane(t, u, v);
    return (
      <StepNumber
        n={n}
        x={x}
        y={y}
        title={stepTitles[n - 1]}
        label={STAGE_LABELS[n - 1]}
        note={STAGE_NOTES[n - 1]}
        onJump={onJump}
        anchor={anchor}
      />
    );
  };

  // Content of the 224 px image as in HowItWorksPatches, in image pixel coordinates
  const focusSpecimen = specimenFor(focus);
  let glyphInImage = null;
  if (focusSpecimen) {
    glyphInImage = <image className="hiw-specimen-img" href={focusSpecimen} width={IMAGE_PX} height={IMAGE_PX} />;
  } else if (focusGlyph) {
    glyphInImage = <path className="hiw-iso-glyph" d={focusGlyph} transform="translate(8 8) scale(2.6)" />;
  }
  // Step 3: the focus font's own Google tag in accent, two other tags for contrast, pinned onto its embedding
  const focusTag = formatTag(focus.style_tag);
  const pills = [focusTag, ...TAG_PILLS.filter(t => t !== focusTag)].slice(0, 3);
  const embedCenter = onAxis(EMBED_T);
  const tagsBlock = FP_LAYOUT.find(b => b.id === 'tags');
  const tagsAnchor = inPlane(EMBED_T, -FP_INNER / 4, tagsBlock.v + tagsBlock.h / 2);
  const pillAnchors = [[2, -150], [32, -122], [62, -94]];

  return (
    <svg className="hiw-iso" viewBox={VIEW_BOX} role="group" aria-labelledby="hiw-iso-title">
      <title id="hiw-iso-title">
        {`Pipeline overview following ${focus.name}: rendered specimens; FontCLIP cutting each specimen into patches; style tags such as ${focusTag} and measured proportions blended into the fingerprint; the t-SNE map in 2D.`}
      </title>
      <defs>
        <clipPath id="hiw-iso-patch-clip">
          <rect width={PATCH_PX} height={PATCH_PX} />
        </clipPath>
        <linearGradient id="hiw-iso-plane" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="hiw-iso-stop-soft" />
          <stop offset="1" className="hiw-iso-stop-strong" />
        </linearGradient>
        <filter id="hiw-iso-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.5 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* 1. Specimens */}
      {specimenList.map((f, i) => {
        const d = glyphFor(f);
        const isFocus = i === highlighted;
        // Back cards stay empty outlines: stacked specimens would overlap into noise
        const src = isFocus ? specimenFor(f) : null;
        if (!isFocus && specimenFor(f)) {
          return (
            <g key={f.id} transform={planeMatrix(i * SPECIMEN_GAP)} className="hiw-iso-card"
              style={{ opacity: Math.max(0.2, 0.85 - (highlighted - i) * 0.12) }}>
              <rect x={-SPECIMEN_W / 2} y={-SPECIMEN_H / 2} width={SPECIMEN_W} height={SPECIMEN_H} vectorEffect="non-scaling-stroke" />
            </g>
          );
        }
        return (
          <g
            key={f.id}
            transform={planeMatrix(i * SPECIMEN_GAP)}
            className={`hiw-iso-card${isFocus ? ' is-focus' : ''}`}
            style={{ opacity: isFocus ? 1 : Math.max(0.2, 0.85 - (highlighted - i) * 0.12) }}
          >
            <rect x={-SPECIMEN_W / 2} y={-SPECIMEN_H / 2} width={SPECIMEN_W} height={SPECIMEN_H} vectorEffect="non-scaling-stroke" />
            {src && (
              <image className="hiw-specimen-img" href={src} x={-SPECIMEN_W / 2} y={-SPECIMEN_W / 2} width={SPECIMEN_W} height={SPECIMEN_W} />
            )}
            {!src && d && <path className="hiw-iso-glyph" d={d} transform={glyphTransform(0, 0, 64)} />}
          </g>
        );
      })}

      {/* 2. FontCLIP: the specimen cut into patches, spread apart */}
      <g transform={planeMatrix(PATCH_T)}>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const r = Math.floor(i / GRID);
          const c = i % GRID;
          const u = -PATCH_SPAN / 2 + c * (TILE + TILE_GAP);
          const v = -PATCH_SPAN / 2 + r * (TILE + TILE_GAP);
          return (
            <g key={i} transform={`translate(${u} ${v}) scale(${TILE / PATCH_PX})`} className="hiw-iso-tile">
              <g clipPath="url(#hiw-iso-patch-clip)">
                <g transform={`translate(${-c * PATCH_PX} ${-r * PATCH_PX})`}>
                  <rect className="hiw-iso-tile-bg" width={IMAGE_PX} height={IMAGE_PX} />
                  {glyphInImage}
                </g>
              </g>
              <rect className="hiw-iso-tile-border" width={PATCH_PX} height={PATCH_PX} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </g>
      <AnnoText t={PATCH_T} u={0} v={-PATCH_SPAN / 2 - 8}>patches</AnnoText>

      {/* 3. The fingerprint: FontCLIP, style tag and proportion blocks stacked into one vector */}
      <g transform={planeMatrix(EMBED_T)} className="hiw-iso-embed">
        <rect x={-EMBED_SIZE / 2} y={-EMBED_SIZE / 2} width={EMBED_SIZE} height={EMBED_SIZE} vectorEffect="non-scaling-stroke" />
        {FP_LAYOUT.map((block) => {
          const shades = seededShades(`${focus.id}:${block.id}`, block.rows * block.cols);
          const cellW = (FP_INNER - FP_CELL_GAP * (block.cols - 1)) / block.cols;
          const cellH = (block.h - FP_CELL_GAP * (block.rows - 1)) / block.rows;
          return (
            <g key={block.id} className={`hiw-iso-fp is-${block.id}`}>
              {shades.map((s, i) => (
                <rect
                  key={i}
                  x={-FP_INNER / 2 + (i % block.cols) * (cellW + FP_CELL_GAP)}
                  y={block.v + Math.floor(i / block.cols) * (cellH + FP_CELL_GAP)}
                  width={cellW}
                  height={cellH}
                  style={{ fillOpacity: block.id === 'clip' ? 0.2 + s * 0.75 : 0.08 + s * 0.4 }}
                />
              ))}
              <text className="hiw-iso-fp-label" x={EMBED_SIZE / 2 + 6} y={block.v + block.h / 2} dominantBaseline="central">
                {block.label} <tspan className="hiw-iso-fp-weight">{block.weight}</tspan>
              </text>
            </g>
          );
        })}
      </g>
      {pills.map((tag, i) => {
        const [dx, dy] = pillAnchors[i];
        const x = embedCenter[0] + dx;
        const y = embedCenter[1] + dy;
        const w = tag.length * 6.2 + 16;
        return (
          <g key={tag} className={`hiw-iso-pill${i === 0 ? ' is-focus' : ''}`}>
            <line x1={x} y1={y} x2={tagsAnchor[0]} y2={tagsAnchor[1]} />
            <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{tag}</text>
          </g>
        );
      })}

      {/* 4. t-SNE projection */}
      <g transform={planeMatrix(PROJ_T)} className="hiw-iso-proj">
        <rect className="hiw-iso-proj-bg" x={model.projOffset[0]} y={model.projOffset[1]} width={PROJ_W} height={PROJ_H} vectorEffect="non-scaling-stroke" />
        <rect className="hiw-iso-grain" x={model.projOffset[0]} y={model.projOffset[1]} width={PROJ_W} height={PROJ_H} />
        {model.projDots.map((p, i) => <circle key={i} className="hiw-iso-proj-dot" cx={p[0]} cy={p[1]} r={0.9} />)}
        <line className="hiw-iso-axis" x1={model.projOffset[0]} y1={model.projOffset[1] + PROJ_H} x2={model.projOffset[0] + PROJ_W + 8} y2={model.projOffset[1] + PROJ_H} vectorEffect="non-scaling-stroke" />
        <line className="hiw-iso-axis" x1={model.projOffset[0]} y1={model.projOffset[1] + PROJ_H} x2={model.projOffset[0]} y2={model.projOffset[1] - 8} vectorEffect="non-scaling-stroke" />
        <text className="hiw-iso-axis-label" x={model.projOffset[0] + PROJ_W + 12} y={model.projOffset[1] + PROJ_H + 4}>x</text>
        <text className="hiw-iso-axis-label" x={model.projOffset[0] - 4} y={model.projOffset[1] - 12}>y</text>
        <circle className="hiw-iso-accent-fill" r={6} />
        <g transform="translate(0 -24)">
          <rect className="hiw-iso-accent-fill" x={-4} y={-9} width={focus.name.length * 6.4 + 8} height={18} rx={2} />
          <text className="hiw-iso-tag" x={0} y={0} dominantBaseline="central">{focus.name}</text>
        </g>
      </g>

      <path className="hiw-iso-line" d={axisPath} />
      <circle className="hiw-iso-accent-fill" cx={embedCenter[0]} cy={embedCenter[1]} r={4.5} />

      {num(1, highlighted * SPECIMEN_GAP, -SPECIMEN_W / 2 - 24, SPECIMEN_H / 2 + 30)}
      {num(2, PATCH_T, -PATCH_SPAN / 2 - 16, PATCH_SPAN / 2 + 28)}
      {num(3, EMBED_T, -EMBED_SIZE / 2 - 16, EMBED_SIZE / 2 + 30)}
      {num(4, PROJ_T, model.projOffset[0] - 12, model.projOffset[1] + PROJ_H + 32)}
    </svg>
  );
};

export default HowItWorksDiagram;

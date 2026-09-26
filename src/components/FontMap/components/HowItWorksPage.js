import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModalPortal from './ModalPortal';
import HowItWorksDiagram from './HowItWorksDiagram';
import HowItWorksPatches from './HowItWorksPatches';
import { CATEGORIES, CATEGORY_COLORS, FALLBACK_CATEGORY_COLOR } from '../utils/categories';

// Numbered steps match the numbers in the overview diagram
const STEP_TITLES = [
  'Render every font once',
  'Let FontCLIP look at it',
  'Add the vocabulary of type',
  'Flatten it into a map',
];
const EXTRA_SECTIONS = [
  { id: 'hiw-categories', title: 'Six categories' },
  { id: 'hiw-explore', title: 'Using the map' },
];

const STEP1_FONTS = ['playfair-display', 'roboto', 'pacifico', 'space-mono', 'press-start-2p', 'unifrakturmaguntia', 'bebas-neue', 'great-vibes'];
// Real FontCLIP inputs shipped in public/data/specimens (copied from pipeline/output/pngs)
const SPECIMEN_IDS = new Set(STEP1_FONTS);
const specimenFor = (font) => (font && SPECIMEN_IDS.has(font.id) ? `/data/specimens/${font.id}.png` : null);
const STYLE_STRIPS = ['Serif/Didone', 'Sans/Geometric', 'Script/Formal', 'Theme/Pixel'];
const MAP_PRESETS = ['inter', 'merriweather', 'montserrat', 'playfair-display', 'pacifico', 'press-start-2p'];
const DISPLAY_EXAMPLES = ['abril-fatface', 'lobster', 'bungee'];
// Top-level Google tag -> the category its typical members end up in
const TAG_GROUP_CATEGORY = { Sans: 'sans-serif', Serif: 'serif', Script: 'handwriting', Theme: 'decorative' };
const EXCLUDED_FAMILIES = ['Material Symbols', 'Libre Barcode', 'Flow', 'Redacted', 'Linefont', 'Wavefont', 'Yarndings'];
const DIAGRAM_FOCUS = 'playfair-display';

const CATEGORY_INFO = {
  'sans-serif': { label: 'Sans-serif', text: 'No serifs, from geometric to humanist.', examples: ['inter', 'montserrat', 'bebas-neue'] },
  'serif': { label: 'Serif', text: 'Serifed text and display faces, slabs included.', examples: ['playfair-display', 'merriweather', 'abril-fatface'] },
  'handwriting': { label: 'Handwriting', text: 'Scripts, brush lettering and handwritten styles.', examples: ['pacifico', 'great-vibes', 'caveat'] },
  'monospace': { label: 'Monospace', text: 'Every glyph gets the same width.', examples: ['space-mono', 'fira-code', 'vt323'] },
  'decorative': { label: 'Decorative', text: 'Purely stylistic themes: distressed, pixel, techno, stencil...', examples: ['press-start-2p', 'creepster', 'stardos-stencil'] },
  'blackletter': { label: 'Blackletter', text: 'Gothic letterforms, kept as their own class.', examples: ['unifrakturmaguntia', 'pirata-one', 'grenze-gotisch'] },
};

const MAP_WIDTH = 720;
const MAP_PADDING = 14;
const ALIAS_PREVIEW = 18;

const categoryColor = (category) => CATEGORY_COLORS[category] || FALLBACK_CATEGORY_COLOR;

const formatTag = (tag) => {
  if (!tag) return '';
  const [group, sub] = tag.split('/');
  return !sub || sub === group ? group : `${group} / ${sub}`;
};

const percent = (value) => `${Math.round(value * 100)}%`;

// The sprite is keyed off the slugified font name (often imageName), not always the id.
function lookupPath(glyphPaths, font) {
  const imgKey = (font.imageName || font.name || '').toLowerCase();
  return glyphPaths[`${font.id}_a`] || glyphPaths[font.id] || glyphPaths[`${imgKey}_a`] || glyphPaths[imgKey];
}

const FontGlyph = ({ font, glyphPaths, onPick, label, sublabel, className = '' }) => {
  const d = lookupPath(glyphPaths, font);
  const content = (
    <>
      <span className="hiw-glyph-art">
        {d ? (
          <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
            <path d={d} fill="currentColor" />
          </svg>
        ) : (
          <span className="hiw-glyph-fallback" aria-hidden="true">A</span>
        )}
      </span>
      {label && <span className="hiw-glyph-label">{label}</span>}
      {sublabel && <span className="hiw-glyph-sublabel">{sublabel}</span>}
    </>
  );

  if (!onPick) {
    return <span className={`hiw-glyph ${className}`} role="img" aria-label={font.name}>{content}</span>;
  }
  return (
    <button
      type="button"
      className={`hiw-glyph is-clickable ${className}`}
      onClick={() => onPick(font)}
      title={`Open ${font.name} on the map`}
      aria-label={`Open ${font.name} on the map`}
    >
      {content}
    </button>
  );
};

const StepHeader = ({ index }) => (
  <header className="hiw-step-header">
    <span className="hiw-step-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    <h2 id={`hiw-step-${index + 1}-title`} className="hiw-h2">
      <span className="hiw-visually-hidden">Step {index + 1}: </span>
      {STEP_TITLES[index]}
    </h2>
  </header>
);

const SectionHeader = ({ id, title }) => (
  <header className="hiw-step-header">
    <h2 id={`${id}-title`} className="hiw-h2">{title}</h2>
  </header>
);

const ArrowIcon = ({ direction = 'right' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {direction === 'left' ? (
      <>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </>
    ) : (
      <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>
    )}
  </svg>
);

/**
 * Static mini-map of every font as a dot. Clicking near a dot (or a preset)
 * highlights that font and links it to its 8 nearest neighbours.
 */
const NeighbourMap = ({ model, focus, neighbours, onFocus, fontCount }) => {
  const svgRef = useRef(null);

  const dotsLayer = useMemo(() => (
    <g className="hiw-map-dots">
      {model.dots.map(p => (
        <circle key={p.id} cx={p.x} cy={p.y} r={1.9} fill={p.color} />
      ))}
    </g>
  ), [model]);

  const handleClick = (e) => {
    const svg = svgRef.current;
    const ctm = svg && svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const { x, y } = pt.matrixTransform(ctm.inverse());
    let best = null;
    let bestDist = 16 * 16;
    for (const p of model.dots) {
      const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    if (best) onFocus(best.id);
  };

  const origin = model.pos.get(focus.id);
  const labelLeft = origin && origin[0] > model.width * 0.7;

  return (
    <svg
      ref={svgRef}
      className="hiw-map"
      viewBox={`0 0 ${model.width} ${model.height}`}
      role="img"
      aria-label={`Map of all ${fontCount} fonts as dots colored by category. ${focus.name} and its 8 nearest neighbours are highlighted.`}
      onClick={handleClick}
    >
      {dotsLayer}
      {origin && (
        <g className="hiw-map-focus">
          {neighbours.map(n => {
            const p = model.pos.get(n.id);
            return p ? <line key={`l-${n.id}`} x1={origin[0]} y1={origin[1]} x2={p[0]} y2={p[1]} /> : null;
          })}
          {neighbours.map(n => {
            const p = model.pos.get(n.id);
            return p ? <circle key={`n-${n.id}`} className="hiw-map-neighbour" cx={p[0]} cy={p[1]} r={4} /> : null;
          })}
          <circle className="hiw-map-origin" cx={origin[0]} cy={origin[1]} r={6.5} />
          <text
            className="hiw-map-label"
            x={origin[0] + (labelLeft ? -12 : 12)}
            y={origin[1] - 10}
            textAnchor={labelLeft ? 'end' : 'start'}
          >
            {focus.name}
          </text>
        </g>
      )}
    </svg>
  );
};

/**
 * Full-page explainer of the pipeline behind the map, illustrated with real
 * fonts from the data. Clicking a glyph closes the page and opens that font.
 */
const HowItWorksPage = ({ onClose, onPickFont, darkMode, fontCount, fonts, glyphPaths }) => {
  const pageRef = useRef(null);
  const [focusId, setFocusId] = useState(MAP_PRESETS[0]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    pageRef.current?.focus();
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, []);

  // Capture phase so the map's own shortcuts (Esc deselects, arrows move the
  // selection) don't fire behind the page.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const data = useMemo(() => {
    const byId = new Map(fonts.map(f => [f.id, f]));
    const pickIds = (ids) => ids.map(id => byId.get(id)).filter(Boolean);
    const hasGlyph = (f) => !!lookupPath(glyphPaths, f);

    const aliasGroups = fonts
      .filter(f => f.aliases && f.aliases.length > 0)
      .sort((a, b) => b.aliases.length - a.aliases.length);
    const aliasTotal = aliasGroups.reduce((sum, f) => sum + f.aliases.length, 0);

    // Members closest to their group's centroid on the map read as the most typical.
    const strips = STYLE_STRIPS.map(tag => {
      const category = TAG_GROUP_CATEGORY[tag.split('/')[0]];
      const members = fonts.filter(f => f.style_tag === tag && !f.style_tag_predicted && f.family === category && hasGlyph(f));
      if (members.length === 0) return { tag, fonts: [] };
      const cx = members.reduce((sum, f) => sum + f.x, 0) / members.length;
      const cy = members.reduce((sum, f) => sum + f.y, 0) / members.length;
      const dist = (f) => (f.x - cx) ** 2 + (f.y - cy) ** 2;
      return { tag, fonts: [...members].sort((a, b) => dist(a) - dist(b)).slice(0, 8) };
    }).filter(s => s.fonts.length > 0);

    const predicted = fonts.filter(f => f.style_tag_predicted);
    const predictedExamples = [];
    const seenGroups = new Set();
    [...predicted]
      .sort((a, b) => b.style_tag_confidence - a.style_tag_confidence)
      .forEach(f => {
        const group = (f.style_tag || '').split('/')[0];
        if (predictedExamples.length < 4 && !seenGroups.has(group) && hasGlyph(f)) {
          seenGroups.add(group);
          predictedExamples.push(f);
        }
      });

    const xs = fonts.map(f => f.x);
    const ys = fonts.map(f => f.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const scale = (MAP_WIDTH - 2 * MAP_PADDING) / Math.max(1, xMax - xMin);
    const height = Math.round((yMax - yMin) * scale + 2 * MAP_PADDING);
    const pos = new Map();
    const dots = fonts.map(f => {
      // y is flipped to match the orientation of the main map
      const x = (f.x - xMin) * scale + MAP_PADDING;
      const y = (yMax - f.y) * scale + MAP_PADDING;
      pos.set(f.id, [x, y]);
      return { id: f.id, x, y, color: categoryColor(f.family) };
    });

    const categories = CATEGORIES.map(cat => {
      const inCat = fonts.filter(f => f.family === cat);
      const examples = pickIds(CATEGORY_INFO[cat].examples).filter(f => f.family === cat);
      for (const f of inCat) {
        if (examples.length >= 3) break;
        if (!examples.includes(f) && hasGlyph(f)) examples.push(f);
      }
      return { cat, count: inCat.length, examples };
    });

    const displayFonts = fonts.filter(f => f.google_category === 'display');
    const displaySplit = CATEGORIES
      .map(cat => ({ cat, count: displayFonts.filter(f => f.family === cat).length }))
      .filter(s => s.count > 0);

    return {
      byId,
      step1: pickIds(STEP1_FONTS),
      aliasGroups,
      aliasTotal,
      strips,
      predictedShare: fonts.length ? predicted.length / fonts.length : 0,
      predictedExamples,
      mapModel: { width: MAP_WIDTH, height, pos, dots },
      presets: pickIds(MAP_PRESETS),
      categories,
      displayTotal: displayFonts.length,
      displaySplit,
      displayExamples: pickIds(DISPLAY_EXAMPLES).filter(f => f.family !== 'decorative'),
    };
  }, [fonts, glyphPaths]);

  const glyphFor = useCallback((font) => lookupPath(glyphPaths, font), [glyphPaths]);
  const diagramFocus = data.byId.get(DIAGRAM_FOCUS) || fonts[0];

  const focus = data.byId.get(focusId) || fonts[0];
  const neighbours = (focus?.neighbors || []).map(id => data.byId.get(id)).filter(Boolean);
  const sameStyleCount = neighbours.filter(n => n.style_tag && n.style_tag === focus.style_tag).length;

  const [mainGroup, ...otherGroups] = data.aliasGroups;
  const count = fontCount.toLocaleString('en-US');

  const scrollToId = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const scrollToStep = (index) => scrollToId(`hiw-step-${index + 1}`);

  const pick = (font) => {
    onClose();
    onPickFont(font);
  };

  return (
    <ModalPortal isOpen={true}>
      {/* dark-mode class must be re-applied here: the portal renders outside .fontmap-container */}
      <div
        ref={pageRef}
        className={`hiw-page${darkMode ? ' dark-mode' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hiw-title"
        tabIndex={-1}
      >
        <div className="hiw-topbar">
          <button type="button" className="hiw-back-button" onClick={onClose} aria-label="Close How it works and go back to the map">
            <ArrowIcon direction="left" />
            <span>Back to the map</span>
          </button>
          <span className="hiw-topbar-hint" aria-hidden="true"><kbd>Esc</kbd> to close</span>
        </div>

        <main className="hiw-main">
          {/* Hero */}
          <section className="hiw-hero hiw-text">
            <p className="hiw-eyebrow">How it works</p>
            <h1 id="hiw-title" className="hiw-h1">How FontMap arranges {count} fonts by how they look</h1>
            <p className="hiw-lede">
              Picking a font usually starts with a category: serif, sans-serif, script. But inside a category the range is huge,
              and the font you are looking for often has a dozen lookalikes you have never heard of. FontMap lets a model look at
              every <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer">Google Fonts</a> family, then lays
              them out so that fonts that look alike end up next to each other.
            </p>
            <p>
              The idea comes from <a href="https://medium.com/ideo-stories/organizing-the-world-of-fonts-with-ai-7d9e49ff2b25" target="_blank" rel="noopener noreferrer">IDEO's Font Map</a> (2017),
              which rendered about 750 fonts as the word "handgloves", described each image with a neural network and
              flattened the result with t-SNE. FontMap follows the same recipe with a model tuned for typography, Google's
              own style tags and about twice as many fonts. Here is the pipeline, step by step, with real fonts from the map.
              Click any glyph to open it.
            </p>

          </section>

          <figure className="hiw-figure hiw-wide hiw-iso-figure">
            <HowItWorksDiagram
              focus={diagramFocus}
              specimens={data.step1}
              fonts={fonts}
              glyphFor={glyphFor}
              specimenFor={specimenFor}
              stepTitles={STEP_TITLES}
              onJump={scrollToStep}
            />
            <figcaption>
              The whole pipeline, following {diagramFocus.name}. Click a number to jump to that step.
            </figcaption>
          </figure>

          <section className="hiw-text hiw-toc-section">
            <nav className="hiw-toc" aria-label="Steps">
              <ol>
                {STEP_TITLES.map((title, i) => (
                  <li key={title}>
                    <button type="button" onClick={() => scrollToStep(i)}>
                      <span className="hiw-toc-number">{String(i + 1).padStart(2, '0')}</span>
                      {title}
                    </button>
                  </li>
                ))}
                {EXTRA_SECTIONS.map(({ id, title }) => (
                  <li key={id}>
                    <button type="button" onClick={() => scrollToId(id)}>
                      <span className="hiw-toc-number" aria-hidden="true">+</span>
                      {title}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </section>

          {/* Step 1 */}
          <section id="hiw-step-1" className="hiw-step" aria-labelledby="hiw-step-1-title">
            <div className="hiw-text">
              <StepHeader index={0} />
              <p>
                Everything starts with a picture: each family is rendered as the type designers' test word
                <strong> "Hamburgefonstiv"</strong>, split over two lines in a 224 x 224 px image. It packs round, straight
                and diagonal strokes, ascenders and a descender, and it is the only thing the model ever sees of a font.
                The "A" on the map is just for display.
              </p>
              <p>
                Many Google Fonts families share the exact same Latin letters and only differ in the other scripts they
                support. Placed separately, they would pile up on the same spot. So fonts whose Latin render is identical
                are <strong>folded into one entry</strong>; the others become aliases, listed as "Same Latin glyphs as ..."
                in the font details. Playwrite "Guides" variants are folded into their base family too.
              </p>
              <p>
                Icon, barcode and placeholder fonts, and the Yarndings knitting dingbats, are left out: they have no
                letters to compare.
                {data.aliasTotal > 0 && <> In total, {data.aliasTotal.toLocaleString('en-US')} families live on the map as aliases.</>}
              </p>
            </div>
            <figure className="hiw-figure hiw-wide">
              <div className="hiw-glyph-row hiw-specimen-row">
                {data.step1.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className="hiw-glyph hiw-specimen is-clickable"
                    onClick={() => pick(f)}
                    title={`Open ${f.name} on the map`}
                    aria-label={`Open ${f.name} on the map`}
                  >
                    <img className="hiw-specimen-img" src={specimenFor(f)} alt="" width={224} height={224} loading="lazy" />
                    <span className="hiw-glyph-label">{f.name}</span>
                  </button>
                ))}
              </div>
              <figcaption>
                Eight of the {count} specimens, exactly as FontCLIP receives them.
              </figcaption>
            </figure>
            {mainGroup && (
              <figure className="hiw-figure hiw-wide">
                <div className="hiw-alias-layout">
                  <div className="hiw-card hiw-alias-main">
                    <FontGlyph font={mainGroup} glyphPaths={glyphPaths} onPick={pick} className="hiw-glyph-xl" />
                    <div className="hiw-alias-body">
                      <p className="hiw-alias-title">
                        <strong>{mainGroup.name}</strong>
                        <span>{mainGroup.aliases.length + 1} families, 1 entry</span>
                      </p>
                      <ul className="hiw-chips" aria-label={`Aliases of ${mainGroup.name}`}>
                        {mainGroup.aliases.slice(0, ALIAS_PREVIEW).map(a => <li key={a}>{a}</li>)}
                        {mainGroup.aliases.length > ALIAS_PREVIEW && (
                          <li className="is-more">+{mainGroup.aliases.length - ALIAS_PREVIEW} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  <div className="hiw-alias-side">
                    {otherGroups.slice(0, 3).map(g => (
                      <div key={g.id} className="hiw-card hiw-alias-small">
                        <FontGlyph font={g} glyphPaths={glyphPaths} onPick={pick} />
                        <p>
                          <strong>{g.name}</strong>
                          <span>+{g.aliases.length} aliases, e.g. {g.aliases.slice(0, 2).join(', ')}</span>
                        </p>
                      </div>
                    ))}
                    <div className="hiw-card hiw-excluded">
                      <p className="hiw-card-label">Left out</p>
                      <ul className="hiw-chips is-struck">
                        {EXCLUDED_FAMILIES.map(name => <li key={name}>{name}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
                <figcaption>The biggest merged groups in the data. Noto's script variants all draw the same Latin "A".</figcaption>
              </figure>
            )}
          </section>

          {/* Step 2 */}
          <section id="hiw-step-2" className="hiw-step" aria-labelledby="hiw-step-2-title">
            <div className="hiw-text">
              <StepHeader index={1} />
              <p>
                Each specimen is handed to{' '}
                <a href="https://github.com/yukistavailable/FontCLIP" target="_blank" rel="noopener noreferrer">FontCLIP</a>,
                a CLIP ViT-B/32 model fine-tuned for typography. The model doesn't read letters. It sees the 224 x 224 image
                as a <strong>7 x 7 grid of 32-pixel patches</strong> and looks at how they relate: the shape of a serif in
                one patch, the weight of a stem in another.
              </p>
              <p>
                Out comes a numeric fingerprint of the letterforms. Fonts that look alike get similar fingerprints,
                whatever their names or categories say.
              </p>
            </div>
            <figure className="hiw-figure hiw-wide">
              <HowItWorksPatches font={diagramFocus} glyph={glyphFor(diagramFocus)} specimen={specimenFor(diagramFocus)} />
              <figcaption>
                {diagramFocus.name}'s "A" as FontCLIP sees it. The patches are real crops of the glyph; the model
                turns them into one fingerprint.
              </figcaption>
            </figure>
          </section>

          {/* Step 3 */}
          <section id="hiw-step-3" className="hiw-step" aria-labelledby="hiw-step-3-title">
            <div className="hiw-text">
              <StepHeader index={2} />
              <p>
                An image model on its own can blur distinctions a type designer would never make. Google Fonts already
                describes most families with <strong>style tags</strong>: sub-styles like Sans / Humanist, Serif / Didone or
                Script / Formal, and strong form themes like Blackletter, Pixel or Stencil. We blend those tags into the
                fingerprint.
              </p>
              <p>
                A small logistic regression, trained on the fonts Google has tagged, reads each font's fingerprint and
                proportions and gives it a probability for every style tag. Those probabilities, rather than the raw tags,
                go into the position: fonts of the same sub-style group together, a font can sit between two styles, and
                fonts without any tag ({percent(data.predictedShare)} of them) get placed the same way.
              </p>
            </div>
            <figure className="hiw-figure hiw-wide">
              <div className="hiw-strips">
                {data.strips.map(s => (
                  <div key={s.tag} className="hiw-strip">
                    <p className="hiw-strip-label">{formatTag(s.tag)}</p>
                    <div className="hiw-strip-glyphs">
                      {s.fonts.map(f => <FontGlyph key={f.id} font={f} glyphPaths={glyphPaths} onPick={pick} />)}
                    </div>
                  </div>
                ))}
              </div>
              <figcaption>Fonts that Google tags with the same sub-style. Blending in the tags pulls fonts like these toward each other.</figcaption>
            </figure>
            {data.predictedExamples.length > 0 && (
              <figure className="hiw-figure hiw-wide">
                <p className="hiw-figure-title">No tag from Google, style predicted</p>
                <div className="hiw-predicted">
                  {data.predictedExamples.map(f => (
                    <div key={f.id} className="hiw-card hiw-predicted-card">
                      <FontGlyph font={f} glyphPaths={glyphPaths} onPick={pick} />
                      <div className="hiw-predicted-body">
                        <strong>{f.name}</strong>
                        <span>{formatTag(f.style_tag)}</span>
                        <span className="hiw-bar" aria-label={`Confidence ${percent(f.style_tag_confidence)}`}>
                          <span style={{ width: percent(f.style_tag_confidence) }} />
                        </span>
                        <span className="hiw-muted">{percent(f.style_tag_confidence)} confidence</span>
                      </div>
                    </div>
                  ))}
                </div>
              </figure>
            )}
            <div className="hiw-text">
              <p>
                Finally, <strong>measured proportions</strong> read from the font files with fontTools help condensed and
                extended fonts find each other, something a single glyph image captures poorly:
              </p>
              <ul className="hiw-chips hiw-metrics">
                <li>glyph width</li>
                <li>x-height</li>
                <li>cap height</li>
                <li>monospace</li>
                <li>italic angle</li>
              </ul>
            </div>
          </section>

          {/* Step 4 */}
          <section id="hiw-step-4" className="hiw-step" aria-labelledby="hiw-step-4-title">
            <div className="hiw-text">
              <StepHeader index={3} />
              <p>
                Each font becomes one long vector made of three blocks. Each block is scaled to a length of 1, then
                weighted:
              </p>
              <ul className="hiw-weights">
                <li><span className="hiw-weight">0.5</span> the FontCLIP fingerprint (512 numbers)</li>
                <li><span className="hiw-weight">0.5</span> the square root of the style probabilities (one per tag)</li>
                <li><span className="hiw-weight">0.2</span> the measured proportions, standardized (7 numbers)</li>
              </ul>
              <p>
                The image and the tags weigh the same, and proportions act as a tie-breaker. The square root softens the
                classifier's confidence so that close runners-up still count. <strong>t-SNE</strong> (perplexity 15,
                Euclidean distance) then projects this vector down to two dimensions while trying to keep every font next
                to the fonts it was closest to. The "similar fonts" in the details panel are the 8 nearest neighbours in
                that same space. A last overlap-removal pass nudges glyphs apart so they stay readable.
              </p>
            </div>
            {focus && (
              <figure className="hiw-figure hiw-wide">
                <div className="hiw-presets" role="group" aria-label="Highlight a font on the mini-map">
                  {data.presets.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={f.id === focus.id ? 'is-active' : ''}
                      aria-pressed={f.id === focus.id}
                      onClick={() => setFocusId(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                  <span className="hiw-muted hiw-presets-hint">or click any dot</span>
                </div>
                <div className="hiw-card hiw-map-card">
                  <NeighbourMap
                    model={data.mapModel}
                    focus={focus}
                    neighbours={neighbours}
                    onFocus={setFocusId}
                    fontCount={count}
                  />
                </div>
                <div className="hiw-neighbours">
                  <div className="hiw-neighbours-origin">
                    <FontGlyph font={focus} glyphPaths={glyphPaths} onPick={pick} className="hiw-glyph-lg" label={focus.name} sublabel={formatTag(focus.style_tag)} />
                  </div>
                  <div className="hiw-neighbours-list">
                    {neighbours.map(n => (
                      <FontGlyph
                        key={n.id}
                        font={n}
                        glyphPaths={glyphPaths}
                        onPick={pick}
                        label={n.name}
                        className={n.style_tag && n.style_tag === focus.style_tag ? 'is-same-style' : ''}
                      />
                    ))}
                  </div>
                </div>
                <figcaption>
                  {focus.name} and its 8 nearest neighbours. {sameStyleCount} of 8 share its Google sub-style
                  ({formatTag(focus.style_tag)}), marked with a dot. Try the others: some fonts sit in tight style families,
                  others between several.
                </figcaption>
              </figure>
            )}
          </section>

          {/* Categories */}
          <section id={EXTRA_SECTIONS[0].id} className="hiw-step" aria-labelledby={`${EXTRA_SECTIONS[0].id}-title`}>
            <div className="hiw-text">
              <SectionHeader {...EXTRA_SECTIONS[0]} />
              <p>
                Colors and filters use six categories that follow each font's <strong>Latin structure</strong>, rather than
                how it is filed. Purely stylistic designs are grouped as Decorative, and Blackletter keeps its own class.
              </p>
            </div>
            <figure className="hiw-figure hiw-wide">
              <div className="hiw-categories">
                {data.categories.map(({ cat, count: catCount, examples }) => (
                  <div key={cat} className="hiw-card hiw-category" style={{ '--hiw-cat-color': categoryColor(cat) }}>
                    <p className="hiw-category-title">
                      <span className="hiw-swatch" aria-hidden="true" />
                      <strong>{CATEGORY_INFO[cat].label}</strong>
                      <span className="hiw-muted">{catCount.toLocaleString('en-US')}</span>
                    </p>
                    <div className="hiw-category-glyphs">
                      {examples.map(f => <FontGlyph key={f.id} font={f} glyphPaths={glyphPaths} onPick={pick} />)}
                    </div>
                    <p className="hiw-category-text">{CATEGORY_INFO[cat].text}</p>
                  </div>
                ))}
              </div>
              <figcaption>The six categories, with the number of entries in each and three examples.</figcaption>
            </figure>
            <div className="hiw-text">
              <p>
                Google files {data.displayTotal.toLocaleString('en-US')} of these families as "Display", a label about usage
                rather than form. FontMap re-files them by their actual shape, and the font details show "Google Fonts:
                Display" when it differs. Display fonts tagged "Wacky" go to Decorative, and about 30 were corrected by hand
                after a visual review, along with a handful that Google files by their non-Latin script.
              </p>
            </div>
            {data.displayTotal > 0 && (
              <figure className="hiw-figure hiw-text">
                <div className="hiw-stack" role="img" aria-label={`Where Google's Display fonts went: ${data.displaySplit.map(s => `${s.count} ${s.cat}`).join(', ')}`}>
                  {data.displaySplit.map(s => (
                    <span key={s.cat} style={{ flexGrow: s.count, background: categoryColor(s.cat) }} title={`${CATEGORY_INFO[s.cat].label}: ${s.count}`} />
                  ))}
                </div>
                <ul className="hiw-stack-legend">
                  {data.displaySplit.map(s => (
                    <li key={s.cat}>
                      <span className="hiw-swatch" style={{ '--hiw-cat-color': categoryColor(s.cat) }} aria-hidden="true" />
                      {CATEGORY_INFO[s.cat].label} <span className="hiw-muted">{s.count}</span>
                    </li>
                  ))}
                </ul>
                {data.displayExamples.length > 0 && (
                  <div className="hiw-refiled">
                    {data.displayExamples.map(f => (
                      <FontGlyph key={f.id} font={f} glyphPaths={glyphPaths} onPick={pick} label={f.name} sublabel={`Display, now ${CATEGORY_INFO[f.family]?.label || f.family}`} />
                    ))}
                  </div>
                )}
                <figcaption>Where Google's Display fonts ended up.</figcaption>
              </figure>
            )}
          </section>

          {/* Using the map */}
          <section id={EXTRA_SECTIONS[1].id} className="hiw-step" aria-labelledby={`${EXTRA_SECTIONS[1].id}-title`}>
            <div className="hiw-text">
              <SectionHeader {...EXTRA_SECTIONS[1]} />
              <p>The result is the map you just left. A few things you can do with it:</p>
              <dl className="hiw-features">
                <div>
                  <dt>Pan and zoom</dt>
                  <dd>Drag and scroll, or pinch on touch screens.</dd>
                </div>
                <div>
                  <dt>Search</dt>
                  <dd>By name, aliases included ("Noto Sans Thai" finds Noto Sans), or by style: "humanist", "didone", "pixel".</dd>
                </div>
                <div>
                  <dt>Filter by category</dt>
                  <dd>Colors and filters use the six categories above.</dd>
                </div>
                <div>
                  <dt>Font details</dt>
                  <dd>Click a glyph to see its tags, aliases and similar fonts.</dd>
                </div>
                <div>
                  <dt>Switch the glyph</dt>
                  <dd>On desktop, type any letter, digit or <kbd>&amp;</kbd>. Glyphs load from per-character SVG sprites.</dd>
                </div>
                <div>
                  <dt>Walk the neighbourhood</dt>
                  <dd>With a font open, arrow keys jump to the nearest font in that direction.</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Limitations */}
          <section className="hiw-step hiw-limits" aria-labelledby="hiw-limits-title">
            <div className="hiw-text">
              <h2 id="hiw-limits-title" className="hiw-h2">What the map can't tell you</h2>
              <ul className="hiw-limits-list">
                <li>
                  <strong>A glyph is not a typeface.</strong> One letter, or a few, can't capture spacing, the texture of a
                  paragraph or the italics.
                </li>
                <li>
                  <strong>Tags are incomplete.</strong> About {percent(data.predictedShare)} of fonts have no Google tag and
                  get a predicted style instead, which can be wrong.
                </li>
                <li>
                  <strong>Position is relative.</strong> t-SNE keeps neighbourhoods, not global distances: how far apart two
                  distant islands sit means little.
                </li>
                <li>
                  <strong>Categories simplify.</strong> Six colors can't do justice to fonts that sit between styles.
                </li>
              </ul>
            </div>
          </section>

          {/* About */}
          <section className="hiw-step hiw-about" aria-labelledby="hiw-about-title">
            <div className="hiw-text">
              <h2 id="hiw-about-title" className="hiw-h2">About this project</h2>
              <p>
                This project is <strong>completely open source</strong>: you can explore the code, modify the parameters, or
                run it on your own font collection. The <strong>complete dataset</strong> is open too, including all font
                metadata, FontCLIP embeddings and positioning data from{' '}
                <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer">Google Fonts</a>.
              </p>
              <div className="hiw-actions">
                <a href="https://github.com/tfrere/fontmap" target="_blank" rel="noopener noreferrer" className="hiw-button">
                  View source on GitHub
                  <ArrowIcon />
                </a>
                <button type="button" className="hiw-button is-primary" onClick={onClose}>
                  Back to the map
                </button>
              </div>
              <p className="hiw-credit">
                Made by Thibaud Frere - <a href="https://tfrere.com" target="_blank" rel="noopener noreferrer">tfrere.com</a>
              </p>
            </div>
          </section>
        </main>
      </div>
    </ModalPortal>
  );
};

export default HowItWorksPage;

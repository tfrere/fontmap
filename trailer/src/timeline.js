// Shared clock for picture and sound: 128 BPM, 8 bars of 4/4 = exactly 15 s.
(function () {
  const BPM = 128;
  const BEAT = 60 / BPM;
  const BARS = 8;
  const DURATION = BARS * 4 * BEAT;

  // Bar 1, on ink: macro shots on the anatomy of an A. `fx, fy` is the point of
  // the 80-unit glyph box held at the centre of the frame.
  const MACRO = [
    { beat: 0, font: 'playfair-display', part: 'Apex', fx: 40, fy: 21, box: 5200, rot: [-7, 3] },
    { beat: 1, font: 'abril-fatface', part: 'Serif', fx: 23, fy: 59, box: 4600, rot: [6, -2] },
    { beat: 2, font: 'bodoni-moda', part: 'Crossbar', fx: 40, fy: 47, box: 4200, rot: [-4, 5] },
    { beat: 3, font: 'playfair-display', part: 'Counter', fx: 40, fy: 40, box: 5600, rot: [12, 0] },
  ];
  const INVERT_BEAT = 4;

  // Bar 2, on paper: each new face is set in ink while the previous ones stay
  // behind as hairlines, accelerating; then the layers clear and Playfair lands.
  const LAYERS = [
    { beat: 4, font: 'playfair-display' },
    { beat: 4.5, font: 'bebas-neue' },
    { beat: 5, font: 'great-vibes' },
    { beat: 5.5, font: 'press-start-2p' },
    { beat: 6, font: 'unifrakturmaguntia' },
    { beat: 6.25, font: 'abril-fatface' },
    { beat: 6.5, font: 'space-mono' },
    { beat: 6.75, font: 'pacifico' },
    { beat: 7, font: 'roboto-slab' },
    { beat: 7.25, font: 'libre-franklin' },
  ];
  const CLEAR = 7.5;
  const LAND = 7.75;

  // Into the real app: the sorted map lands on the app's own map, framed as a
  // window, then a few features in quick cuts. Screens come from scripts/capture-app.mjs.
  const APP = {
    enter: 20,
    ui: 20.6,
    features: [
      { beat: 21, caption: 'Search by style.', click: 'search', at: 21.35, shot: '02-search', type: 'script' },
      { beat: 22.5, caption: 'Click any font.', click: 'pick', at: 22.95, shot: '03-font', from: '01-map' },
      { beat: 24, caption: 'Type any glyph.', key: '&', at: 24.45, shot: '04-glyph' },
      { beat: 25.5, caption: 'Go dark.', click: 'dark', at: 25.95, shot: '05-dark' },
    ],
    out: 27,
  };

  // End card: the wordmark is drawn in outline, then inked.
  const INK_BEAT = 29.5;

  // Player chapters, in beats.
  const CHAPTERS = [
    { beat: 0, name: 'Anatomy of a letter' },
    { beat: 4, name: 'Layers' },
    { beat: 8, name: '1,465 faces' },
    { beat: 12, name: 'Every face, in its place' },
    { beat: 20, name: 'Into the app' },
    { beat: 21, name: 'Search' },
    { beat: 22.5, name: 'Select' },
    { beat: 24, name: 'Any glyph' },
    { beat: 25.5, name: 'Dark mode' },
    { beat: 28, name: 'Ink' },
  ];

  const SCENES = {
    intro: [0, 8],
    chaos: [8, 12],
    order: [12, 20],
    app: [20, 28],
    logo: [28, 32],
  };

  window.TIMELINE = { BPM, BEAT, BARS, DURATION, MACRO, INVERT_BEAT, LAYERS, CLEAR, LAND, APP, INK_BEAT, CHAPTERS, SCENES };
})();

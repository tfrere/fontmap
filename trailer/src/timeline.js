// Shared clock for picture and sound: 128 BPM, 10 bars of 4/4 (18.75 s).
(function () {
  const BPM = 128;
  const BEAT = 60 / BPM;
  const BARS = 10;
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

  // Bars 3-5, a sea of type: the camera pulls back from the A into 1,465 A's rolling
  // like water under a slow swell, then the tide goes out in one long move and
  // leaves the map as islands, landing on the downbeat of bar 5.
  const SEA = {
    pull: 3,
    caption: 9.5,
    tide: 13,
    spread: 0.4,
    travel: 3,
    land: 16,
    charted: 16,
  };

  // Into the real app: the sorted map lands on the app's own map, framed as a
  // window, then one feature every couple of beats. Screens come from scripts/capture-app.mjs.
  const APP = {
    enter: 22,
    ui: 22.6,
    features: [
      { beat: 23.5, caption: 'Search by style.', click: 'search', at: 24, shot: '02-search', type: 'script' },
      { beat: 26, caption: 'Click any font.', click: 'pick', at: 26.5, shot: '03-font', from: '01-map' },
      { beat: 28, caption: 'Walk to its neighbours.', keys: [{ key: '→', at: 28.5, shot: '03b-nav' }, { key: '↓', at: 29.25, shot: '03c-nav' }] },
      { beat: 30, caption: 'Type any glyph.', key: '&', at: 30.5, shot: '04-glyph' },
      { beat: 32, caption: 'Go dark.', click: 'dark', at: 32.5, shot: '05-dark' },
    ],
    out: 34.75,
  };

  // End card: the wordmark is drawn in outline, then inked.
  const INK_BEAT = 37.5;

  // Player chapters, in beats.
  const CHAPTERS = [
    { beat: 0, name: 'Anatomy of a letter' },
    { beat: 4, name: 'Layers' },
    { beat: 8, name: 'A sea of type' },
    { beat: 13, name: 'Like finds like' },
    { beat: 22, name: 'Into the app' },
    { beat: 23.5, name: 'Search' },
    { beat: 26, name: 'Select' },
    { beat: 28, name: 'Navigate' },
    { beat: 30, name: 'Any glyph' },
    { beat: 32, name: 'Dark mode' },
    { beat: 36, name: 'Ink' },
  ];

  const SCENES = {
    intro: [0, 8],
    sea: [8, 22],
    app: [22, 36],
    logo: [36, 40],
  };

  window.TIMELINE = { BPM, BEAT, BARS, DURATION, MACRO, INVERT_BEAT, LAYERS, CLEAR, LAND, SEA, APP, INK_BEAT, CHAPTERS, SCENES };
})();

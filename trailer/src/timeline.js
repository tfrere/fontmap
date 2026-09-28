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
    { beat: 7.125, font: 'monoton' },
    { beat: 7.25, font: 'stardos-stencil' },
    { beat: 7.375, font: 'libre-franklin' },
  ];
  const CLEAR = 7.5;
  const LAND = 7.75;

  // Search by style: each name is typed in a face of that style; the camera
  // flies to its region, which lights up. The regions run right to left.
  const SEARCHES = [
    { beat: 20, query: 'Serif', tag: 'Serif/', family: 'Playfair Display', zoom: 1.6 },
    { beat: 22, query: 'Script', tag: 'Script/', family: 'Great Vibes', zoom: 1.7 },
    { beat: 24, query: 'Pixel', tag: 'Theme/Pixel', family: 'Press Start 2P', zoom: 3 },
  ];

  // One keystroke redraws the whole map with another glyph, in a single wave.
  const GLYPH = { char: '&', key: 26.5, sweep: [26.6, 27.4] };

  // End card: the wordmark is drawn in outline, then inked.
  const INK_BEAT = 29.5;

  // Player chapters, in beats.
  const CHAPTERS = [
    { beat: 0, name: 'Anatomy of a letter' },
    { beat: 4, name: 'Layers' },
    { beat: 8, name: '1,465 faces' },
    { beat: 12, name: 'Every face, in its place' },
    { beat: 20, name: 'Search by style' },
    { beat: 26, name: 'Any glyph' },
    { beat: 28, name: 'Ink' },
  ];

  const SCENES = {
    intro: [0, 8],
    chaos: [8, 12],
    order: [12, 20],
    search: [20, 26],
    glyph: [26, 28],
    logo: [28, 32],
  };

  window.TIMELINE = { BPM, BEAT, BARS, DURATION, MACRO, INVERT_BEAT, LAYERS, CLEAR, LAND, SEARCHES, GLYPH, INK_BEAT, CHAPTERS, SCENES };
})();

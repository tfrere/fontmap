# FontMap — typographic trailer

19-second black and white trailer for [FontMap](https://github.com/tfrere/fontmap), written in plain JavaScript on a single canvas. Every frame is a pure function of time (`draw(ctx, t)`), so the preview, scrubbing and the final render always match. Picture and sound share one clock: 128 BPM, 10 bars of 4/4 (18.75 s).

Live: https://tfrere-font-map.static.hf.space/trailer/index.html

| Bar | Beats | Chapter | Shot |
|---|---|---|---|
| 1 | 0–4 | Anatomy of a letter | Macro shots on the outline of an A with its points, handles and vertical metrics (Apex, Serif, Crossbar, Counter), then a pull back |
| 2 | 4–8 | Layers | Inversion to paper. Each new face is set in ink while the previous ones linger as hairlines, accelerating; the layers clear and Playfair lands |
| 3–4 | 8–13 | A sea of type | Slow pull back from the Playfair A into all 1,465 glyphs, a sea filling the frame with a running count; a swell rolls through it once a bar — *A sea of type.* |
| 4–6 | 13–22 | Now, charted | The tide goes out in one long move and leaves the map as islands, landing on the downbeat of bar 5 — *Now, charted.* No camera move |
| 6 | 22–23.5 | Into the app | Every glyph slides to where the real app draws it; the app appears around the map, framed as a window |
| 7–9 | 23.5–36 | Search · Select · Navigate · Any glyph · Dark mode | One feature every two beats in the live app, with a cursor or a key: *Search by style.*, *Click any font.*, *Walk to its neighbours.* (arrow keys), *Type any glyph.*, *Go dark.* The dark app grows to fill the frame |
| 10 | 36–40 | Ink | The wordmark is drawn in outline on its metrics, then inked — *An ode to type.* |

The map positions, neighbours, style tags and glyph outlines come from the FontMap repo (`public/data`). The app screens and the on-screen position of every glyph in the app are captured from the live site by `scripts/capture-app.mjs` into `assets/app.js`.

## Sound

Typewriter keys, space bar, margin bell and carriage return are real recordings, cut by `scripts/build-sounds.mjs` into `assets/sounds.js`. All are CC0:

- [BigSoundBank #1065](https://bigsoundbank.com/typewriter-s1065.html) — keystrokes
- [Freesound 652588](https://freesound.org/people/VishwaJay/sounds/652588/) and [785412](https://freesound.org/people/bubblegump1977/sounds/785412/) — single keystrokes
- [Freesound 345955](https://freesound.org/people/knufds/sounds/345955/) — margin bell
- [Freesound 318686](https://freesound.org/people/ramsamba/sounds/318686/) — carriage return

Impacts, thuds, drone, risers and plucks are synthesised with the Web Audio API in `src/score.js`. The typing plays the rhythm section: keys on the eighths, ghost notes in between, the space bar on the backbeat.

## Usage

Requires Node 18+, Google Chrome and ffmpeg.

```bash
npm install
node scripts/fetch-fonts.mjs                 # Google Fonts woff2 -> assets/fonts
node scripts/build-data.mjs                  # ../public/data -> assets/data.js
node scripts/build-logo.mjs                  # assets/ttf -> assets/logo.js (end-card wordmark outlines)
node scripts/capture-app.mjs                 # live app -> assets/app.js (screens + glyph positions)
node scripts/build-sounds.mjs                # assets/sounds/src -> assets/sounds.js (needs the source recordings, not committed)
```

`assets/data.js` and `assets/sounds.js` are already built, so the steps above are only needed to regenerate them.

Preview: `python3 scripts/serve.py 8765` (a static server that disables caching) and open `http://localhost:8765/index.html`. The player has a chaptered timeline (hover for the chapter name, click or drag to scrub), a chapter/timecode overlay and a link to the rendered MP4.

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Back / forward one beat (Shift: one bar) |
| , / . | Back / forward one frame |
| p / n | Previous / next chapter |
| o | Chapter and timecode overlay |
| m | Mute |

`?t=7.5` opens at a given time, `?hud` opens with the overlay on. Frame 0 is black on purpose (fade-in).

Render:

```bash
node scripts/render.mjs contact           # out/contact-sheet.png, one frame per beat
node scripts/render.mjs stills 3,7.2      # full-size stills
node scripts/render.mjs audio             # out/score.wav
node scripts/render.mjs video 6           # out/fontmap-trailer.mp4, 60 fps, 6-sample motion blur
```

Set `CHROME=/path/to/chrome` if Chrome is not at `/usr/local/bin/google-chrome`.

## Files

- `src/timeline.js` — tempo, scene boundaries, fonts, features and copy
- `src/scene.js` — the picture
- `src/score.js` — the soundtrack
- `src/player.js` — preview player and headless render hooks

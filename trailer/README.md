# FontMap — typographic trailer

17-second black and white trailer for [FontMap](https://github.com/tfrere/fontmap), written in plain JavaScript on a single canvas. Every frame is a pure function of time (`draw(ctx, t)`), so the preview, scrubbing and the final render always match. Picture and sound share one clock: 128 BPM, 9 bars of 4/4 (16.875 s).

| Bar | Beats | Shot |
|---|---|---|
| 1 | 0–4 | Anatomy of a letter: macro shots on the outline of an A with its points, handles and vertical metrics (Apex, Serif, Crossbar, Counter), then a pull back |
| 2 | 4–8 | Inversion to paper. Each new face is set in ink while the previous ones linger as hairlines, accelerating; the layers clear and Playfair lands |
| 3 | 8–12 | Pull back from the Playfair A to all 1,465 glyphs in disorder — *1,465 faces.* |
| 4–5 | 12–20 | Every glyph flies to its real FontMap position — *Every face, in its place.* |
| 6–7 | 20–28 | Features: 01 Search (a style lights up its region), 02 Select, 03 Arrow keys, 04 Dark mode |
| 8 | 28–32 | 05 Any glyph: the whole map redraws as F, O, N, T, M, A, P |
| 9 | 32–36 | FontMap — *An ode to type.* |

The map positions, neighbours, style tags and glyph outlines come from the FontMap repo (`public/data`).

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
node scripts/build-sounds.mjs                # assets/sounds/src -> assets/sounds.js (needs the source recordings, not committed)
```

`assets/data.js` and `assets/sounds.js` are already built, so the steps above are only needed to regenerate them.

Preview: `python3 scripts/serve.py 8765` (a static server that disables caching) and open `http://localhost:8765/trailer.html`. The player has a chaptered timeline (hover for the chapter name, click or drag to scrub), a chapter/timecode overlay and a link to the rendered MP4.

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

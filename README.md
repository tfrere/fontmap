---
title: FontMap
short_description: Visual font explorer powered by FontCLIP
emoji: 🗺️
colorFrom: indigo
colorTo: blue
sdk: static
pinned: false
app_file: "build/index.html"
---

# FontMap

An interactive map of 1,465 Google Fonts organized by visual similarity, using [FontCLIP](https://github.com/yukistavailable/FontCLIP) embeddings blended with Google Fonts style tags and measured proportions, laid out with t-SNE.

Inspired by [IDEO's Font Map](https://medium.com/ideo-stories/organizing-the-world-of-fonts-with-ai-7d9e49ff2b25) (2017, Kevin Ho), a different take on the same idea, fully open source.

**[Live demo](https://huggingface.co/spaces/tfrere/font-map)**

[![FontMap demo](https://raw.githubusercontent.com/tfrere/fontmap/main/media/demo.gif)](https://huggingface.co/spaces/tfrere/font-map)

## Features

- **Visual similarity map** - fonts that look alike are physically close together
- **1,465 Google Fonts** - full catalog; fonts that ship the same Latin glyphs (e.g. Noto script variants, Battambang = Roboto Slab) and Playwrite "Guides" variants are folded into one point and stay searchable by name
- **Click any font** - see details + 4 nearest visual neighbors
- **Filter by category** - sans-serif, serif, handwriting, monospace, decorative, blackletter (Google's Display fonts are filed by their structure, see step 6)
- **Category colors** - toggle color coding to see how clusters map to official categories
- **Search** - find any font by name or Google Fonts style tag
- **Zoom & pan** - explore the full map with smooth D3.js navigation
- **How it works** - an illustrated walkthrough of the pipeline (`#/how-it-works`)

## How it works

```
Latin glyphs -> FontCLIP (512D) -+
Google style tags (predicted) ---+-> t-SNE (2D) -> overlap removal -> map
fontTools proportions -----------+        |
                                          +-> k-NN (similar fonts)
```

1. **Embed** - each family's Latin glyphs are rendered and encoded by [FontCLIP](https://github.com/yukistavailable/FontCLIP) (CLIP ViT-B/32 fine-tuned for typography) into a 512-D vector
2. **Merge** - fonts with identical Latin renders (e.g. Noto script variants, Battambang = Roboto Slab) and every Playwrite `<base>-guides` font are folded into one entry that lists the others as `aliases`. Icon/barcode/placeholder fonts (Material Symbols, Libre Barcode, Flow, Redacted, Linefont, Wavefont) and the Yarndings knitting dingbats are excluded
3. **Style** - a logistic regression predicts each font's Google Fonts sub-style (Sans/Humanist, Serif/Didone, Script/Formal, Blackletter, Pixel, Stencil...) from its embedding; the probabilities are blended in so same-style fonts group together (untagged fonts are placed from the prediction)
4. **Proportions** - glyph width, x-height, cap height, monospace and italic angle measured with fontTools are added so condensed and extended fonts find each other
5. **Layout** - t-SNE projects the combined space to 2D, then a small overlap-removal pass spreads glyphs apart. "Similar fonts" are the nearest neighbours in that same space. On held-out families, the share of a font's 8 nearest neighbours sharing its Google sub-style went from ~0.31 (previous map) to ~0.44
6. **Visualize** - React + D3.js renders glyphs from per-character SVG sprites (type a letter, digit or `&` on desktop to switch). Colors use the Google Fonts category, with a few manual fixes where Google files a family by its non-Latin script. Google's usage-based Display category is replaced by structure: Display fonts go to sans-serif / serif (incl. slab) / handwriting / monospace from their dominant style tag, strongly Wacky-tagged (score >= 70) and other themed designs become decorative, and any Blackletter-tagged font becomes blackletter. About 30 Display fonts the tags misfile are set by hand after a visual review (Google's original category is kept as `google_category`)

## Getting started

### Run locally

```bash
git clone https://github.com/tfrere/fontmap.git
cd fontmap
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
```

### Deploy to Hugging Face Spaces

Every push to `main` triggers a GitHub Actions workflow (`.github/workflows/deploy.yml`) that runs `CI=false npm run build` and pushes `build/` + this README to the Space ([HF Spaces static SDK](https://huggingface.co/docs/hub/spaces-sdks-static), `app_file: build/index.html`).

## Regenerating the map

The data pipeline lives in [`pipeline/`](pipeline/). See its [README](pipeline/README.md) for the full chain (fonts -> renders -> FontCLIP embeddings -> metrics -> map) and setup.

`build_typography_data.py` reads the precomputed FontCLIP embeddings (`pipeline/output/data/embeddings_fontclip.npz`) and writes `public/data/typography_data.json`. Run from the repo root:

```bash
pipeline/.venv/bin/python pipeline/build_typography_data.py
node scripts/apply-overlap-removal.mjs --input public/data/typography_data.json --radius 13
```

Don't run bare `npm run overlap`: it defaults to `public/data/font-map.json`, which the app loads before `typography_data.json`.

Then rebuild the glyph sprite for the fonts now on the map (reads `typography_data.json` and the font files in `pipeline/output/fonts/`):

```bash
npm run sprite                    # "A" -> public/data/font-sprite.svg (ids <font-id>_a)
npm run sprite -- --char g        # -> public/data/sprites/font-sprite-lower-g.svg (ids <font-id>_lower-g)
npm run sprite -- --chars a-z,A-Z # upper-<c>, digit-<d>, u<HEX4> for other chars
```

The downloaded fonts, renders, embeddings and font index (`pipeline/input/`, `pipeline/output/`) are not checked in.

## Project structure

```
fontmap/
├── public/
│   └── data/
│       ├── sentences/            # Sentence preview SVGs
│       ├── sprites/              # One glyph sprite per character + index.json
│       ├── font-sprite.svg       # All "A" glyphs in a single sprite (~1 MB, ~300 KB gzip)
│       └── typography_data.json  # Font positions + metadata
├── src/
│   ├── components/FontMap/       # The map app (components, hooks, styles, utils)
│   ├── hooks/                    # Shared hooks (data and sprite loading)
│   ├── store/                    # Zustand state management
│   └── utils/                    # Glyph sprite loading
├── scripts/                      # Overlap removal + glyph sprite builder (Node)
├── pipeline/                     # Python data pipeline: FontCLIP, style tags, t-SNE
│   └── experiments/              # Evaluation and model-comparison scripts
└── package.json
```

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, D3.js v7, Zustand |
| Rendering | SVG sprite + D3 zoom/pan |
| Embeddings | FontCLIP (CLIP ViT-B/32 fine-tuned for typography) |
| Layout | Logistic regression (style tags) + t-SNE via scikit-learn, font metrics via fontTools |
| Hosting | Hugging Face Spaces (static SDK) |

## Credits

- **[FontCLIP](https://github.com/yukistavailable/FontCLIP)** - Typography-aware CLIP model by Tatsukawa et al. (Eurographics 2024)
- **[IDEO Font Map](https://medium.com/ideo-stories/organizing-the-world-of-fonts-with-ai-7d9e49ff2b25)** - Original inspiration by Kevin Ho (2017)
- **[Google Fonts](https://fonts.google.com)** - Font catalog
- **[fontTools](https://github.com/fonttools/fonttools)** - Font metrics

## License

MIT

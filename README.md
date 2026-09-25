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

An interactive map of 1,649 Google Fonts organized by visual similarity, using [FontCLIP](https://github.com/yukistavailable/FontCLIP) embeddings and UMAP dimensionality reduction.

Inspired by [IDEO's Font Map](https://medium.com/ideo-stories/organizing-the-world-of-fonts-with-ai-7d9e49ff2b25) (2017, Kevin Ho), a different take on the same idea, fully open source.

**[Live demo](https://huggingface.co/spaces/tfrere/font-map)**

[![FontMap demo](https://raw.githubusercontent.com/tfrere/fontmap/main/media/demo.gif)](https://huggingface.co/spaces/tfrere/font-map)

## Features

- **Visual similarity map** — fonts that look alike are physically close together
- **1,649 Google Fonts** — full catalog; variants that render identically to their base font (e.g. Noto script variants, SC versions) are folded into it
- **Click any font** — see details + 5 nearest visual neighbors
- **Filter by category** — serif, sans-serif, display, handwriting, monospace
- **Category colors** — toggle color coding to see how clusters map to official categories
- **Search** — find any font by name
- **Zoom & pan** — explore the full map with smooth D3.js navigation

## How it works

```
Font images ──→ FontCLIP (512D) ──→ PCA (50D) ──→ UMAP (2D) ──→ Interactive map
                                         ↓
                                    k-NN (similar fonts)
```

1. **Render** — each font is rendered as a 224×224 composite glyph image
2. **Embed** — [FontCLIP](https://github.com/yukistavailable/FontCLIP) (CLIP ViT-B/32 fine-tuned for typography) encodes each image into a 512-dimensional vector
3. **Reduce** — PCA compresses to 50D, then UMAP with spectral initialization projects to 2D (n_neighbors=12, min_dist=1.0)
4. **Merge** — every family keeps its own point; only variants whose id extends a base font's id (e.g. `noto-sans-carian`, `anton-sc`) and whose embedding is pixel-identical to it (cosine distance ≤ 5e-5) are folded into the base. Fonts with no Latin glyphs (empty placeholder specimen) are excluded
5. **Neighbors** — k-NN is computed in the original 512D space for "similar fonts" recommendations
6. **Visualize** — React + D3.js renders all glyphs from a single SVG sprite (zero individual network requests)

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

The embedding pipeline lives in `src/typography/new-pipe/python-pipeline/`. See its [README](src/typography/new-pipe/python-pipeline/README.md) for all options.

`build_typography_data.py` reads the precomputed FontCLIP embeddings (`src/typography/new-pipe/output/data/embeddings_fontclip.npz`) and writes `public/data/typography_data.json`. Run from the repo root:

```bash
src/typography/new-pipe/python-pipeline/.venv/bin/python src/typography/new-pipe/python-pipeline/build_typography_data.py
node scripts/apply-overlap-removal.mjs --input public/data/typography_data.json --radius 13
```

Don't run bare `npm run overlap`: it defaults to `public/data/font-map.json`, which the app loads before `typography_data.json`.

The embeddings npz, rendered font images and font index (`input/`, `output/`) are not checked in.

## Project structure

```
fontmap/
├── public/
│   ├── data/
│   │   ├── char/              # Individual glyph SVGs (~1,900 files)
│   │   ├── sentences/         # Sentence preview SVGs
│   │   ├── font-sprite.svg    # All glyphs in a single sprite (3 MB)
│   │   └── typography_data.json  # Font positions + metadata
│   └── debug-umap/            # Pre-computed UMAP configs for comparison
├── src/
│   ├── components/
│   │   ├── FontMap/           # Main map component (production)
│   │   ├── DebugUMAP/         # UMAP comparison tool (development)
│   │   └── FontMapV2/         # Experimental canvas renderer
│   ├── hooks/                 # Shared hooks (data loading, dark mode)
│   ├── store/                 # Zustand state management
│   └── typography/new-pipe/   # Embedding + UMAP generation pipeline
│       └── python-pipeline/   # FontCLIP + PCA + UMAP (Python)
└── package.json
```

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, D3.js v7, Zustand |
| Rendering | SVG sprite + D3 zoom/pan |
| Embeddings | FontCLIP (CLIP ViT-B/32 fine-tuned for typography) |
| Dim. reduction | PCA + UMAP (spectral init) via `umap-learn` |
| Hosting | Hugging Face Spaces (static SDK) |

## Credits

- **[FontCLIP](https://github.com/yukistavailable/FontCLIP)** — Typography-aware CLIP model by Tatsukawa et al. (Eurographics 2024)
- **[IDEO Font Map](https://medium.com/ideo-stories/organizing-the-world-of-fonts-with-ai-7d9e49ff2b25)** — Original inspiration by Kevin Ho (2017)
- **[Google Fonts](https://fonts.google.com)** — Font catalog
- **[UMAP](https://umap-learn.readthedocs.io/)** — Dimensionality reduction by Leland McInnes

## License

MIT

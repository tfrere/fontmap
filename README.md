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

An interactive map of 1,100+ Google Fonts organized by visual similarity, using [FontCLIP](https://github.com/kinit-sk/FontCLIP) embeddings and UMAP dimensionality reduction.

Inspired by [IDEO's Font Map](https://medium.com/ideo-stories/organizing-the-world-of-fonts-with-ai-7d9e49ff2b25) (2017, Kevin Ho) — rebuilt from scratch with modern ML, fully open source, and documented.

**[Live demo](https://huggingface.co/spaces/tfrere/fontmap)**

[![FontMap demo](https://raw.githubusercontent.com/tfrere/fontmap/main/media/demo.gif)](https://huggingface.co/spaces/tfrere/fontmap)

## Features

- **Visual similarity map** — fonts that look alike are physically close together
- **1,192 Google Fonts** — full catalog, family variants merged
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
2. **Embed** — [FontCLIP](https://github.com/kinit-sk/FontCLIP) (CLIP ViT-B/32 fine-tuned for typography) encodes each image into a 512-dimensional vector
3. **Reduce** — PCA compresses to 50D, then UMAP with spectral initialization projects to 2D (n_neighbors=12, min_dist=1.0)
4. **Merge** — font family variants (Regular, Bold, Italic…) are fused into a single representative point
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

The project is configured for [HF Spaces static SDK](https://huggingface.co/docs/hub/spaces-sdks-static) with a build step:

```yaml
sdk: static
app_build_command: "CI=false npm run build"
app_file: "build/index.html"
```

## Regenerating the map

The embedding pipeline lives in `src/typography/new-pipe/`. See its [README](src/typography/new-pipe/README.md) for full instructions.

**Quick summary:**

```bash
# 1. Generate FontCLIP embeddings (requires Python + GPU, ~1h one-time)
cd src/typography/new-pipe/python-pipeline
python run_fontclip.py

# 2. Test different UMAP configurations
cd ..
npm run batch-umap
npm run copy-to-debug
# Compare visually at http://localhost:3000/#/debug-umap

# 3. Deploy chosen config to production
npm run deploy fontclip-spectral
```

## Project structure

```
fontmap/
├── public/
│   ├── data/
│   │   ├── char/              # Individual glyph SVGs (~1,200 files)
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

- **[FontCLIP](https://github.com/kinit-sk/FontCLIP)** — Typography-aware CLIP model by KInIT
- **[IDEO Font Map](https://medium.com/ideo-stories/organizing-the-world-of-fonts-with-ai-7d9e49ff2b25)** — Original inspiration by Kevin Ho (2017)
- **[Google Fonts](https://fonts.google.com)** — Font catalog
- **[UMAP](https://umap-learn.readthedocs.io/)** — Dimensionality reduction by Leland McInnes

## License

MIT

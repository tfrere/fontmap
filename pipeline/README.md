# FontMap data pipeline

Node and Python scripts that turn the Google Fonts catalogue into `public/data/typography_data.json`, the file the app loads, plus the glyph sprites and sentence previews it displays.

```
font files -> renders -> FontCLIP embeddings (512D) -+
font files -> fontTools proportions -----------------+-> tag-aware space -> t-SNE -> overlap removal -> map
Google Fonts tags -> logistic regression (PCA 50) ---+                  \-> k-NN (similar fonts)
```

All commands run from the repo root. Everything under `input/`, `output/`, `fontclip_workspace/` and `.venv/` is generated or downloaded, and gitignored.

## Setup

```bash
npm install                        # Node deps of the render scripts (opentype.js, sharp)

python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt

# FontCLIP (Tatsukawa et al., Eurographics 2024): code + checkpoint
git clone https://github.com/yukistavailable/FontCLIP pipeline/fontclip_workspace/FontCLIP
# then fetch model_checkpoints/model.pt with FontCLIP's setup_data.py (see its README)

# Google Fonts metadata (family, category, weights, styles, subsets, font file URLs per font id)
curl -sL -o pipeline/input/font-index.json \
  https://raw.githubusercontent.com/fontsource/google-font-metadata/main/data/google-fonts-v2.json

# Google Fonts classification tags
curl -sL -o pipeline/input/gf-tags-families.csv \
  https://raw.githubusercontent.com/google/fonts/main/tags/all/families.csv
```

`font-index.json` is the APIv2 output of [google-font-metadata](https://github.com/fontsource/google-font-metadata) (same schema). The current map was built from a September 2025 snapshot (1,888 families); the latest file lists more families and newer font versions, so a rebuild from it gives a slightly different map.

The FontCLIP image encoder is the OpenAI CLIP ViT-B/32 with FontCLIP's fine-tuned visual weights swapped in (`fontclip_model.py`), so the OpenAI ViT-B/32 checkpoint is needed too. It is read from `~/.cache/clip/ViT-B-32.pt` (where OpenAI's `clip` package caches it); pass `--openai-weights` to use another path.

## Steps

1. **Download the fonts**: the main variant of each family (weight 400, else the first weight; normal style; default subset) in every format. Existing files are skipped, so the script can be resumed.

   ```bash
   npm run pipeline:download          # -> output/fonts/<id>/<id>-400-normal-latin.{truetype,woff,woff2}
   ```

2. **Render** each font with opentype.js into three SVGs, then rasterise the specimen with sharp:

   ```bash
   npm run pipeline:render            # -> output/svgs/, output/pngs/, output/font_manifest.json
   npm run pipeline:sentences         # copy output/svgs/*_sentence.svg -> public/data/sentences/
   ```

   | Output | Content |
   |--------|---------|
   | `output/svgs/<id>_a.svg` | 80x80 "A" glyph, used by step 5 to drop fonts without Latin glyphs (.notdef box) |
   | `output/svgs/<id>_embed.svg` | 224x224 two-line "Hamburge" / "fonstiv" specimen |
   | `output/pngs/<id>_embed.png` | The specimen rasterised at 224x224 on white, the FontCLIP input |
   | `output/svgs/<id>_sentence.svg` | "Lorem Ipsum" preview shown in the sidebar and tooltip |
   | `output/font_manifest.json` | Dimensions and font metrics of each SVG (informational, not read by later steps) |

   The render scripts accept `--output <dir>` (instead of `pipeline/output`), `--font-index <path>` and `--fonts <id,id,...>` to process a subset, e.g. `node pipeline/render/2-generate-svgs.mjs --fonts roboto,pacifico`.

3. **Measure proportions** from the font files with fontTools (a-z / A-Z width, x-height, cap height, monospace, italic angle):

   ```bash
   pipeline/.venv/bin/python pipeline/compute_font_metrics.py          # -> output/data/font_metrics.json
   ```

4. **Embed** each `_embed.png` specimen with FontCLIP (L2-normalised 512D vectors):

   ```bash
   pipeline/.venv/bin/python pipeline/compute_fontclip_embeddings.py   # -> output/data/embeddings_fontclip.npz
   ```

5. **Build the map**: drop .notdef and non-text fonts, fold identical Latin renders and Playwrite Guides into one entry, then blend the embeddings (weight 0.5) with the square-rooted probabilities of a logistic regression trained on PCA(50) + proportions to predict each font's dominant Google Fonts tag (weight 0.5) and the z-scored proportions (weight 0.2). The blended space is laid out with t-SNE (perplexity 15) and "similar fonts" are its 8 nearest neighbours. Also assigns the structural categories and search tags.

   ```bash
   pipeline/.venv/bin/python pipeline/build_typography_data.py         # -> public/data/typography_data.json
   ```

6. **Remove overlaps** so glyphs don't sit on top of each other (neighbours are unchanged):

   ```bash
   node scripts/apply-overlap-removal.mjs --input public/data/typography_data.json --radius 13
   ```

7. **Rebuild the glyph sprites** for the fonts on the map (reads `output/fonts/`):

   ```bash
   npm run sprite                     # "A" -> public/data/font-sprite.svg
   npm run sprite -- --chars a-z,A-Z  # other characters -> public/data/sprites/
   ```

8. **Refresh the search tags** (optional): step 5 already writes them. When only the Google Fonts tags changed, this rewrites the `tags` field of `public/data/typography_data.json` in place, without re-running t-SNE and the overlap removal:

   ```bash
   pipeline/.venv/bin/python pipeline/add_search_tags.py
   ```

## Files

| File | Role |
|------|------|
| `render/1-download-fonts.mjs` | Step 1 |
| `render/2-generate-svgs.mjs` | Step 2 (SVGs + manifest) |
| `render/3-generate-pngs.mjs` | Step 2 (PNGs) |
| `render/cli.mjs` | Command-line options shared by the render scripts |
| `compute_font_metrics.py` | Step 3 |
| `compute_fontclip_embeddings.py` | Step 4 |
| `build_typography_data.py` | Step 5 (`--help` lists every parameter; `--layout umap --tag-blend 0` reproduces the older UMAP map) |
| `add_search_tags.py` | Step 8 |
| `fontclip_model.py` | Loads the FontCLIP image encoder |
| `evaluate_with_gf_tags.py` | Google Fonts tag loading (used by step 5) and scoring of embeddings / maps against the tags |
| `generate_embeddings_and_umap.py` | PCA + UMAP and k-NN helpers (used by step 5), plus the legacy CLIP + UMAP CLI |
| `experiments/` | One-off studies behind the current choices, see below |

### Experiments

Run them like the other scripts (`pipeline/.venv/bin/python pipeline/experiments/<script>.py`); their outputs go to `output/data/`.

| Script | Purpose |
|--------|---------|
| `compute_clip_embeddings.py` | Vanilla CLIP ViT-B/32 embeddings of the same specimens, as a baseline |
| `build_variant_map.py` | Map with the same font set from another embedding model (`output/data/typography_data_clip.json`) |
| `compare_embedding_models.py` | Compare two maps: k-NN category agreement, trustworthiness, k-NN overlap |
| `render_specimens.py` | Fixed-scale specimens (one or several per font) to test rendering choices |
| `evaluate_supervised_projection.py` | Held-out test of an NCA metric learned from the tags, blended with the embeddings |

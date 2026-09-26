# FontMap data pipeline

Python scripts that turn the Google Fonts catalogue into `public/data/typography_data.json`, the file the app loads.

```
font files -> renders -> FontCLIP embeddings (512D) -+
font files -> fontTools proportions -----------------+-> tag-aware space -> t-SNE -> overlap removal -> map
Google Fonts tags -> logistic regression (PCA 50) ---+                  \-> k-NN (similar fonts)
```

All commands run from the repo root. Everything under `input/`, `output/`, `fontclip_workspace/` and `.venv/` is generated or downloaded, and gitignored.

## Setup

```bash
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt

# FontCLIP (Tatsukawa et al., Eurographics 2024): code + checkpoint
git clone https://github.com/yukistavailable/FontCLIP pipeline/fontclip_workspace/FontCLIP
# then fetch model_checkpoints/model.pt with FontCLIP's setup_data.py (see its README)

# Google Fonts classification tags
curl -sL -o pipeline/input/gf-tags-families.csv \
  https://raw.githubusercontent.com/google/fonts/main/tags/all/families.csv
```

The FontCLIP image encoder is the OpenAI CLIP ViT-B/32 with FontCLIP's fine-tuned visual weights swapped in (`fontclip_model.py`), so the OpenAI ViT-B/32 checkpoint is needed too. It is read from `~/.cache/clip/ViT-B-32.pt` (where OpenAI's `clip` package caches it); pass `--openai-weights` to use another path.

## Inputs

The steps below expect these files, produced by the original Node scripts (download fonts, render SVGs, rasterise PNGs). Those scripts were removed from the tree in commit `b306fd0`; recover them with e.g. `git show b306fd0^:src/typography/new-pipe/1-download-font.mjs`.

| Path | Content |
|------|---------|
| `input/font-index.json` | Google Fonts metadata per font id (family, category, weights, styles, subsets) |
| `output/fonts/<id>/*.truetype` | Font files |
| `output/svgs/<id>_a.svg` | Rendered "a" glyph, used to drop fonts without Latin glyphs (.notdef box) |
| `output/svgs/<id>_sentence.svg` | Sentence preview, copied to `public/data/sentences/` |
| `output/pngs/<id>_embed.png` | Multi-glyph specimen fed to FontCLIP |

## Steps

1. **Embed** each `_embed.png` specimen with FontCLIP (L2-normalised 512D vectors):

   ```bash
   pipeline/.venv/bin/python pipeline/compute_fontclip_embeddings.py   # -> output/data/embeddings_fontclip.npz
   ```

2. **Measure proportions** from the font files with fontTools (a-z / A-Z width, x-height, cap height, monospace, italic angle):

   ```bash
   pipeline/.venv/bin/python pipeline/compute_font_metrics.py          # -> output/data/font_metrics.json
   ```

3. **Build the map**: drop .notdef and non-text fonts, fold identical Latin renders and Playwrite Guides into one entry, then blend the embeddings (weight 0.5) with the square-rooted probabilities of a logistic regression trained on PCA(50) + proportions to predict each font's dominant Google Fonts tag (weight 0.5) and the z-scored proportions (weight 0.2). The blended space is laid out with t-SNE (perplexity 15) and "similar fonts" are its 8 nearest neighbours. Also assigns the structural categories and search tags.

   ```bash
   pipeline/.venv/bin/python pipeline/build_typography_data.py         # -> public/data/typography_data.json
   ```

4. **Remove overlaps** so glyphs don't sit on top of each other (neighbours are unchanged):

   ```bash
   node scripts/apply-overlap-removal.mjs --input public/data/typography_data.json --radius 13
   ```

5. **Rebuild the glyph sprites** for the fonts on the map (reads `output/fonts/`):

   ```bash
   npm run sprite                     # "A" -> public/data/font-sprite.svg
   npm run sprite -- --chars a-z,A-Z  # other characters -> public/data/sprites/
   ```

When only the Google Fonts tags changed, `add_search_tags.py` rewrites the `tags` field of `public/data/typography_data.json` in place, without re-running t-SNE and the overlap removal.

## Files

| File | Role |
|------|------|
| `compute_fontclip_embeddings.py` | Step 1 |
| `compute_font_metrics.py` | Step 2 |
| `build_typography_data.py` | Step 3 (`--help` lists every parameter; `--layout umap --tag-blend 0` reproduces the older UMAP map) |
| `add_search_tags.py` | Refresh search tags in place |
| `fontclip_model.py` | Loads the FontCLIP image encoder |
| `evaluate_with_gf_tags.py` | Google Fonts tag loading (used by step 3) and scoring of embeddings / maps against the tags |
| `generate_embeddings_and_umap.py` | PCA + UMAP and k-NN helpers (used by step 3), plus the legacy CLIP + UMAP CLI |
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

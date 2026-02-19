#!/usr/bin/env python3
"""
FontMap Enhanced Pipeline — Python alternative for steps 4+5.

Uses FontCLIP (fine-tuned CLIP for typography) with proper UMAP (spectral init)
for higher quality font embeddings and dimensionality reduction.

Usage:
  pip install -r requirements.txt
  python generate_embeddings_and_umap.py --pngs-dir ../output/pngs --output-dir ../output/data

Falls back to standard CLIP ViT-B/32 if FontCLIP weights are not available.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sklearn.decomposition import PCA
from sklearn.metrics.pairwise import cosine_distances
from sklearn.neighbors import NearestNeighbors
from tqdm import tqdm

# ---------------------------------------------------------------------------
# 1. Embedding generation
# ---------------------------------------------------------------------------

def load_clip_model(use_fontclip: bool = False, device: str = "cpu"):
    """Load CLIP or FontCLIP model + preprocessing."""
    import open_clip

    model_name = "ViT-B-32"
    pretrained = "openai"

    if use_fontclip:
        fontclip_weights = Path(__file__).parent / "weights" / "fontclip_vit_b32.pt"
        if fontclip_weights.exists():
            print(f"✅ Loading FontCLIP weights from {fontclip_weights}")
            model, _, preprocess = open_clip.create_model_and_transforms(
                model_name, pretrained=pretrained, device=device
            )
            state = torch.load(fontclip_weights, map_location=device, weights_only=True)
            model.load_state_dict(state, strict=False)
            model.eval()
            return model, preprocess, "fontclip_vit_b32"
        else:
            print(f"⚠️  FontCLIP weights not found at {fontclip_weights}")
            print("   Download from: https://github.com/yukistavailable/FontCLIP")
            print("   Falling back to standard CLIP ViT-B/32\n")

    print("🔄 Loading CLIP ViT-B/32 (openai)...")
    model, _, preprocess = open_clip.create_model_and_transforms(
        model_name, pretrained=pretrained, device=device
    )
    model.eval()
    return model, preprocess, "clip_vit_b32_openai"


def generate_embeddings(pngs_dir: Path, model, preprocess, device: str = "cpu"):
    """Generate CLIP embeddings for all PNG files."""
    png_files = sorted(pngs_dir.glob("*_embed.png"))

    if not png_files:
        png_files = sorted(pngs_dir.glob("*_a.png"))
        print(f"⚠️  No _embed.png found, falling back to _a.png ({len(png_files)} files)")
    else:
        print(f"📁 Found {len(png_files)} multi-glyph embed PNGs")

    font_ids = []
    embeddings = []

    for png_path in tqdm(png_files, desc="Generating embeddings"):
        font_id = png_path.stem.replace("_embed", "").replace("_a", "")
        font_ids.append(font_id)

        image = preprocess(Image.open(png_path).convert("RGB")).unsqueeze(0).to(device)

        with torch.no_grad():
            feat = model.encode_image(image)
            feat = feat / feat.norm(dim=-1, keepdim=True)

        embeddings.append(feat.cpu().numpy().squeeze())

    embeddings = np.array(embeddings, dtype=np.float32)
    print(f"✅ Generated {len(embeddings)} embeddings ({embeddings.shape[1]}D)")
    return font_ids, embeddings


# ---------------------------------------------------------------------------
# 2. PCA + UMAP
# ---------------------------------------------------------------------------

def reduce_dimensions(
    embeddings: np.ndarray,
    pca_components: int = 50,
    umap_neighbors: int = 15,
    umap_min_dist: float = 0.3,
    random_state: int = 42,
):
    """PCA → UMAP with spectral initialization (Python UMAP advantage)."""
    import umap

    print(f"\n🔄 PCA: {embeddings.shape[1]}D → {pca_components}D")
    pca = PCA(n_components=pca_components, random_state=random_state)
    pca_result = pca.fit_transform(embeddings)
    variance_ratio = pca.explained_variance_ratio_.sum() * 100
    print(f"   📐 Variance conservée: {variance_ratio:.1f}%")

    print(f"🔄 UMAP: {pca_components}D → 2D (n_neighbors={umap_neighbors}, min_dist={umap_min_dist})")
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=umap_neighbors,
        min_dist=umap_min_dist,
        metric="cosine",
        init="spectral",
        random_state=random_state,
        verbose=True,
    )
    coords_2d = reducer.fit_transform(pca_result)
    print(f"   ✅ UMAP projection complete")

    return pca_result, coords_2d


# ---------------------------------------------------------------------------
# 3. k-NN in high-dimensional space
# ---------------------------------------------------------------------------

def compute_knn(embeddings: np.ndarray, k: int = 8):
    """Compute k-nearest neighbors using cosine distance on original embeddings."""
    print(f"\n🔍 Computing k-NN (k={k}) in {embeddings.shape[1]}D space...")
    nn = NearestNeighbors(n_neighbors=k + 1, metric="cosine", algorithm="brute")
    nn.fit(embeddings)
    distances, indices = nn.kneighbors(embeddings)
    # Skip self (index 0)
    return indices[:, 1:], distances[:, 1:]


# ---------------------------------------------------------------------------
# 4. Output
# ---------------------------------------------------------------------------

def build_output(
    font_ids: list,
    coords_2d: np.ndarray,
    knn_indices: np.ndarray,
    font_index_path: Path | None,
    model_name: str,
    pca_components: int,
    umap_neighbors: int,
    umap_min_dist: float,
    knn_k: int,
):
    """Build the output JSON matching the existing typography_data.json format."""
    font_index = {}
    if font_index_path and font_index_path.exists():
        with open(font_index_path) as f:
            font_index = json.load(f)

    fonts = []
    for i, font_id in enumerate(font_ids):
        entry = {
            "id": font_id,
            "name": font_id,
            "imageName": font_id,
            "family": "sans-serif",
            "x": float(coords_2d[i, 0]),
            "y": float(coords_2d[i, 1]),
            "neighbors": [font_ids[j] for j in knn_indices[i]],
        }

        if font_id in font_index:
            meta = font_index[font_id]
            entry["name"] = font_id
            entry["family"] = meta.get("category", "sans-serif")
            family_name = meta.get("family", font_id)
            entry["google_fonts_url"] = (
                f"https://fonts.google.com/specimen/{family_name.replace(' ', '+')}"
            )
            entry["weights"] = meta.get("weights", [])
            entry["styles"] = meta.get("styles", [])
            entry["subsets"] = meta.get("subsets", [])

        fonts.append(entry)

    return {
        "config": {
            "nNeighbors": umap_neighbors,
            "minDist": umap_min_dist,
            "metric": "cosine",
            "enableFontFusion": False,
            "testName": f"python-{model_name}",
            "randomSeed": 42,
        },
        "metadata": {
            "method": f"umap_from_{model_name}_python",
            "pca_components": pca_components,
            "knn_neighbors": knn_k,
            "umap_init": "spectral",
            "total_fonts": len(fonts),
            "note": "Python pipeline with spectral UMAP init and high-dim k-NN",
        },
        "fonts": fonts,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="FontMap Python pipeline")
    parser.add_argument("--pngs-dir", type=Path, required=True, help="Directory with PNG files")
    parser.add_argument("--output-dir", type=Path, required=True, help="Output directory")
    parser.add_argument("--font-index", type=Path, default=None, help="font-index.json path")
    parser.add_argument("--fontclip", action="store_true", help="Use FontCLIP weights if available")
    parser.add_argument("--pca", type=int, default=50, help="PCA components (default: 50)")
    parser.add_argument("--umap-neighbors", type=int, default=15, help="UMAP n_neighbors")
    parser.add_argument("--umap-min-dist", type=float, default=0.3, help="UMAP min_dist")
    parser.add_argument("--knn-k", type=int, default=8, help="k for k-NN")
    parser.add_argument("--device", type=str, default="cpu", help="Device (cpu, cuda, mps)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    device = args.device
    if device == "mps" and not torch.backends.mps.is_available():
        print("⚠️  MPS not available, falling back to CPU")
        device = "cpu"
    elif device == "cuda" and not torch.cuda.is_available():
        print("⚠️  CUDA not available, falling back to CPU")
        device = "cpu"

    model, preprocess, model_name = load_clip_model(use_fontclip=args.fontclip, device=device)
    font_ids, embeddings = generate_embeddings(args.pngs_dir, model, preprocess, device)

    if len(font_ids) == 0:
        print("❌ No fonts processed")
        sys.exit(1)

    # Save raw embeddings
    emb_path = args.output_dir / "embeddings_python.npz"
    np.savez_compressed(emb_path, font_ids=font_ids, embeddings=embeddings)
    print(f"💾 Saved embeddings to {emb_path}")

    pca_result, coords_2d = reduce_dimensions(
        embeddings,
        pca_components=args.pca,
        umap_neighbors=args.umap_neighbors,
        umap_min_dist=args.umap_min_dist,
    )

    knn_indices, knn_distances = compute_knn(embeddings, k=args.knn_k)

    output = build_output(
        font_ids,
        coords_2d,
        knn_indices,
        args.font_index,
        model_name,
        args.pca,
        args.umap_neighbors,
        args.umap_min_dist,
        args.knn_k,
    )

    out_path = args.output_dir / f"typography_data_python_{model_name}.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n🎉 Done! Output: {out_path}")
    print(f"   {len(font_ids)} fonts, {embeddings.shape[1]}D → PCA({args.pca}) → UMAP(2D)")
    print(f"   k-NN: {args.knn_k} neighbors per font in {embeddings.shape[1]}D space")
    print(f"\n💡 To deploy: copy {out_path.name} to public/data/typography_data.json")


if __name__ == "__main__":
    main()

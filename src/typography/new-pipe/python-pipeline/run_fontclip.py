#!/usr/bin/env python3
"""
FontMap + FontCLIP pipeline.

Uses the pre-trained FontCLIP checkpoint to generate typography-aware
embeddings, then applies PCA + spectral UMAP + high-dim k-NN.

Usage:
  cd src/typography/new-pipe/python-pipeline
  source .venv/bin/activate
  python run_fontclip.py
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors
from torchvision.transforms import Compose, Resize, CenterCrop, ToTensor, Normalize
from tqdm import tqdm

SCRIPT_DIR = Path(__file__).parent.resolve()
FONTCLIP_DIR = SCRIPT_DIR / "fontclip_workspace" / "FontCLIP"
CHECKPOINT_PATH = FONTCLIP_DIR / "model_checkpoints" / "model.pt"

PIPE_DIR = SCRIPT_DIR.parent
PNGS_DIR = PIPE_DIR / "output" / "pngs"
FONT_INDEX_PATH = PIPE_DIR / "input" / "font-index.json"
OUTPUT_DIR = PIPE_DIR / "output" / "data"
RESULTS_DIR = PIPE_DIR / "batch-testing" / "results"

PCA_COMPONENTS = 50
UMAP_NEIGHBORS = 12
UMAP_MIN_DIST = 1.0
KNN_K = 8
RANDOM_STATE = 42
ENABLE_FONT_FUSION = True

try:
    from torchvision.transforms import InterpolationMode
    BICUBIC = InterpolationMode.BICUBIC
except ImportError:
    BICUBIC = Image.BICUBIC


def get_preprocess(input_resolution=224):
    return Compose([
        Resize(input_resolution, interpolation=BICUBIC),
        CenterCrop(input_resolution),
        lambda img: img.convert("RGB"),
        ToTensor(),
        Normalize(
            (0.48145466, 0.4578275, 0.40821073),
            (0.26862954, 0.26130258, 0.27577711),
        ),
    ])


def load_fontclip_model(device="cpu"):
    """Load FontCLIP by importing model code and applying the checkpoint."""
    saved_cwd = os.getcwd()
    os.chdir(str(FONTCLIP_DIR))
    sys.path.insert(0, str(FONTCLIP_DIR))

    try:
        from models.init_model import load_model
        from models.lora import LoRAConfig

        lora_config_text = LoRAConfig(
            r=256, alpha=1024.0, bias=False, learnable_alpha=False,
            apply_q=True, apply_k=True, apply_v=True, apply_out=True,
        )

        print("🔄 Loading FontCLIP ViT-B/32 (with LoRA text adapter)...")
        model = load_model(
            checkpoint_path=str(CHECKPOINT_PATH),
            requires_grad=False,
            device=device,
            model_name="ViT-B/32",
            use_lora_text=True,
            lora_config_text=lora_config_text,
        )
    finally:
        os.chdir(saved_cwd)

    model.eval()
    input_resolution = model.visual.input_resolution
    preprocess = get_preprocess(input_resolution)
    print(f"✅ FontCLIP loaded (input: {input_resolution}×{input_resolution}, device: {device})")
    return model, preprocess


def generate_embeddings(model, preprocess, device="cpu"):
    """Generate FontCLIP embeddings for all PNGs."""
    png_files = sorted(PNGS_DIR.glob("*_embed.png"))
    if not png_files:
        png_files = sorted(PNGS_DIR.glob("*_a.png"))
        print(f"⚠️  No _embed.png, falling back to _a.png ({len(png_files)})")
    else:
        print(f"📁 Found {len(png_files)} multi-glyph embed PNGs")

    font_ids = []
    embeddings = []

    for png_path in tqdm(png_files, desc="FontCLIP embeddings"):
        font_id = png_path.stem.replace("_embed", "").replace("_a", "")
        font_ids.append(font_id)

        image = preprocess(Image.open(png_path)).unsqueeze(0).to(device)

        with torch.no_grad():
            feat = model.encode_image(image)
            feat = feat / feat.norm(dim=-1, keepdim=True)

        embeddings.append(feat.cpu().numpy().squeeze().astype(np.float32))

    embeddings = np.array(embeddings)
    print(f"✅ {len(embeddings)} embeddings ({embeddings.shape[1]}D)")
    return font_ids, embeddings


def extract_fusion_prefix(font_id, font_meta=None):
    """Extract family prefix for fusion (mirrors JS extractFusionPrefix)."""
    parts = font_id.split('-')
    if len(parts) <= 1:
        return font_id

    if font_meta:
        subsets = font_meta.get("subsets", [])
        common = {'latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext'}
        for subset in subsets:
            if subset not in common and subset in font_id:
                base = font_id.replace(f'-{subset}', '').replace(subset, '')
                if base and base != font_id:
                    return base

    special_cases = {
        'baloo': ['baloo-2', 'baloo-bhai-2', 'baloo-bhaijaan-2', 'baloo-bhaina-2',
                  'baloo-chettan-2', 'baloo-da-2', 'baloo-paaji-2', 'baloo-tamma-2',
                  'baloo-tammudu-2', 'baloo-thambi-2'],
        'ibm-plex': ['ibm-plex'],
        'playwrite': ['playwrite'],
    }
    for family_prefix, patterns in special_cases.items():
        for pattern in patterns:
            if font_id.startswith(pattern):
                return family_prefix

    if font_id.startswith('noto-serif-'):
        return 'noto-serif'
    if font_id.startswith('noto-'):
        return 'noto'

    second = parts[1]
    if second in ('sans', 'serif', 'plex'):
        return '-'.join(parts[:2])

    return parts[0]


def merge_font_families(font_ids, embeddings, font_index):
    """Group font variants by family prefix and pick one representative."""
    prefix_groups = {}

    for i, fid in enumerate(font_ids):
        meta = font_index.get(fid, {})
        prefix = extract_fusion_prefix(fid, meta)
        if prefix not in prefix_groups:
            prefix_groups[prefix] = []
        prefix_groups[prefix].append(i)

    representatives = {
        'noto': 'noto-sans-arabic',
        'noto-serif': 'noto-serif-latin',
        'ibm-plex': 'ibm-plex-sans',
        'baloo': 'baloo-2',
    }

    merged_ids = []
    merged_embeddings = []
    merged_image_names = []

    for prefix, indices in prefix_groups.items():
        if len(indices) > 1:
            rep_idx = indices[0]
            if prefix in representatives:
                for idx in indices:
                    if font_ids[idx] == representatives[prefix]:
                        rep_idx = idx
                        break
            merged_ids.append(prefix)
            merged_embeddings.append(embeddings[rep_idx])
            merged_image_names.append(font_ids[rep_idx])
        else:
            idx = indices[0]
            merged_ids.append(font_ids[idx])
            merged_embeddings.append(embeddings[idx])
            merged_image_names.append(font_ids[idx])

    merged_embeddings = np.array(merged_embeddings)
    print(f"🔗 Font fusion: {len(font_ids)} → {len(merged_ids)} fonts ({len(font_ids) - len(merged_ids)} merged)")
    return merged_ids, merged_embeddings, merged_image_names


def run_pca_umap(embeddings):
    import umap

    print(f"\n📐 PCA: {embeddings.shape[1]}D → {PCA_COMPONENTS}D")
    pca = PCA(n_components=PCA_COMPONENTS, random_state=RANDOM_STATE)
    pca_result = pca.fit_transform(embeddings)
    var = pca.explained_variance_ratio_.sum() * 100
    print(f"   Variance conservée: {var:.1f}%")

    print(f"🗺️  UMAP: {PCA_COMPONENTS}D → 2D (spectral init, n={UMAP_NEIGHBORS}, d={UMAP_MIN_DIST})")
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=UMAP_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        metric="cosine",
        init="spectral",
        random_state=RANDOM_STATE,
        verbose=True,
    )
    coords = reducer.fit_transform(pca_result)
    return coords, var


def compute_knn(embeddings):
    print(f"\n🔍 k-NN (k={KNN_K}) in {embeddings.shape[1]}D...")
    nn = NearestNeighbors(n_neighbors=KNN_K + 1, metric="cosine", algorithm="brute")
    nn.fit(embeddings)
    _, indices = nn.kneighbors(embeddings)
    return indices[:, 1:]


def build_and_save(font_ids, coords, knn_indices, image_names=None):
    font_index = {}
    if FONT_INDEX_PATH.exists():
        with open(FONT_INDEX_PATH) as f:
            font_index = json.load(f)

    fonts = []
    for i, fid in enumerate(font_ids):
        img_name = image_names[i] if image_names else fid
        entry = {
            "id": fid,
            "name": fid,
            "imageName": img_name,
            "family": "sans-serif",
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
            "neighbors": [font_ids[j] for j in knn_indices[i]],
        }
        lookup_id = img_name if img_name in font_index else fid
        if lookup_id in font_index:
            meta = font_index[lookup_id]
            entry["family"] = meta.get("category", "sans-serif")
            family = meta.get("family", lookup_id)
            entry["google_fonts_url"] = f"https://fonts.google.com/specimen/{family.replace(' ', '+')}"
            entry["weights"] = meta.get("weights", [])
            entry["styles"] = meta.get("styles", [])
            entry["subsets"] = meta.get("subsets", [])
        fonts.append(entry)

    result = {
        "config": {
            "nNeighbors": UMAP_NEIGHBORS,
            "minDist": UMAP_MIN_DIST,
            "metric": "cosine",
            "enableFontFusion": ENABLE_FONT_FUSION,
            "testName": "fontclip-spectral",
            "randomSeed": RANDOM_STATE,
        },
        "metadata": {
            "method": "umap_from_fontclip_python",
            "model": "FontCLIP ViT-B/32 (fine-tuned for typography)",
            "pca_components": PCA_COMPONENTS,
            "knn_neighbors": KNN_K,
            "umap_init": "spectral",
            "total_fonts": len(fonts),
            "note": "FontCLIP embeddings with spectral UMAP and high-dim k-NN",
        },
        "fonts": fonts,
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)

    out1 = OUTPUT_DIR / "typography_data_fontclip.json"
    with open(out1, "w") as f:
        json.dump(result, f, indent=2)
    print(f"💾 Saved: {out1}")

    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    out2 = RESULTS_DIR / f"fontclip-spectral_{ts}.json"
    with open(out2, "w") as f:
        json.dump(result, f, indent=2)
    print(f"💾 Saved: {out2}")

    return out1


def main():
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"🖥️  Device: {device}\n")

    if not CHECKPOINT_PATH.exists():
        print(f"❌ Checkpoint manquant: {CHECKPOINT_PATH}")
        print(f"   Téléchargez-le d'abord via:")
        print(f"   curl -L 'https://drive.usercontent.google.com/download?id=1Tym7rAIuaGr6Gv-gZRSJmPstQjOWPgl1&export=download&confirm=t' -o '{CHECKPOINT_PATH}'")
        sys.exit(1)
    print(f"✅ Checkpoint found: {CHECKPOINT_PATH} ({CHECKPOINT_PATH.stat().st_size / 1e6:.0f} MB)")

    model, preprocess = load_fontclip_model(device)
    font_ids, embeddings = generate_embeddings(model, preprocess, device)

    np.savez_compressed(OUTPUT_DIR / "embeddings_fontclip.npz", font_ids=font_ids, embeddings=embeddings)

    image_names = None
    umap_ids = font_ids
    umap_embeddings = embeddings

    if ENABLE_FONT_FUSION:
        font_index = {}
        if FONT_INDEX_PATH.exists():
            with open(FONT_INDEX_PATH) as f:
                font_index = json.load(f)
        umap_ids, umap_embeddings, image_names = merge_font_families(font_ids, embeddings, font_index)

    coords, var = run_pca_umap(umap_embeddings)
    knn_indices = compute_knn(umap_embeddings)
    out = build_and_save(umap_ids, coords, knn_indices, image_names)

    print(f"\n🎉 Done! {len(umap_ids)} fonts processed with FontCLIP")
    print(f"   PCA variance: {var:.1f}%, UMAP spectral init")
    if ENABLE_FONT_FUSION:
        print(f"   Font fusion enabled ({len(font_ids)} → {len(umap_ids)})")
    print(f"\n💡 To deploy: node 8-deploy-to-prod.mjs fontclip-spectral")


if __name__ == "__main__":
    main()

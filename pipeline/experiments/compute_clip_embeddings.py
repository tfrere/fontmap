#!/usr/bin/env python3
"""
Compute vanilla OpenAI CLIP ViT-B/32 image embeddings for the same `_embed.png`
specimens used for the FontCLIP embeddings, as a baseline for comparison.

Uses the standard CLIP preprocessing (bicubic resize 224, center crop, OpenAI
mean/std) and L2-normalises the features, like FontCLIP. Font ids follow the
order of the reference npz so both files can be compared row by row.

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/experiments/compute_clip_embeddings.py
"""

import argparse
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from tqdm import tqdm

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_DIR.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--weights", type=Path, default=Path.home() / ".cache/clip/ViT-B-32.pt")
    parser.add_argument("--pngs-dir", type=Path, default=PIPELINE_DIR / "output/pngs")
    parser.add_argument("--reference", type=Path, default=PIPELINE_DIR / "output/data/embeddings_fontclip.npz",
                        help="npz whose font_ids define the fonts and their order")
    parser.add_argument("--output", type=Path, default=PIPELINE_DIR / "output/data/embeddings_clip.npz")
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    import open_clip
    from open_clip.constants import OPENAI_DATASET_MEAN, OPENAI_DATASET_STD

    model = open_clip.openai.load_openai_model(str(args.weights), device="cpu")
    model.eval()
    preprocess = open_clip.image_transform(224, is_train=False, mean=OPENAI_DATASET_MEAN, std=OPENAI_DATASET_STD)

    font_ids = [str(i) for i in np.load(args.reference, allow_pickle=True)["font_ids"]]
    missing = [fid for fid in font_ids if not (args.pngs_dir / f"{fid}_embed.png").exists()]
    if missing:
        raise SystemExit(f"Missing _embed.png for: {missing}")

    embeddings = []
    for start in tqdm(range(0, len(font_ids), args.batch_size), desc="CLIP ViT-B/32"):
        batch = font_ids[start:start + args.batch_size]
        images = torch.stack([
            preprocess(Image.open(args.pngs_dir / f"{fid}_embed.png").convert("RGB")) for fid in batch
        ])
        with torch.no_grad():
            feats = model.encode_image(images).float()
            feats = feats / feats.norm(dim=-1, keepdim=True)
        embeddings.append(feats.numpy())

    embeddings = np.concatenate(embeddings).astype(np.float32)
    np.savez_compressed(args.output, font_ids=np.array(font_ids), embeddings=embeddings)
    print(f"Written {embeddings.shape} embeddings to {args.output}")


if __name__ == "__main__":
    main()

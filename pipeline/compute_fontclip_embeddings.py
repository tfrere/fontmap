#!/usr/bin/env python3
"""
Compute FontCLIP image embeddings (512D, L2-normalised) for every rendered
`<font-id>_embed.png` specimen and save them as output/data/embeddings_fontclip.npz,
the input of build_typography_data.py.

The FontCLIP image encoder is the OpenAI CLIP ViT-B/32 with the fine-tuned visual
weights of the FontCLIP checkpoint swapped in (see fontclip_model.py).

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/compute_fontclip_embeddings.py
"""

import argparse
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from tqdm import tqdm

from fontclip_model import DEFAULT_CHECKPOINT, DEFAULT_OPENAI_WEIGHTS, load_fontclip_openclip

PIPELINE_DIR = Path(__file__).resolve().parent


def embed(model, preprocess, png_paths, batch_size=64):
    embeddings = []
    for start in tqdm(range(0, len(png_paths), batch_size), desc="FontCLIP"):
        images = torch.stack([preprocess(Image.open(p).convert("RGB")) for p in png_paths[start:start + batch_size]])
        with torch.no_grad():
            feats = model.encode_image(images).float()
            feats = feats / feats.norm(dim=-1, keepdim=True)
        embeddings.append(feats.numpy())
    return np.concatenate(embeddings).astype(np.float32)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pngs-dir", type=Path, default=PIPELINE_DIR / "output/pngs")
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--openai-weights", type=Path, default=DEFAULT_OPENAI_WEIGHTS)
    parser.add_argument("--output", type=Path, default=PIPELINE_DIR / "output/data/embeddings_fontclip.npz")
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    png_paths = sorted(args.pngs_dir.glob("*_embed.png"))
    if not png_paths:
        raise SystemExit(f"No *_embed.png in {args.pngs_dir}")
    font_ids = [p.name[: -len("_embed.png")] for p in png_paths]

    model, preprocess = load_fontclip_openclip(args.checkpoint, args.openai_weights)
    embeddings = embed(model, preprocess, png_paths, args.batch_size)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.output, font_ids=np.array(font_ids), embeddings=embeddings)
    print(f"Written {embeddings.shape} embeddings to {args.output}")


if __name__ == "__main__":
    main()

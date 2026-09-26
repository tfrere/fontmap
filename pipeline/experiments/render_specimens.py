#!/usr/bin/env python3
"""
Render font specimens at a fixed scale relative to the em square and embed them
with CLIP ViT-B/32 (or FontCLIP with --model fontclip), to test rendering choices
against evaluate_with_gf_tags.py.

Unlike fit-to-box renders, every font uses the same pixel size per em and the
same baselines, so x-height, width and weight differences stay visible.
Several specimens per font can be averaged into one embedding.

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/experiments/render_specimens.py --variant fixed
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from tqdm import tqdm

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_DIR.parent
sys.path.insert(0, str(PIPELINE_DIR))
SIZE = 224

SPECIMENS = {
    "word": ("Hamburge", "fonstiv"),
    "caps": ("HAMBURG", "EFONSTIV"),
    "diag": ("Rag Qak", "Jy 0123"),
}
VARIANTS = {
    "fixed": ["word"],
    "multi": ["word", "caps", "diag"],
}


def find_font_file(fonts_dir, font_id):
    folder = fonts_dir / font_id
    files = sorted(folder.glob("*-400-normal-latin.truetype")) or sorted(folder.glob("*normal*.truetype")) \
        or sorted(folder.glob("*.truetype"))
    return files[0] if files else None


def render(font_path, lines, em_px):
    img = Image.new("L", (SIZE, SIZE), 255)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(font_path), em_px)
    baselines = (SIZE * 0.42, SIZE * 0.80)
    for text, y in zip(lines, baselines):
        draw.text((SIZE / 2, y), text, font=font, fill=0, anchor="ms")
    return img.convert("RGB")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--variant", choices=VARIANTS, default="fixed")
    parser.add_argument("--em-px", type=int, default=40)
    parser.add_argument("--fonts-dir", type=Path, default=PIPELINE_DIR / "output/fonts")
    parser.add_argument("--reference", type=Path, default=PIPELINE_DIR / "output/data/embeddings_fontclip.npz")
    parser.add_argument("--weights", type=Path, default=Path.home() / ".cache/clip/ViT-B-32.pt")
    parser.add_argument("--model", choices=["clip", "fontclip"], default="clip")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--save-pngs", action="store_true")
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    import open_clip
    from open_clip.constants import OPENAI_DATASET_MEAN, OPENAI_DATASET_STD

    if args.model == "fontclip":
        from fontclip_model import load_fontclip_openclip
        model, preprocess = load_fontclip_openclip(openai_weights=args.weights)
    else:
        model = open_clip.openai.load_openai_model(str(args.weights), device="cpu")
        model.eval()
        preprocess = open_clip.image_transform(224, is_train=False, mean=OPENAI_DATASET_MEAN, std=OPENAI_DATASET_STD)

    reference_ids = [str(i) for i in np.load(args.reference, allow_pickle=True)["font_ids"]]
    font_files = {fid: find_font_file(args.fonts_dir, fid) for fid in reference_ids}
    font_ids, failed = [], []
    for fid in reference_ids:
        if not font_files[fid]:
            failed.append(fid)
            continue
        try:
            for name in VARIANTS[args.variant]:
                render(font_files[fid], SPECIMENS[name], args.em_px)
            font_ids.append(fid)
        except OSError:
            failed.append(fid)
    print(f"{len(font_ids)}/{len(reference_ids)} fonts rendered; skipped: {failed[:20]}{' ...' if len(failed) > 20 else ''}")

    png_dir = PIPELINE_DIR / f"output/pngs_{args.variant}"
    if args.save_pngs:
        png_dir.mkdir(parents=True, exist_ok=True)

    per_specimen = []
    for name in VARIANTS[args.variant]:
        feats_all = []
        for start in tqdm(range(0, len(font_ids), args.batch_size), desc=name):
            batch = font_ids[start:start + args.batch_size]
            images = []
            for fid in batch:
                img = render(font_files[fid], SPECIMENS[name], args.em_px)
                if args.save_pngs:
                    img.save(png_dir / f"{fid}_{name}.png")
                images.append(preprocess(img))
            with torch.no_grad():
                feats = model.encode_image(torch.stack(images)).float()
            feats_all.append((feats / feats.norm(dim=-1, keepdim=True)).numpy())
        per_specimen.append(np.concatenate(feats_all))

    embeddings = np.mean(per_specimen, axis=0)
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
    output = args.output or PIPELINE_DIR / f"output/data/embeddings_{args.model}_{args.variant}.npz"
    np.savez_compressed(output, font_ids=np.array(font_ids), embeddings=embeddings.astype(np.float32))
    print(f"Written {embeddings.shape} embeddings to {output}")


if __name__ == "__main__":
    main()

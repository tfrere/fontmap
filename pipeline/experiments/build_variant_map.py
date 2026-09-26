#!/usr/bin/env python3
"""
Build a variant of typography_data.json from another embedding model, keeping
exactly the same font set (shown ids, aliases, metadata) as a reference map.

The fold decisions of the reference (FontCLIP) map are reused as-is so both
maps show identical fonts; only the 2D positions (PCA -> UMAP) and the
high-dim k-NN are recomputed from the new embeddings, with the reference's
UMAP / k-NN parameters.

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/experiments/build_variant_map.py
  node scripts/apply-overlap-removal.mjs \
    --input pipeline/output/data/typography_data_clip.json --radius 13
"""

import argparse
import copy
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generate_embeddings_and_umap import compute_knn, reduce_dimensions  # noqa: E402

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_DIR.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--embeddings", type=Path, default=PIPELINE_DIR / "output/data/embeddings_clip.npz")
    parser.add_argument("--reuse-font-set", type=Path, default=REPO_ROOT / "public/data/typography_data.json")
    parser.add_argument("--output", type=Path, default=PIPELINE_DIR / "output/data/typography_data_clip.json")
    parser.add_argument("--model-name", default="CLIP ViT-B/32 (OpenAI, not fine-tuned)")
    parser.add_argument("--test-name", default="clip-spectral")
    args = parser.parse_args()

    reference = json.loads(args.reuse_font_set.read_text())
    config, metadata = reference["config"], reference["metadata"]
    shown_ids = [f["id"] for f in reference["fonts"]]

    data = np.load(args.embeddings, allow_pickle=True)
    row = {str(fid): i for i, fid in enumerate(data["font_ids"])}
    missing = [fid for fid in shown_ids if fid not in row]
    if missing:
        raise SystemExit(f"Fonts missing from {args.embeddings}: {missing}")
    embeddings = data["embeddings"].astype(np.float32)[[row[fid] for fid in shown_ids]]

    _, coords_2d = reduce_dimensions(
        embeddings,
        pca_components=metadata["pca_components"],
        umap_neighbors=config["nNeighbors"],
        umap_min_dist=config["minDist"],
        random_state=config["randomSeed"],
    )
    knn_indices, _ = compute_knn(embeddings, k=metadata["knn_neighbors"])

    output = copy.deepcopy(reference)
    output["config"]["testName"] = args.test_name
    output["metadata"]["method"] = f"umap_from_{args.embeddings.stem}_python"
    output["metadata"]["model"] = args.model_name
    output["metadata"]["font_set_from"] = args.reuse_font_set.name
    output["metadata"]["note"] = (f"Same font set and folds as {args.reuse_font_set.name}; "
                                  f"UMAP and k-NN recomputed from {args.embeddings.name}.")
    for i, font in enumerate(output["fonts"]):
        font["x"] = float(coords_2d[i, 0])
        font["y"] = float(coords_2d[i, 1])
        font["neighbors"] = [shown_ids[j] for j in knn_indices[i]]

    args.output.write_text(json.dumps(output, indent=2))
    print(f"Written {len(shown_ids)} fonts to {args.output}")


if __name__ == "__main__":
    main()

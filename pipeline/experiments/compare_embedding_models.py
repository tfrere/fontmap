#!/usr/bin/env python3
"""
Compare two font maps built from different embedding models over the same font set
(e.g. typography_data.json from FontCLIP vs typography_data_clip.json from CLIP).

Reports, per model:
- k-NN category agreement in the embedding space (share of the k nearest
  neighbours with the same Google Fonts category), overall and per category
- the same in the 2D map, plus UMAP trustworthiness (k neighbours)
and between models: mean Jaccard overlap of the high-dim k-NN sets, and the
k-NN lists of a few reference fonts.

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/experiments/compare_embedding_models.py
"""

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.manifold import trustworthiness
from sklearn.neighbors import NearestNeighbors

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_DIR.parent

CATEGORIES = ["sans-serif", "serif", "display", "handwriting", "monospace"]
EXAMPLES = ["roboto", "eb-garamond", "lobster", "courier-prime", "playfair-display", "pacifico", "space-mono"]


def knn(points, k, metric):
    nn = NearestNeighbors(n_neighbors=k + 1, metric=metric, algorithm="brute").fit(points)
    return nn.kneighbors(points)[1][:, 1:]


def agreement(neighbors, categories):
    same = categories[neighbors] == categories[:, None]
    per_font = same.mean(axis=1)
    return {"overall": per_font.mean(), **{c: per_font[categories == c].mean() for c in CATEGORIES}}


def load_model(label, map_path, npz_path, ids, k):
    fonts = {f["id"]: f for f in json.loads(map_path.read_text())["fonts"]}
    if sorted(fonts) != sorted(ids):
        raise SystemExit(f"{map_path} does not have the same font set")
    data = np.load(npz_path, allow_pickle=True)
    row = {str(fid): i for i, fid in enumerate(data["font_ids"])}
    embeddings = data["embeddings"].astype(np.float32)[[row[fid] for fid in ids]]
    coords = np.array([[fonts[fid]["x"], fonts[fid]["y"]] for fid in ids])
    return {"label": label, "embeddings": embeddings, "coords": coords,
            "hd_knn": knn(embeddings, k, "cosine"), "map_knn": knn(coords, k, "euclidean")}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--map-a", type=Path, default=REPO_ROOT / "public/data/typography_data.json")
    parser.add_argument("--npz-a", type=Path, default=PIPELINE_DIR / "output/data/embeddings_fontclip.npz")
    parser.add_argument("--label-a", default="FontCLIP")
    parser.add_argument("--map-b", type=Path, default=PIPELINE_DIR / "output/data/typography_data_clip.json")
    parser.add_argument("--npz-b", type=Path, default=PIPELINE_DIR / "output/data/embeddings_clip.npz")
    parser.add_argument("--label-b", default="CLIP")
    parser.add_argument("-k", type=int, default=8)
    args = parser.parse_args()

    ref = json.loads(args.map_a.read_text())["fonts"]
    ids = [f["id"] for f in ref]
    names = {f["id"]: f["name"] for f in ref}
    categories = np.array([f["family"] for f in ref])
    models = [load_model(args.label_a, args.map_a, args.npz_a, ids, args.k),
              load_model(args.label_b, args.map_b, args.npz_b, ids, args.k)]

    counts = {c: int((categories == c).sum()) for c in CATEGORIES}
    base = {c: counts[c] / len(ids) for c in CATEGORIES}
    chance = sum(p * p for p in base.values())
    print(f"{len(ids)} fonts, k={args.k}; categories: {counts}; chance agreement {chance:.3f}\n")

    header = ["metric"] + [m["label"] for m in models]
    rows = []
    for space, key in [("512D", "hd_knn"), ("2D map", "map_knn")]:
        stats = [agreement(m[key], categories) for m in models]
        rows.append([f"{space} kNN same category"] + [f"{s['overall']:.3f}" for s in stats])
        for c in CATEGORIES:
            rows.append([f"  {c} (n={counts[c]})"] + [f"{s[c]:.3f}" for s in stats])
    rows.append([f"trustworthiness (k={args.k})"]
                + [f"{trustworthiness(m['embeddings'], m['coords'], n_neighbors=args.k, metric='cosine'):.4f}"
                   for m in models])
    rows.append([f"512D kNN recovered in 2D map"]
                + [f"{np.mean([len(set(a) & set(b)) / args.k for a, b in zip(m['hd_knn'], m['map_knn'])]):.3f}"
                   for m in models])

    widths = [max(len(r[i]) for r in rows + [header]) for i in range(len(header))]
    fmt = lambda r: " | ".join(c.ljust(w) if i == 0 else c.rjust(w) for i, (c, w) in enumerate(zip(r, widths)))
    print(fmt(header))
    print("-+-".join("-" * w for w in widths))
    for r in rows:
        print(fmt(r))

    a, b = models[0]["hd_knn"], models[1]["hd_knn"]
    jaccard = [len(set(x) & set(y)) / len(set(x) | set(y)) for x, y in zip(a, b)]
    print(f"\n512D kNN overlap {args.label_a} vs {args.label_b}: mean Jaccard {np.mean(jaccard):.3f}, "
          f"fonts with no shared neighbour {np.mean(np.array(jaccard) == 0):.1%}")

    index = {fid: i for i, fid in enumerate(ids)}
    for fid in EXAMPLES:
        if fid not in index:
            print(f"\n{fid}: not on the map")
            continue
        i = index[fid]
        print(f"\n{names[fid]} ({categories[i]})")
        for m in models:
            print(f"  {m['label']:<9} " + ", ".join(
                f"{names[ids[j]]}{'' if categories[j] == categories[i] else ' [' + categories[j] + ']'}"
                for j in m["hd_knn"][i]))


if __name__ == "__main__":
    main()

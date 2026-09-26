#!/usr/bin/env python3
"""
Test a supervised metric (NCA) learned from Google Fonts structural tags on top
of the FontCLIP embeddings, with an honest held-out protocol.

For each of 5 folds, 20% of the tagged fonts (grouped by id prefix, so that
superfamilies like noto-* or ibm-plex-* never straddle train and test) are held
out. NCA is fit on the remaining tagged fonts, all fonts are transformed, and
only held-out fonts are scored: the share of their k nearest neighbours (among
all tagged fonts) sharing their dominant tag, in the embedding and on a t-SNE
map with overlap removal.

The transformed space is blended with the original one:
  z = [(1 - w) * original, w * nca]  (each block L2-normalised)
so w=0 is the current embedding and w=1 is pure NCA.

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/experiments/evaluate_supervised_projection.py
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.model_selection import GroupKFold
from sklearn.neighbors import NearestNeighbors, NeighborhoodComponentsAnalysis

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evaluate_with_gf_tags import PIPE, ROOT, load_npz, load_tags  # noqa: E402


def normalize(A):
    return A / np.linalg.norm(A, axis=1, keepdims=True)


def blend(orig, nca, w):
    return np.hstack([(1 - w) * normalize(orig), w * normalize(nca)])


def heldout_precision(Z, tagged_idx, labels, query_mask, k, groups=None, group=None):
    """P@k for held-out queries; neighbours searched among all tagged fonts (optionally one group)."""
    pool = np.arange(len(tagged_idx))
    if group is not None:
        pool = pool[np.asarray(groups) == group]
    Zp = Z[tagged_idx[pool]]
    nn = NearestNeighbors(n_neighbors=k + 1).fit(Zp)
    q = [i for i, p in enumerate(pool) if query_mask[p]]
    nb = nn.kneighbors(Zp[q], return_distance=False)[:, 1:]
    lab = np.asarray(labels)[pool]
    return float((lab[nb] == lab[q][:, None]).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--embeddings", default=PIPE / "output/data/embeddings_fontclip.npz")
    ap.add_argument("--map", default=ROOT / "public/data/typography_data.json")
    ap.add_argument("--k", type=int, default=8)
    ap.add_argument("--nca-dims", type=int, default=32)
    ap.add_argument("--weights", default="0,0.25,0.5,0.75,1")
    ap.add_argument("--with-map", action="store_true", help="also score t-SNE maps (slower)")
    args = ap.parse_args()

    tags = load_tags(PIPE / "input/gf-tags-families.csv")
    fonts = json.load(open(args.map))["fonts"]
    emb = load_npz(args.embeddings)
    X = np.stack([emb[f["id"]] for f in fonts])
    X50 = PCA(50, random_state=42).fit_transform(X)

    tagged_idx = np.array([n for n, f in enumerate(fonts) if tags.get(f["name"])])
    labels = []
    for n in tagged_idx:
        t = tags[fonts[n]["name"]]
        labels.append(max(t, key=t.get))
    groups = [l.split("/")[1] for l in labels]
    prefixes = [fonts[n]["id"].split("-")[0] for n in tagged_idx]
    weights = [float(w) for w in args.weights.split(",")]

    rows = {w: {"all": [], "Sans": [], "Serif": [], "Script": [], "map all": [], "map Sans": []} for w in weights}
    for fold, (train, test) in enumerate(GroupKFold(5).split(tagged_idx, labels, prefixes)):
        query_mask = np.zeros(len(tagged_idx), bool)
        query_mask[test] = True
        nca = NeighborhoodComponentsAnalysis(n_components=args.nca_dims, random_state=fold, max_iter=200)
        nca.fit(X50[tagged_idx[train]], np.asarray(labels)[train])
        N = nca.transform(X50)
        for w in weights:
            Z = blend(X, N, w)
            r = rows[w]
            r["all"].append(heldout_precision(Z, tagged_idx, labels, query_mask, args.k))
            for g in ("Sans", "Serif", "Script"):
                r[g].append(heldout_precision(Z, tagged_idx, labels, query_mask, args.k, groups, g))
            if args.with_map:
                Y = TSNE(2, perplexity=15, init="pca", random_state=42).fit_transform(Z)
                r["map all"].append(heldout_precision(Y, tagged_idx, labels, query_mask, args.k))
                r["map Sans"].append(heldout_precision(Y, tagged_idx, labels, query_mask, args.k, groups, "Sans"))
        print(f"fold {fold + 1}/5 done ({len(test)} held-out fonts)", flush=True)

    cols = ["all", "Sans", "Serif", "Script"] + (["map all", "map Sans"] if args.with_map else [])
    print(f"\nheld-out P@{args.k} (mean over 5 folds); w = weight of the NCA block")
    print("w".ljust(8) + "".join(c.rjust(12) for c in cols))
    for w in weights:
        print(f"{w:<8}" + "".join(f"{np.mean(rows[w][c]):.3f}".rjust(12) for c in cols))


if __name__ == "__main__":
    main()

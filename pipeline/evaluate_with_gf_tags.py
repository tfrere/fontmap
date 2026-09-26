#!/usr/bin/env python3
"""
Score font embeddings and 2D maps against Google Fonts' fine-grained tags.

Google Fonts tags each family with weighted classification tags (0-100), e.g.
/Sans/Humanist, /Sans/Geometric, /Serif/Didone, /Script/Formal, /Monospace/Monospace.
They are the closest thing to a typographic ground truth for this catalogue.

Structural tags = everything under /Sans, /Serif, /Slab, /Script, /Monospace.
Each tagged font gets a structural score vector and a dominant tag (argmax).

Metrics (k nearest neighbours, computed among tagged fonts only):
- dominant tag P@k: share of neighbours with the same dominant tag
- within-group P@k: same, but restricted to one group (e.g. sans only), which
  measures whether humanist / geometric / grotesque are told apart
- tag profile similarity@k: mean cosine between the structural vectors of a
  font and its neighbours (handles multi-label tags)
- linear probe: 5-fold balanced accuracy of a logistic regression predicting
  the dominant tag from the embedding (information present, even if the
  neighbour geometry doesn't show it)

Usage (from the repo root):
  curl -sL -o pipeline/input/gf-tags-families.csv \
    https://raw.githubusercontent.com/google/fonts/main/tags/all/families.csv
  pipeline/.venv/bin/python pipeline/evaluate_with_gf_tags.py
"""

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import balanced_accuracy_score
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

STRUCTURAL_ROOTS = ("/Sans/", "/Serif/", "/Slab/", "/Script/", "/Monospace/")
# Themes that describe a letterform family of their own (a blackletter font often
# has no structural tag at all). /Theme/Wacky is left out: it's a mood, not a form.
FORM_THEMES = tuple(f"/Theme/{t}" for t in (
    "Blackletter", "Pixel", "Stencil", "Techno", "Distressed", "Brush", "Woodtype", "Inline",
    "Shaded", "Blobby", "Art Deco", "Art Nouveau", "Medieval", "Tuscan"))
PIPE = Path(__file__).resolve().parent
ROOT = PIPE.parent


def load_tags(path, themes=(), theme_min_score=70):
    """family name -> {tag: score}; family-wide rows win over axis-specific ones.

    Structural tags always count; tags in `themes` only from `theme_min_score` up,
    so a font's dominant tag is a theme only when it's a strong one.
    """
    base, axis = defaultdict(dict), defaultdict(dict)
    with open(path, newline="") as f:
        for row in csv.reader(f):
            if len(row) < 4:
                continue
            is_theme = row[2] in themes
            if not (row[2].startswith(STRUCTURAL_ROOTS) or (is_theme and float(row[3]) >= theme_min_score)):
                continue
            family, axes, tag, score = row[0], row[1], row[2], float(row[3])
            target = axis if axes else base
            target[family][tag] = max(score, target[family].get(tag, 0.0))
    tags = {}
    for family in set(base) | set(axis):
        merged = dict(axis.get(family, {}))
        merged.update(base.get(family, {}))
        tags[family] = merged
    return tags


def group_of(tag):
    return tag.split("/")[1]


def knn_indices(X, k, metric):
    nn = NearestNeighbors(n_neighbors=k + 1, metric=metric).fit(X)
    return nn.kneighbors(X, return_distance=False)[:, 1:]


def precision_at_k(neighbors, labels):
    labels = np.asarray(labels)
    return float((labels[neighbors] == labels[:, None]).mean())


def evaluate_space(X, metric, labels, groups, profiles, k):
    out = {}
    nb = knn_indices(X, k, metric)
    out["P@k dominant tag"] = precision_at_k(nb, labels)
    P = profiles / np.linalg.norm(profiles, axis=1, keepdims=True)
    out["tag profile sim@k"] = float((P[:, None, :] * P[nb]).sum(-1).mean())
    for g in ("Sans", "Serif", "Script"):
        mask = np.array([gr == g for gr in groups])
        if mask.sum() > k + 1:
            sub = knn_indices(X[mask], k, metric)
            out[f"within {g} P@k"] = precision_at_k(sub, np.asarray(labels)[mask])
    return out


def chance_precision(labels):
    counts = np.array(list(Counter(labels).values()), dtype=float)
    n = counts.sum()
    return float(((counts / n) * (counts - 1) / (n - 1)).sum())


def linear_probe(X, labels, min_count=15, seed=0):
    counts = Counter(labels)
    keep = np.array([counts[l] >= min_count for l in labels])
    y = np.asarray(labels)[keep]
    clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=3000, C=0.5))
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    pred = cross_val_predict(clf, X[keep], y, cv=cv)
    return float(balanced_accuracy_score(y, pred)), len(set(y))


def load_npz(path):
    z = np.load(path, allow_pickle=True)
    E = z["embeddings"].astype(np.float64)
    E /= np.linalg.norm(E, axis=1, keepdims=True)
    return {str(i): E[n] for n, i in enumerate(z["font_ids"])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tags", default=PIPE / "input/gf-tags-families.csv")
    ap.add_argument("--k", type=int, default=8)
    ap.add_argument(
        "--model",
        action="append",
        nargs=3,
        metavar=("LABEL", "EMBEDDINGS_NPZ", "MAP_JSON"),
        help="repeatable; defaults to FontCLIP and CLIP",
    )
    ap.add_argument("--json-out", default=None)
    args = ap.parse_args()

    models = args.model or [
        ("FontCLIP", PIPE / "output/data/embeddings_fontclip.npz", ROOT / "public/data/typography_data.json"),
        ("CLIP", PIPE / "output/data/embeddings_clip.npz", PIPE / "output/data/typography_data_clip.json"),
    ]

    tags = load_tags(args.tags)
    ref_map = json.load(open(models[0][2]))["fonts"]
    available = [set(load_npz(npz)) for _, npz, _ in models]
    tagged = [f for f in ref_map if tags.get(f["name"]) and all(f["id"] in a for a in available)]
    all_tags = sorted({t for f in tagged for t in tags[f["name"]]})
    t_index = {t: i for i, t in enumerate(all_tags)}
    profiles = np.zeros((len(tagged), len(all_tags)))
    for r, f in enumerate(tagged):
        for t, s in tags[f["name"]].items():
            profiles[r, t_index[t]] = s
    labels = [all_tags[i] for i in profiles.argmax(1)]
    groups = [group_of(l) for l in labels]
    ids = [f["id"] for f in tagged]

    print(f"{len(tagged)}/{len(ref_map)} map fonts carry structural Google Fonts tags; k={args.k}")
    print("dominant tags:", ", ".join(f"{t.strip('/')} {c}" for t, c in Counter(labels).most_common()))
    chance = {"P@k dominant tag": chance_precision(labels)}
    for g in ("Sans", "Serif", "Script"):
        chance[f"within {g} P@k"] = chance_precision([l for l in labels if group_of(l) == g])
    rng = np.random.default_rng(0)
    Pn = profiles / np.linalg.norm(profiles, axis=1, keepdims=True)
    chance["tag profile sim@k"] = float((Pn * Pn[rng.permutation(len(Pn))]).sum(1).mean())

    results = {"chance": chance}
    for label, npz, map_json in models:
        emb = load_npz(npz)
        X = np.stack([emb[i] for i in ids])
        pos = {f["id"]: (f["x"], f["y"]) for f in json.load(open(map_json))["fonts"]}
        Y = np.array([pos[i] for i in ids])
        results[f"{label} 512D"] = evaluate_space(X, "cosine", labels, groups, profiles, args.k)
        results[f"{label} 2D map"] = evaluate_space(Y, "euclidean", labels, groups, profiles, args.k)
        acc, n_cls = linear_probe(X, labels)
        results[f"{label} 512D"]["linear probe bal. acc"] = acc
        results.setdefault("chance", {})["linear probe bal. acc"] = 1.0 / n_cls

    metrics = list(results[f"{models[0][0]} 512D"].keys())
    cols = list(results.keys())
    w = max(len(m) for m in metrics) + 2
    print("\n" + "metric".ljust(w) + "".join(c.rjust(16) for c in cols))
    for m in metrics:
        row = "".join(
            (f"{results[c][m]:.3f}" if m in results[c] else "-").rjust(16) for c in cols
        )
        print(m.ljust(w) + row)

    for g in ("Sans", "Serif", "Script"):
        per = defaultdict(list)
        for label, npz, _ in models:
            emb = load_npz(npz)
            mask = [i for i, gr in enumerate(groups) if gr == g]
            X = np.stack([emb[ids[i]] for i in mask])
            nb = knn_indices(X, args.k, "cosine")
            lab = np.asarray(labels)[mask]
            for t in sorted(set(lab)):
                sel = lab == t
                per[t].append((sel.sum(), float((lab[nb[sel]] == t).mean())))
        print(f"\nwithin {g}, per subtype P@k (" + " / ".join(m[0] for m in models) + ")")
        for t, vals in sorted(per.items(), key=lambda kv: -kv[1][0][0]):
            print(f"  {t:<24} n={vals[0][0]:<4}" + "  ".join(f"{v:.3f}" for _, v in vals))

    if args.json_out:
        json.dump(results, open(args.json_out, "w"), indent=2)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Build public/data/typography_data.json from the precomputed FontCLIP embeddings.

Every Google Fonts family is its own entry, except fonts that would be exact
duplicates on the map. Embeddings come from a Latin specimen, so fonts that
ship the same Latin glyphs get the same embedding. Two kinds are folded:

- Identical renders: fonts are grouped as connected components over pairs with
  cosine distance <= --identical-max-distance (noto-sans-carian -> noto-sans,
  baloo-bhai-2 -> baloo-2, battambang -> roboto-slab, mada -> noto-sans-jp).
- Playwrite "Guides": <base>-guides only adds notebook ruling lines to <base>,
  so it is folded into <base> whenever <base> exists, regardless of distance.

Each group keeps one representative (see pick_representative), which keeps its
own embedding, image, name and category and lists the others in `aliases`.

Fonts whose rendered "a" is the .notdef box (no Latin glyphs, e.g. Khmer or
Myanmar-only fonts) are excluded, since their position would be meaningless.

Pipeline (default, --layout tsne):
  embeddings (512D) -> tag-aware space -> t-SNE(2D, perplexity 15)
                     + k-NN (euclidean) in the tag-aware space.
The tag-aware space blends the L2-normalised embedding with the (square-rooted)
probabilities of a logistic regression trained on PCA(50) of the embeddings
(plus measured proportions) to predict each tagged font's dominant Google Fonts
tag: structural (/Sans/Humanist, /Serif/Didone, ...) or a strong form theme
(/Theme/Blackletter, /Theme/Pixel, ...), weighted by --tag-blend. Untagged fonts
get their position from the classifier's predictions. Measured on held-out
families (evaluate_supervised_projection.py), this lifts the share of the 8
nearest neighbours sharing a font's sub-style from 0.38 to 0.45.
--layout umap --tag-blend 0 reproduces the previous pipeline:
  embeddings (512D) -> PCA(50) -> UMAP(2D, cosine, spectral init) + cosine k-NN.

Usage (from the repo root):
  curl -sL -o pipeline/input/gf-tags-families.csv \
    https://raw.githubusercontent.com/google/fonts/main/tags/all/families.csv
  pipeline/.venv/bin/python pipeline/build_typography_data.py
  node scripts/apply-overlap-removal.mjs \
    --input public/data/typography_data.json --radius 13
"""

import argparse
import csv
import json
import re
from pathlib import Path

import numpy as np

from generate_embeddings_and_umap import compute_knn, reduce_dimensions
from evaluate_with_gf_tags import FORM_THEMES, load_tags

PIPELINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_DIR.parent


def is_notdef_glyph(svg_path: Path) -> bool:
    """True when the glyph is the classic .notdef box: two nested axis-aligned rectangles."""
    d = " ".join(re.findall(r' d="([^"]*)"', svg_path.read_text()))
    if not d.strip():
        return True
    if re.search(r"[QCAHVSTqcahvst]", d):
        return False
    subpaths = [s for s in d.split("Z") if s.strip()]
    if len(subpaths) != 2:
        return False
    boxes = []
    for sub in subpaths:
        pts = [(float(x), float(y)) for x, y in re.findall(r"(-?[\d.]+)[ ,](-?[\d.]+)", sub)]
        xs, ys = {p[0] for p in pts}, {p[1] for p in pts}
        if len(xs) != 2 or len(ys) != 2:
            return False
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    inner, outer = sorted(boxes, key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))
    return inner[0] > outer[0] and inner[1] > outer[1] and inner[2] < outer[2] and inner[3] < outer[3]


GUIDES_SUFFIX = "-guides"

# Subsets that don't indicate a non-Latin primary script.
LATIN_LIKE_SUBSETS = {
    "latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext", "greek", "greek-ext",
    "math", "symbols", "symbols2", "emoji", "music", "braille",
}

# Groups where the heuristic picks a less recognisable family than an equally valid one.
REPRESENTATIVE_OVERRIDES = {
    "khula": "open-sans",
    "mada": "noto-sans-jp",
    "noto-serif-hk": "noto-serif-jp",
}

# Icon, barcode, placeholder and chart fonts: their "A" is not a letter.
NON_TEXT_FONTS = {
    "material-symbols",
    "libre-barcode-39", "libre-barcode-39-text", "libre-barcode-39-extended",
    "libre-barcode-39-extended-text", "libre-barcode-128", "libre-barcode-128-text",
    "flow-block", "flow-circular", "flow-rounded", "redacted", "redacted-script",
    "linefont", "wavefont",
    "yarndings-12", "yarndings-12-charted", "yarndings-20", "yarndings-20-charted",
}

# Google files some families by their primary (often non-Latin) script or by a
# loose genre; these follow the structure of their Latin glyphs instead.
CATEGORY_OVERRIDES = {
    "aoboshi-one": "sans-serif", "mirza": "sans-serif", "marcellus": "sans-serif", "asul": "sans-serif",
    "italiana": "serif", "dorsa": "serif", "nuosu-sil": "serif",
    "qahiri": "handwriting", "sirivennela": "handwriting", "zcool-kuaile": "handwriting",
    "story-script": "handwriting", "sankofa-display": "handwriting",
    "nanum-gothic-coding": "monospace", "cascadia-code": "monospace", "suse-mono": "monospace",
    "sono": "monospace", "atkinson-hyperlegible-mono": "monospace", "m-plus-code-latin": "monospace",
    "doto": "monospace", "bytesized": "monospace", "biz-udgothic": "monospace", "biz-udmincho": "monospace",
    # Display fonts whose dominant tag (Google's or predicted) misfiles their look (visual review).
    **{fid: "decorative" for fid in (
        "irish-grover", "mystery-quest", "joti-one", "piedra", "megrim", "shizuru",
        "alumni-sans-inline-one", "badeen-display", "barriecito", "barrio", "faster-one", "federant",
        "griffy", "henny-penny", "jaini", "jolly-lodger", "moirai-one", "nosifer", "snowburst-one",
        "spirax", "tilt-prism", "trochut", "vibes")},
    **{fid: "sans-serif" for fid in (
        "sansita-swashed", "cherry-cream-soda", "nova-flat", "nova-script", "passero-one",
        "pompiere", "skranji")},
    "ribeye": "serif",
}

# Google Display fonts scoring at least this on /Theme/Wacky are decorative.
WACKY_MIN_SCORE = 70


def find_identical_groups(font_ids, embeddings, max_distance):
    """Connected components (size >= 2) of fonts with cosine distance <= max_distance,
    plus every <base>-guides joined to its <base>."""
    unit = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
    distances = 1.0 - unit @ unit.T
    index = {fid: i for i, fid in enumerate(font_ids)}
    parent = list(range(len(font_ids)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, j in zip(*np.where(np.triu(distances <= max_distance, 1))):
        parent[find(i)] = find(j)

    guides_folded, guides_orphans = [], []
    for fid in font_ids:
        if fid.endswith(GUIDES_SUFFIX):
            base = fid[: -len(GUIDES_SUFFIX)]
            if base in index:
                parent[find(index[fid])] = find(index[base])
                guides_folded.append(fid)
            else:
                guides_orphans.append(fid)

    components = {}
    for i, fid in enumerate(font_ids):
        components.setdefault(find(i), []).append(fid)
    groups = [sorted(members) for members in components.values() if len(members) > 1]

    all_pairs = distances[np.triu_indices(len(font_ids), 1)]
    gap = {
        "max_distance_below": float(all_pairs[all_pairs <= max_distance].max()),
        "min_distance_above": float(all_pairs[all_pairs > max_distance].min()),
    }
    return groups, guides_folded, guides_orphans, gap


def non_latin_script_count(meta):
    return sum(1 for s in meta.get("subsets", []) if s not in LATIN_LIKE_SUBSETS)


def pick_representative(members, font_index):
    """Prefer the font actually designed for Latin: the id that prefixes the most
    other members (noto-sans for noto-sans-*), then fewest non-Latin script subsets,
    then an id containing "latin", then the shortest id, then alphabetical.
    Guides fonts are never picked."""
    candidates = [f for f in members if not f.endswith(GUIDES_SUFFIX)] or members

    def key(fid):
        prefixed = sum(1 for o in members if o.startswith(fid + "-"))
        return (-prefixed, non_latin_script_count(font_index[fid]),
                "latin" not in fid.split("-"), len(fid), fid)

    rep = min(candidates, key=key)
    return REPRESENTATIVE_OVERRIDES.get(rep, rep), rep


def tag_aware_space(embeddings, names, tags, blend, pca_components, seed, metrics=None, metrics_weight=0.0):
    """Blend embeddings with Google Fonts structural-tag probabilities.

    `metrics` (fonts x features, z-scored) are measured proportions from the font
    files; the classifier sees them, and they are appended as their own block
    weighted by `metrics_weight`, so condensed / extended fonts find each other.
    Returns (space, dominant tag per font, whether that tag is predicted,
    the classifier's max class probability per font).
    """
    from sklearn.decomposition import PCA
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    reduced = PCA(pca_components, random_state=seed).fit_transform(embeddings)
    if metrics is not None:
        reduced = np.hstack([reduced, metrics])
    scaled = StandardScaler().fit_transform(reduced)
    tagged = [i for i, n in enumerate(names) if tags.get(n)]
    labels = [max(tags[names[i]], key=tags[names[i]].get) for i in tagged]
    clf = LogisticRegression(max_iter=3000, C=0.3).fit(scaled[tagged], labels)
    raw_proba = clf.predict_proba(scaled)
    proba = np.sqrt(raw_proba)

    def unit(a):
        return a / np.linalg.norm(a, axis=1, keepdims=True)

    blocks = [(1 - blend) * unit(embeddings), blend * unit(proba)]
    if metrics is not None and metrics_weight > 0:
        blocks.append(metrics_weight * unit(metrics))
    space = np.hstack(blocks)
    dominant = list(clf.classes_[proba.argmax(1)])
    predicted = [True] * len(names)
    for i, label in zip(tagged, labels):
        dominant[i], predicted[i] = label, False
    print(f"Tag-aware space: {len(tagged)}/{len(names)} fonts tagged, "
          f"{len(clf.classes_)} tags, blend {blend}")
    return space, dominant, predicted, raw_proba.max(1)


def load_tag_scores(path, tag):
    """family name -> score for one tag; family-wide rows win over axis-specific ones."""
    base, axis = {}, {}
    with open(path, newline="") as f:
        for row in csv.reader(f):
            if len(row) >= 4 and row[2] == tag:
                target = axis if row[1] else base
                target[row[0]] = max(float(row[3]), target.get(row[0], 0.0))
    return {**axis, **base}


SEARCH_TAG_MIN_SCORE = 50
SEARCH_THEMES = FORM_THEMES + ("/Theme/Wacky",)
SEARCH_TAGS_METADATA = {
    "min_score": SEARCH_TAG_MIN_SCORE,
    "rule": (f"`tags`: Google Fonts structural tags and form themes (incl. Wacky) scoring >= "
             f"{SEARCH_TAG_MIN_SCORE}, strongest first, plus the dominant real style_tag; "
             "predicted tags only live in style_tag (style_tag_predicted = true)"),
}


def load_search_tags(path, min_score=SEARCH_TAG_MIN_SCORE):
    """family name -> [tag, ...] (e.g. "Sans/Humanist"), strongest first, for
    structural tags and form themes scoring at least `min_score`."""
    tags = load_tags(path, themes=SEARCH_THEMES, theme_min_score=min_score)
    return {
        family: [tag.strip("/") for tag, score in sorted(scores.items(), key=lambda kv: -kv[1])
                 if score >= min_score]
        for family, scores in tags.items()
    }


def font_search_tags(search_tags, family, style_tag, style_tag_predicted):
    """Real Google Fonts tags for a font's search index. The dominant real tag is
    always listed, even below the score threshold; predicted tags are not (they
    stay in style_tag with style_tag_predicted = True)."""
    tags = list(search_tags.get(family, []))
    if style_tag and not style_tag_predicted and style_tag not in tags:
        tags.insert(0, style_tag)
    return tags


def structural_category(category, style_tag, wacky_score=0.0):
    """Replace Google's usage-based "display" category with one following the
    font's Latin structure, read from its dominant style tag. Blackletter is its
    own class whatever Google files it under; strongly Wacky display fonts are
    decorative."""
    if style_tag == "Theme/Blackletter":
        return "blackletter"
    if category != "display":
        return category
    if wacky_score >= WACKY_MIN_SCORE:
        return "decorative"
    group = style_tag.split("/")[0] if style_tag else None
    return {"Sans": "sans-serif", "Serif": "serif", "Slab": "serif",
            "Script": "handwriting", "Monospace": "monospace"}.get(group, "decorative")


STRUCTURAL_CATEGORY_RULE = (
    f"Theme/Blackletter tag -> blackletter; Google 'display' fonts with a Google "
    f"/Theme/Wacky score >= {WACKY_MIN_SCORE} -> decorative; other 'display' fonts by dominant tag: "
    "Sans/* -> sans-serif, Serif/* and Slab/* -> serif, Script/* -> handwriting, "
    "Monospace/* -> monospace, other Theme/* or no tag -> decorative; "
    "manual category_overrides win"
)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--embeddings", type=Path, default=PIPELINE_DIR / "output/data/embeddings_fontclip.npz")
    parser.add_argument("--font-index", type=Path, default=PIPELINE_DIR / "input/font-index.json")
    parser.add_argument("--char-dir", type=Path, default=PIPELINE_DIR / "output/svgs",
                        help="Rendered <font-id>_a.svg glyphs, used to detect .notdef boxes")
    parser.add_argument("--output", type=Path, default=REPO_ROOT / "public/data/typography_data.json")
    parser.add_argument("--pca", type=int, default=50)
    parser.add_argument("--umap-neighbors", type=int, default=12)
    parser.add_argument("--umap-min-dist", type=float, default=1.0)
    parser.add_argument("--knn-k", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--identical-max-distance", type=float, default=1e-4,
                        help="Max cosine distance for two fonts to count as the same Latin render")
    parser.add_argument("--layout", choices=["tsne", "umap"], default="tsne")
    parser.add_argument("--tsne-perplexity", type=float, default=15)
    parser.add_argument("--tags", type=Path, default=PIPELINE_DIR / "input/gf-tags-families.csv",
                        help="Google Fonts tags/all/families.csv")
    parser.add_argument("--tag-blend", type=float, default=0.5,
                        help="Weight of the tag probabilities in the map space (0 = embeddings only)")
    parser.add_argument("--metrics", type=Path, default=PIPELINE_DIR / "output/data/font_metrics.json",
                        help="Output of compute_font_metrics.py; ignored if missing")
    parser.add_argument("--metrics-weight", type=float, default=0.2,
                        help="Weight of the measured-proportions block (width, x-height, ...)")
    args = parser.parse_args()

    data = np.load(args.embeddings, allow_pickle=True)
    all_ids = [str(i) for i in data["font_ids"]]
    all_embeddings = data["embeddings"].astype(np.float32)
    font_index = json.loads(args.font_index.read_text())

    missing_meta = [fid for fid in all_ids if fid not in font_index]
    if missing_meta:
        raise SystemExit(f"Fonts missing from font-index.json: {missing_meta}")

    unknown = (NON_TEXT_FONTS | CATEGORY_OVERRIDES.keys()) - set(all_ids)
    if unknown:
        raise SystemExit(f"Unknown ids in NON_TEXT_FONTS / CATEGORY_OVERRIDES: {sorted(unknown)}")
    notdef = [fid for fid in all_ids if is_notdef_glyph(args.char_dir / f"{fid}_a.svg")]
    non_text = sorted(NON_TEXT_FONTS)
    kept_mask = [fid not in notdef and fid not in NON_TEXT_FONTS for fid in all_ids]
    ids = [fid for fid, keep in zip(all_ids, kept_mask) if keep]
    embeddings = all_embeddings[np.array(kept_mask)]

    groups, guides_folded, guides_orphans, gap = find_identical_groups(
        ids, embeddings, args.identical_max_distance)
    merged = {}
    overrides_applied = {}
    for members in sorted(groups, key=lambda m: (-len(m), m)):
        rep, heuristic_rep = pick_representative(members, font_index)
        if rep != heuristic_rep:
            overrides_applied[heuristic_rep] = rep
        merged[rep] = [f for f in members if f != rep]
        mixed = len({f.split("-")[0] for f in members}) > 1
        print(f"  {'*' if mixed else ' '} {rep:<28} <- {', '.join(merged[rep])}")
    folded = {alias: rep for rep, aliases in merged.items() for alias in aliases}

    shown_mask = np.array([fid not in folded for fid in ids])
    shown_ids = [fid for fid, keep in zip(ids, shown_mask) if keep]
    shown_embeddings = embeddings[shown_mask]

    print(f"Embeddings: {len(all_ids)} fonts")
    print(f"Excluded (.notdef glyph, no Latin): {len(notdef)} -> {notdef}")
    print(f"Excluded (non-text fonts): {len(non_text)}")
    print(f"Identical-render groups: {len(groups)} (largest: {max(len(m) for m in groups)}), "
          f"folded {len(folded)} fonts; overrides: {overrides_applied}")
    print(f"Guides folded into their base: {len(guides_folded)}; without base: {guides_orphans}")
    print(f"Threshold gap: max pair <= threshold {gap['max_distance_below']:.3e}, "
          f"min pair > threshold {gap['min_distance_above']:.3e}")
    print(f"Shown: {len(shown_ids)} fonts")

    shown_names = [font_index[fid]["family"] for fid in shown_ids]
    style_tags, style_predicted = [None] * len(shown_ids), [None] * len(shown_ids)
    style_confidence = [None] * len(shown_ids)
    space, space_metric = shown_embeddings, "cosine"
    metrics = None
    if args.metrics.exists():
        measured = json.loads(args.metrics.read_text())
        raw = np.array([[measured["fonts"].get(fid, {}).get(k, np.nan) for k in measured["features"]]
                        for fid in shown_ids])
        raw = np.where(np.isnan(raw), np.nanmean(raw, axis=0), raw)
        metrics = (raw - raw.mean(0)) / (raw.std(0) + 1e-9)
        print(f"Font metrics: {measured['features']}, missing for "
              f"{sum(fid not in measured['fonts'] for fid in shown_ids)} fonts (filled with the mean)")
    if args.tag_blend > 0:
        space, style_tags, style_predicted, style_confidence = tag_aware_space(
            shown_embeddings, shown_names, load_tags(args.tags, themes=FORM_THEMES), args.tag_blend, args.pca, args.seed,
            metrics, args.metrics_weight)
        space_metric = "euclidean"

    if args.layout == "tsne":
        from sklearn.manifold import TSNE
        coords_2d = TSNE(2, perplexity=args.tsne_perplexity, metric=space_metric, init="pca",
                         random_state=args.seed).fit_transform(space)
    else:
        _, coords_2d = reduce_dimensions(
            space,
            pca_components=args.pca,
            umap_neighbors=args.umap_neighbors,
            umap_min_dist=args.umap_min_dist,
            random_state=args.seed,
        )
    if space_metric == "cosine":
        knn_indices, _ = compute_knn(space, k=args.knn_k)
    else:
        from sklearn.neighbors import NearestNeighbors
        knn_indices = NearestNeighbors(n_neighbors=args.knn_k + 1).fit(space).kneighbors(
            space, return_distance=False)[:, 1:]

    wacky_scores = load_tag_scores(args.tags, "/Theme/Wacky")
    search_tags = load_search_tags(args.tags)
    fonts = []
    category_changes = {}
    wacky_decorative = []
    for i, fid in enumerate(shown_ids):
        meta = font_index[fid]
        display_name = meta["family"]
        style_tag = style_tags[i].strip("/") if style_tags[i] else None
        structural = structural_category(meta["category"], style_tag, wacky_scores.get(display_name, 0.0))
        if fid not in CATEGORY_OVERRIDES and structural != structural_category(meta["category"], style_tag):
            wacky_decorative.append(fid)
        category = CATEGORY_OVERRIDES.get(fid) or structural
        if category != meta["category"] and fid not in CATEGORY_OVERRIDES:
            change = f"{meta['category']} -> {category}"
            category_changes[change] = category_changes.get(change, 0) + 1
        fonts.append({
            "id": fid,
            "name": display_name,
            "imageName": fid,
            "family": category,
            "google_category": meta["category"],
            "x": float(coords_2d[i, 0]),
            "y": float(coords_2d[i, 1]),
            "neighbors": [shown_ids[j] for j in knn_indices[i]],
            "google_fonts_url": f"https://fonts.google.com/specimen/{display_name.replace(' ', '+')}",
            "weights": meta.get("weights", []),
            "styles": meta.get("styles", []),
            "subsets": meta.get("subsets", []),
            "aliases": [font_index[a]["family"] for a in merged.get(fid, [])],
            "alias_ids": merged.get(fid, []),
            "style_tag": style_tag,
            "style_tag_predicted": style_predicted[i],
            "style_tag_confidence": (round(float(style_confidence[i]), 3)
                                     if style_confidence[i] is not None else None),
            "tags": font_search_tags(search_tags, display_name, style_tag, style_predicted[i]),
        })
    category_counts = {}
    for font in fonts:
        category_counts[font["family"]] = category_counts.get(font["family"], 0) + 1
    print(f"Categories: {dict(sorted(category_counts.items(), key=lambda kv: -kv[1]))}")
    print(f"Structural recategorisation: {dict(sorted(category_changes.items(), key=lambda kv: -kv[1]))}")
    print(f"Wacky >= {WACKY_MIN_SCORE} -> decorative: {len(wacky_decorative)} -> {wacky_decorative}")

    output = {
        "config": {
            "layout": args.layout,
            "tsnePerplexity": args.tsne_perplexity if args.layout == "tsne" else None,
            "nNeighbors": args.umap_neighbors if args.layout == "umap" else None,
            "minDist": args.umap_min_dist if args.layout == "umap" else None,
            "metric": space_metric,
            "tagBlend": args.tag_blend,
            "metricsWeight": args.metrics_weight if metrics is not None and args.tag_blend > 0 else 0,
            "enableFontFusion": True,
            "testName": f"fontclip-{args.layout}-tags{args.tag_blend}",
            "randomSeed": args.seed,
        },
        "metadata": {
            "method": f"{args.layout}_from_fontclip_python",
            "model": "FontCLIP ViT-B/32 (fine-tuned for typography)",
            "pca_components": args.pca,
            "knn_neighbors": args.knn_k,
            "total_fonts": len(fonts),
            "note": "FontCLIP embeddings blended with Google Fonts structural-tag probabilities "
                    "(logistic regression) and measured proportions from the font files "
                    "(width, x-height), laid out with t-SNE; neighbours are k-NN in the "
                    "same space. Fonts with identical Latin renders (and Playwrite Guides) "
                    "are folded into one representative, listed in its `aliases`.",
            "fusion": {
                "strategy": "identical-latin-render + guides",
                "identical_max_cosine_distance": args.identical_max_distance,
                "threshold_gap": gap,
                "groups": len(groups),
                "largest_group": max(len(m) for m in groups),
                "folded_fonts": len(folded),
                "guides_folded": len(guides_folded),
                "guides_without_base": guides_orphans,
                "representative_overrides": overrides_applied,
                "merged": merged,
                "excluded_notdef": notdef,
                "excluded_non_text": non_text,
                "category_overrides": CATEGORY_OVERRIDES,
            },
            "structural_categories": {
                "rule": STRUCTURAL_CATEGORY_RULE,
                "wacky_min_score": WACKY_MIN_SCORE,
                "wacky_decorative": wacky_decorative,
                "changes": category_changes,
                "counts": category_counts,
            },
            "search_tags": SEARCH_TAGS_METADATA,
        },
        "fonts": fonts,
    }

    args.output.write_text(json.dumps(output, indent=2))
    print(f"Written {len(fonts)} fonts to {args.output}")


if __name__ == "__main__":
    main()

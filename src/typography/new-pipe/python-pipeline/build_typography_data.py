#!/usr/bin/env python3
"""
Build public/data/typography_data.json from the precomputed FontCLIP embeddings.

Every Google Fonts family is its own entry. The only fonts that are folded
into another one are "render variants": fonts whose id extends another font's
id (e.g. noto-sans-carian -> noto-sans, hind-madurai -> hind, anton-sc -> anton)
AND whose rendered specimen is visually identical to it (cosine distance
between FontCLIP embeddings <= --variant-max-distance). The base font always
keeps its own embedding, image, name and category.

Fonts whose rendered "a" is the .notdef box (no Latin glyphs, e.g. Khmer or
Myanmar-only fonts) are excluded, since their position would be meaningless.

Pipeline: embeddings (512D) -> PCA(50) -> UMAP(2D, cosine, spectral init)
          + k-NN (cosine) in the original 512D space.

Usage (from the repo root):
  src/typography/new-pipe/python-pipeline/.venv/bin/python \
    src/typography/new-pipe/python-pipeline/build_typography_data.py
  node scripts/apply-overlap-removal.mjs \
    --input public/data/typography_data.json --radius 13
"""

import argparse
import json
import re
from pathlib import Path

import numpy as np

from generate_embeddings_and_umap import compute_knn, reduce_dimensions

REPO_ROOT = Path(__file__).resolve().parents[4]
NEW_PIPE = REPO_ROOT / "src" / "typography" / "new-pipe"


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


def find_render_variants(font_ids, embeddings, max_distance):
    """Map variant id -> root base id for near-identical renders sharing an id prefix."""
    index = {fid: i for i, fid in enumerate(font_ids)}
    unit = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

    parent = {}
    for fid in font_ids:
        parts = fid.split("-")
        for k in range(len(parts) - 1, 0, -1):
            base = "-".join(parts[:k])
            if base not in index:
                continue
            distance = 1.0 - float(unit[index[fid]] @ unit[index[base]])
            if distance <= max_distance:
                parent[fid] = base
                break

    def root(fid):
        while fid in parent:
            fid = parent[fid]
        return fid

    return {fid: root(fid) for fid in parent}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--embeddings", type=Path, default=NEW_PIPE / "output/data/embeddings_fontclip.npz")
    parser.add_argument("--font-index", type=Path, default=NEW_PIPE / "input/font-index.json")
    parser.add_argument("--char-dir", type=Path, default=REPO_ROOT / "public/data/char")
    parser.add_argument("--output", type=Path, default=REPO_ROOT / "public/data/typography_data.json")
    parser.add_argument("--pca", type=int, default=50)
    parser.add_argument("--umap-neighbors", type=int, default=12)
    parser.add_argument("--umap-min-dist", type=float, default=1.0)
    parser.add_argument("--knn-k", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--variant-max-distance", type=float, default=5e-5,
                        help="Max cosine distance for folding a prefixed font into its base")
    args = parser.parse_args()

    data = np.load(args.embeddings, allow_pickle=True)
    all_ids = [str(i) for i in data["font_ids"]]
    all_embeddings = data["embeddings"].astype(np.float32)
    font_index = json.loads(args.font_index.read_text())

    missing_meta = [fid for fid in all_ids if fid not in font_index]
    if missing_meta:
        raise SystemExit(f"Fonts missing from font-index.json: {missing_meta}")

    notdef = [fid for fid in all_ids if is_notdef_glyph(args.char_dir / f"{fid}_a.svg")]
    kept_mask = [fid not in notdef for fid in all_ids]
    ids = [fid for fid, keep in zip(all_ids, kept_mask) if keep]
    embeddings = all_embeddings[np.array(kept_mask)]

    variants = find_render_variants(ids, embeddings, args.variant_max_distance)
    merged = {}
    for variant, base in sorted(variants.items()):
        merged.setdefault(base, []).append(variant)
        if font_index[variant]["category"] != font_index[base]["category"]:
            print(f"  note: {variant} ({font_index[variant]['category']}) folded into "
                  f"{base} ({font_index[base]['category']})")

    shown_mask = np.array([fid not in variants for fid in ids])
    shown_ids = [fid for fid, keep in zip(ids, shown_mask) if keep]
    shown_embeddings = embeddings[shown_mask]

    print(f"Embeddings: {len(all_ids)} fonts")
    print(f"Excluded (.notdef glyph, no Latin): {len(notdef)} -> {notdef}")
    print(f"Folded render variants: {len(variants)} into {len(merged)} base fonts")
    print(f"Shown: {len(shown_ids)} fonts")

    _, coords_2d = reduce_dimensions(
        shown_embeddings,
        pca_components=args.pca,
        umap_neighbors=args.umap_neighbors,
        umap_min_dist=args.umap_min_dist,
        random_state=args.seed,
    )
    knn_indices, _ = compute_knn(shown_embeddings, k=args.knn_k)

    fonts = []
    for i, fid in enumerate(shown_ids):
        meta = font_index[fid]
        display_name = meta["family"]
        fonts.append({
            "id": fid,
            "name": display_name,
            "imageName": fid,
            "family": meta["category"],
            "x": float(coords_2d[i, 0]),
            "y": float(coords_2d[i, 1]),
            "neighbors": [shown_ids[j] for j in knn_indices[i]],
            "google_fonts_url": f"https://fonts.google.com/specimen/{display_name.replace(' ', '+')}",
            "weights": meta.get("weights", []),
            "styles": meta.get("styles", []),
            "subsets": meta.get("subsets", []),
        })

    output = {
        "config": {
            "nNeighbors": args.umap_neighbors,
            "minDist": args.umap_min_dist,
            "metric": "cosine",
            "enableFontFusion": True,
            "testName": "fontclip-spectral",
            "randomSeed": args.seed,
        },
        "metadata": {
            "method": "umap_from_fontclip_python",
            "model": "FontCLIP ViT-B/32 (fine-tuned for typography)",
            "pca_components": args.pca,
            "knn_neighbors": args.knn_k,
            "umap_init": "spectral",
            "total_fonts": len(fonts),
            "note": "FontCLIP embeddings with spectral UMAP and high-dim k-NN. "
                    "Only near-identical render variants are folded into their base font.",
            "fusion": {
                "strategy": "render-variants",
                "variant_max_cosine_distance": args.variant_max_distance,
                "merged": merged,
                "excluded_notdef": notdef,
            },
        },
        "fonts": fonts,
    }

    args.output.write_text(json.dumps(output, indent=2))
    print(f"Written {len(fonts)} fonts to {args.output}")


if __name__ == "__main__":
    main()

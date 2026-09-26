#!/usr/bin/env python3
"""
Measure typographic proportions straight from the font files, as features that
image embeddings miss (fit-to-width renders hide how condensed a font is).

Per font, relative to the em (units per em):
- lc_width / uc_width: mean advance width of a-z / A-Z
- x_height, cap_height: bounding-box height of "x" / "H"
- x_over_cap: x-height / cap-height
- mono: 1 if a-z and A-Z share one advance width
- italic_angle: post table, degrees

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/compute_font_metrics.py
"""

import argparse
import json
import string
from pathlib import Path

import numpy as np
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

PIPELINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_DIR.parent
FEATURES = ["lc_width", "uc_width", "x_height", "cap_height", "x_over_cap", "mono", "italic_angle"]


def glyph_height(font, glyph_set, char):
    name = font.getBestCmap().get(ord(char))
    if not name:
        return None
    pen = BoundsPen(glyph_set)
    glyph_set[name].draw(pen)
    return None if pen.bounds is None else pen.bounds[3] - pen.bounds[1]


def measure(path):
    font = TTFont(str(path), lazy=True)
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    glyph_set = font.getGlyphSet()

    def advances(chars):
        return [hmtx[cmap[ord(c)]][0] for c in chars if ord(c) in cmap]

    lc, uc = advances(string.ascii_lowercase), advances(string.ascii_uppercase)
    if len(lc) < 20 or len(uc) < 20:
        return None
    x_h = glyph_height(font, glyph_set, "x") or 0
    cap_h = glyph_height(font, glyph_set, "H") or 0
    return {
        "lc_width": float(np.mean(lc)) / upm,
        "uc_width": float(np.mean(uc)) / upm,
        "x_height": x_h / upm,
        "cap_height": cap_h / upm,
        "x_over_cap": x_h / cap_h if cap_h else 0.0,
        "mono": float(len(set(lc + uc)) == 1),
        "italic_angle": float(font["post"].italicAngle),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fonts-dir", type=Path, default=PIPELINE_DIR / "output/fonts")
    parser.add_argument("--output", type=Path, default=PIPELINE_DIR / "output/data/font_metrics.json")
    args = parser.parse_args()

    metrics, failed = {}, []
    for folder in sorted(p for p in args.fonts_dir.iterdir() if p.is_dir()):
        files = sorted(folder.glob("*-400-normal-latin.truetype")) or sorted(folder.glob("*.truetype"))
        try:
            m = measure(files[0]) if files else None
        except Exception:
            m = None
        if m:
            metrics[folder.name] = m
        else:
            failed.append(folder.name)
    args.output.write_text(json.dumps({"features": FEATURES, "fonts": metrics}, indent=1))
    print(f"Measured {len(metrics)} fonts, failed {len(failed)}: {failed[:15]}")


if __name__ == "__main__":
    main()

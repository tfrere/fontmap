#!/usr/bin/env python3
"""
Add the search `tags` field to an existing typography_data.json in place,
without rebuilding the layout (x / y and everything else stay untouched).

Same field as build_typography_data.py writes; use this when only the tag
index changed, since a full rebuild re-runs t-SNE and the overlap removal.

Usage (from the repo root):
  pipeline/.venv/bin/python pipeline/add_search_tags.py
"""

import argparse
import json
from pathlib import Path

from build_typography_data import (PIPELINE_DIR, REPO_ROOT, SEARCH_TAGS_METADATA, font_search_tags,
                                   load_search_tags)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=REPO_ROOT / "public/data/typography_data.json")
    parser.add_argument("--tags", type=Path, default=PIPELINE_DIR / "input/gf-tags-families.csv")
    args = parser.parse_args()

    data = json.loads(args.data.read_text())
    search_tags = load_search_tags(args.tags)
    for font in data["fonts"]:
        font["tags"] = font_search_tags(search_tags, font["name"], font.get("style_tag"),
                                        font.get("style_tag_predicted"))
    data["metadata"]["search_tags"] = SEARCH_TAGS_METADATA

    args.data.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    tagged = sum(1 for f in data["fonts"] if f["tags"])
    total = sum(len(f["tags"]) for f in data["fonts"])
    print(f"Tagged {tagged}/{len(data['fonts'])} fonts ({total} tags) in {args.data}")


if __name__ == "__main__":
    main()

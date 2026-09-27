#!/usr/bin/env python3
"""
Brand assets for FontMap, drawn from the real font files the pipeline downloads:
- media/brand/fontmap-cycle.gif: 240 x 240 "A" cycling through fonts (Product Hunt thumbnail)
- media/brand/logo-light.png / logo-dark.png: 1024 x 1024 still of the mark
- public/fontmap-icon.ico (16/32/48), public/logo192.png, public/logo512.png

Usage (from the repo root):
  pipeline/.venv/bin/python media/scripts/make-brand-assets.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONTS_DIR = ROOT / "pipeline/output/fonts"
OUT = ROOT / "media/brand"

PAPER = (252, 251, 248)
INK = (17, 17, 17)
DARK_BG = (18, 17, 16)
CATEGORY = {
    "sans-serif": (52, 152, 219), "serif": (231, 76, 60), "handwriting": (155, 89, 182),
    "monospace": (46, 204, 113), "decorative": (243, 156, 18), "blackletter": (232, 67, 147),
}

# One strong, recognisable "A" per style, alternating categories so each cut is visible
SEQUENCE = [
    ("playfair-display", "serif"), ("bebas-neue", "sans-serif"), ("pacifico", "handwriting"),
    ("space-mono", "monospace"), ("unifrakturmaguntia", "blackletter"), ("press-start-2p", "decorative"),
    ("abril-fatface", "serif"), ("inter", "sans-serif"), ("great-vibes", "handwriting"),
    ("fira-code", "monospace"), ("creepster", "decorative"), ("merriweather", "serif"),
    ("montserrat", "sans-serif"), ("lobster", "handwriting"), ("pirata-one", "blackletter"),
    ("bungee", "decorative"),
]
MARK_FONT = "playfair-display"
ICON_FONT = "abril-fatface"  # heavier serif, readable at 16 px
FRAME_MS = 420
SS = 4  # supersampling factor


def font_file(font_id):
    folder = FONTS_DIR / font_id
    files = sorted(folder.glob("*-400-normal-latin.truetype")) or sorted(folder.glob("*.truetype"))
    if not files:
        raise SystemExit(f"No font file for {font_id} in {folder}")
    return files[0]


def draw_glyph(size, font_id, bg, fg, dot=None, glyph_ratio=0.56, dot_ratio=0.04, corner=0.0):
    """Fit the ink bounding box of "A" in a square box of glyph_ratio x size; with a dot,
    the box sits higher and the category dot stays at a fixed spot so cuts don't jump."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if corner:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * corner), fill=bg)
    else:
        d.rectangle([0, 0, S, S], fill=bg)

    target = S * glyph_ratio
    font = ImageFont.truetype(str(font_file(font_id)), size=int(target))
    l, t, r, b = d.textbbox((0, 0), "A", font=font)
    scale = target / max(r - l, b - t)
    font = ImageFont.truetype(str(font_file(font_id)), size=max(8, int(target * scale)))
    l, t, r, b = d.textbbox((0, 0), "A", font=font)
    w, h = r - l, b - t
    centre_y = S * 0.44 if dot else S / 2
    d.text(((S - w) / 2 - l, centre_y - h / 2 - t), "A", font=font, fill=fg)

    if dot:
        rad = S * dot_ratio
        cx, cy = S / 2, S * 0.84
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=dot)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    frames = [draw_glyph(240, fid, PAPER, INK, CATEGORY[cat]).convert("RGB") for fid, cat in SEQUENCE]
    frames[0].save(OUT / "fontmap-cycle.gif", save_all=True, append_images=frames[1:],
                   duration=FRAME_MS, loop=0, optimize=True)
    big = [draw_glyph(720, fid, PAPER, INK, CATEGORY[cat]).convert("RGB") for fid, cat in SEQUENCE]
    big[0].save(OUT / "fontmap-cycle-720.gif", save_all=True, append_images=big[1:],
                duration=FRAME_MS, loop=0, optimize=True)

    draw_glyph(1024, MARK_FONT, PAPER, INK, CATEGORY["serif"], corner=0.22).save(OUT / "logo-light.png")
    draw_glyph(1024, MARK_FONT, DARK_BG, PAPER, CATEGORY["serif"], corner=0.22).save(OUT / "logo-dark.png")

    # Favicon: no dot (unreadable at 16 px), bigger glyph, dark tile for contrast on any tab bar
    icon = lambda s: draw_glyph(s, ICON_FONT, INK, PAPER, glyph_ratio=0.76, corner=0.2)
    icon(48).save(ROOT / "public/fontmap-icon.ico", sizes=[(16, 16), (32, 32), (48, 48)],
                  append_images=[icon(16), icon(32)])
    draw_glyph(192, MARK_FONT, INK, PAPER, CATEGORY["serif"], corner=0.2).save(ROOT / "public/logo192.png")
    draw_glyph(512, MARK_FONT, INK, PAPER, CATEGORY["serif"], corner=0.2).save(ROOT / "public/logo512.png")
    icon(64).save(OUT / "favicon-preview-64.png")
    print("ok")


if __name__ == "__main__":
    main()

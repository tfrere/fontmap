"""Compose the 1200x630 social preview card (public/og-image.png).

Input: /tmp/fontmap-og/map-bare.png from media/scripts/capture-og-image.mjs.
Run from the repo root: pipeline/.venv/bin/python media/scripts/make-og-image.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MAP_PNG = Path("/tmp/fontmap-og/map-bare.png")
OUT = ROOT / "public" / "og-image.png"
FONTS = ROOT / "pipeline" / "output" / "fonts"

W, H = 1200, 630
S = 2  # supersampling
BG = (247, 245, 241)  # map background, sampled from the capture
INK = (17, 17, 17)
MUTED = (110, 106, 100)


def inter(size, weight):
    # Static weights from Fontsource: curl -L -o /tmp/fontmap-og/fonts/inter-<w>.ttf
    #   https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-<w>-normal.ttf
    path = Path(f"/tmp/fontmap-og/fonts/inter-{weight}.ttf")
    if not path.exists():
        path = FONTS / "inter" / "inter-400-normal-latin.truetype"
    return ImageFont.truetype(str(path), size * S)


def content_bbox(img, bg, tol=10):
    """Bounding box of pixels that differ from the background."""
    diff = Image.eval(img.convert("L"), lambda v: 255 if abs(v - sum(bg) // 3) > tol else 0)
    return diff.getbbox()


card = Image.new("RGB", (W * S, H * S), BG)

map_img = Image.open(MAP_PNG).convert("RGB")
map_img = map_img.crop(content_bbox(map_img, BG))
target_w = int(W * S * 0.60)
target_h = int(map_img.height * target_w / map_img.width)
map_img = map_img.resize((target_w, target_h), Image.LANCZOS)
map_x = int(W * S * 0.37)
card.paste(map_img, (map_x, (H * S - target_h) // 2 + 10 * S))

# Soft fade so the map's left edge doesn't collide with the text column
fade_w = 120 * S
fade = Image.new("L", (fade_w, H * S))
for x in range(fade_w):
    ImageDraw.Draw(fade).line([(x, 0), (x, H * S)], fill=int(255 * (1 - x / fade_w) ** 1.5))
card.paste(Image.new("RGB", (fade_w, H * S), BG), (map_x, 0), fade)
ImageDraw.Draw(card).rectangle([0, 0, map_x, H * S], fill=BG)

draw = ImageDraw.Draw(card)
x0 = 64 * S
draw.text((x0, 150 * S), "FontMap", font=inter(84, 800), fill=INK)
lines = ["1,465 Google Fonts,", "mapped by how", "they look."]
y = 268 * S
for line in lines:
    draw.text((x0, y), line, font=inter(34, 500), fill=INK)
    y += 44 * S
draw.text((x0, 440 * S), "Find similar typefaces in one click", font=inter(20, 500), fill=MUTED)

card.resize((W, H), Image.LANCZOS).save(OUT, optimize=True)
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")

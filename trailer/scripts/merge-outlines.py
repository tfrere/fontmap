"""Merges the overlapping contours of every glyph in assets/data.js, and of the end-card
wordmark in assets/logo.js, into one outline.

Many sprites draw a crossbar or a serif as its own contour laid over the stems. Filled,
that looks right; stroked (hairlines, the construction view) the overlap shows as lines
through the letter. Each merged outline is rasterised against the original (non-zero
fill, as the canvas draws it) and the original is kept if they differ; this catches the
odd glitch face, like Rubik Broken Fax, that the boolean operation misreads.
build-data.mjs and build-logo.mjs run it.

    pip install skia-pathops fonttools freetype-py numpy
    python3 scripts/merge-outlines.py
"""
import json
import sys
from pathlib import Path

import pathops
from fontTools.pens.basePen import BasePen
from fontTools.pens.freetypePen import FreeTypePen
from fontTools.svgLib.path import parse_path

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
MAX_DIFF = 0.03


class RelativePen(BasePen):
    """Compact SVG path in relative commands, 0.1 unit precision, like the source sprites.
    BasePen splits runs of quadratic off-curve points into single segments."""

    def __init__(self):
        super().__init__(None)
        self.out, self.cmd, self.last, self.cur, self.start = [], '', None, (0, 0), (0, 0)

    @staticmethod
    def tenths(pt):
        return round(pt[0] * 10), round(pt[1] * 10)

    @staticmethod
    def num(n):
        s = f'{abs(n) / 10:.1f}'.rstrip('0').rstrip('.')
        s = s[1:] if s.startswith('0.') else s
        return ('-' if n < 0 else '') + s

    def emit(self, cmd, nums):
        text = '' if cmd == self.cmd and cmd != 'm' else cmd
        prev = None if text else self.last
        for n in map(self.num, nums):
            if prev is not None and not n.startswith('-') and not ('.' in prev and n.startswith('.')):
                text += ' '
            text += n
            prev = n
        self.out.append(text)
        self.cmd = cmd
        self.last = prev

    def rel(self, pts):
        nums = []
        for pt in pts:
            nums += [pt[0] - self.cur[0], pt[1] - self.cur[1]]
        return nums

    def _moveTo(self, pt):
        pt = self.tenths(pt)
        self.emit('m', self.rel([pt]))
        self.cur = self.start = pt

    def _lineTo(self, pt):
        pt = self.tenths(pt)
        dx, dy = self.rel([pt])
        if dx == 0 and dy == 0:
            return
        if dy == 0:
            self.emit('h', [dx])
        elif dx == 0:
            self.emit('v', [dy])
        else:
            self.emit('l', [dx, dy])
        self.cur = pt

    def _curveToOne(self, *pts):
        pts = [self.tenths(p) for p in pts]
        self.emit('c', self.rel(pts))
        self.cur = pts[-1]

    def _qCurveToOne(self, *pts):
        pts = [self.tenths(p) for p in pts]
        self.emit('q', self.rel(pts))
        self.cur = pts[-1]

    def _closePath(self):
        self.emit('z', [])
        self.cur = self.start

    _endPath = _closePath

    def path(self):
        return ''.join(self.out)


def merge(d):
    if not d:
        return d
    path = pathops.Path()
    parse_path(d, path.getPen())
    path.fillType = pathops.FillType.WINDING
    merged = pathops.simplify(path, fix_winding=True, keep_starting_points=True)
    pen = RelativePen()
    merged.draw(pen)
    return pen.path()


def raster(d, bounds):
    x0, y0, x1, y1 = bounds
    k = 320 / max(x1 - x0, y1 - y0, 1e-6)
    pen = FreeTypePen(None)
    parse_path(d, pen)
    return pen.array(width=int((x1 - x0) * k) + 2, height=int((y1 - y0) * k) + 2, transform=(k, 0, 0, k, -x0 * k + 1, -y0 * k + 1))


def diff(a, b):
    path = pathops.Path()
    parse_path(a, path.getPen())
    ra, rb = raster(a, path.bounds), raster(b, path.bounds)
    return float(abs(ra - rb).sum() / max(ra.sum(), 1e-6))


def checked(d, name):
    """The merged outline, or the original if merging fails or changes the filled shape."""
    try:
        m = merge(d)
        off = diff(d, m)
    except Exception as e:
        print(f'{name}: kept, {e}', file=sys.stderr)
        return d
    if off > MAX_DIFF:
        print(f'{name}: kept, merged outline off by {off:.0%}', file=sys.stderr)
        return d
    return m


def load(name, prefix):
    src = (ASSETS / name).read_text()
    return json.loads(src[len(prefix):src.rindex(';')])


def save(name, prefix, data):
    (ASSETS / name).write_text(prefix + json.dumps(data, separators=(',', ':')) + ';\n')


def main():
    data = load('data.js', 'window.FONTMAP_DATA=')
    for char, paths in data['glyphs'].items():
        data['glyphs'][char] = [checked(d, f'{char} {f["id"]}') for d, f in zip(paths, data['fonts'])]
        print(char, len(paths), 'outlines merged')
    save('data.js', 'window.FONTMAP_DATA=', data)

    logo = load('logo.js', 'window.LOGO=')
    logo['d'] = checked(logo['d'], 'logo')
    save('logo.js', 'window.LOGO=', logo)
    print('logo merged')


if __name__ == '__main__':
    main()

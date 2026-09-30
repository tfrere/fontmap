// A designer's territory on the map: a blob around each of their fonts shows where they
// actually work; a dashed convex hull only marks how far apart those places are.

export function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// points and hullPoints are layout coordinates; project maps them to the canvas.
export function paintTerritory(c, { points, hullPoints }, project, radius, ui, pal) {
  c.save();
  c.fillStyle = pal.tint;
  c.beginPath();
  for (const [px, py] of points) {
    const [x, y] = project(px, py);
    c.moveTo(x + radius, y);
    c.arc(x, y, radius, 0, Math.PI * 2);
  }
  c.fill();
  if (hullPoints.length > 1) {
    c.beginPath();
    hullPoints.forEach(([hx, hy], n) => {
      const [x, y] = project(hx, hy);
      if (n === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.closePath();
    c.lineJoin = 'round';
    c.setLineDash([3 * ui, 3 * ui]);
    c.lineWidth = ui;
    c.strokeStyle = pal.ink3;
    c.globalAlpha *= 0.8;
    c.stroke();
  }
  c.restore();
}

// Designers indexed from fonts carrying `designers` and `views` (loadMap with catalog and
// popularity). Fonts are listed most viewed first.
export function indexDesigners(fonts, { minFonts = 1 } = {}) {
  const designers = new Map();
  fonts.forEach((f, i) => {
    for (const name of f.designers || []) {
      if (!designers.has(name)) designers.set(name, { name, fonts: [] });
      designers.get(name).fonts.push(i);
    }
  });
  for (const d of designers.values()) {
    d.fonts.sort((a, c) => fonts[c].views - fonts[a].views);
    d.points = d.fonts.map((i) => [fonts[i].x0, fonts[i].y0]);
    d.hullPoints = hull(d.points);
    d.set = new Set(d.fonts);
    d.views = d.fonts.reduce((s, i) => s + fonts[i].views, 0);
  }
  return [...designers.values()].filter((d) => d.fonts.length >= minFonts);
}

// FontMap trailer: every frame is a pure function of time. draw(ctx, t) paints
// the frame at t seconds; nothing is carried over from one frame to the next.
(function () {
  const T = window.TIMELINE;
  const W = 1920;
  const H = 1080;
  const INK = '#111111';
  const PAPER = '#fcfbf8';

  const MAP_BOX = 24;
  const SCATTER_BOX = 30;
  const GIANT_BOX = 1220;
  const PLACE_AT = 3;

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const expoOut = (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(u)));
  const quartOut = (u) => 1 - Math.pow(1 - clamp(u), 4);
  const cubicInOut = (u) => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };

  // Closed-form damped spring, 0 -> 1 with a small overshoot.
  function spring(t, omega = 8, zeta = 0.72) {
    if (t <= 0) return 0;
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
  }

  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const beatOf = (t) => t / T.BEAT;
  const secOf = (b) => b * T.BEAT;

  let fonts, N, paths, glyphs, index, center, landings, logo, shots;
  let bd = 0;

  function init() {
    const data = window.FONTMAP_DATA;
    fonts = data.fonts;
    N = fonts.length;
    paths = {};
    for (const [char, list] of Object.entries(data.glyphs)) paths[char] = list.map((d) => new Path2D(d));

    index = new Map(fonts.map((f, i) => [f.id, i]));
    center = index.get('playfair-display');

    // Same fit as the app's renderer: uniform scale, y axis flipped.
    const pad = 48;
    const xs = fonts.map((f) => f.x);
    const ys = fonts.map((f) => f.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const scale = Math.min((W - 2 * pad) / (xMax - xMin), (H - 2 * pad) / (yMax - yMin));
    const offX = (W - (xMax - xMin) * scale) / 2;
    const offY = (H - (yMax - yMin) * scale) / 2;

    // Chaos: a jittered grid so disorder still covers the frame evenly.
    const r = rng(1465);
    const cols = Math.ceil(Math.sqrt((N * W) / H));
    const rows = Math.ceil(N / cols);
    const cw = (W + 120) / cols, ch = (H + 80) / rows;
    const cells = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push([-60 + (i + 0.5) * cw, -40 + (j + 0.5) * ch]);
    for (let i = cells.length - 1; i > 0; i--) {
      const k = Math.floor(r() * (i + 1));
      [cells[i], cells[k]] = [cells[k], cells[i]];
    }
    const mcx = W / 2, mcy = H / 2;
    let maxD = 0;
    glyphs = fonts.map((f, i) => {
      const mx = (f.x - xMin) * scale + offX;
      const my = (yMax - f.y) * scale + offY;
      maxD = Math.max(maxD, Math.hypot(mx - mcx, my - mcy));
      return {
        mx, my,
        sx: cells[i][0] + (r() - 0.5) * cw * 0.7,
        sy: cells[i][1] + (r() - 0.5) * ch * 0.7,
        rot: (r() - 0.5) * Math.PI * 1.8,
        scl: 0.55 + r() * 0.95,
        phase: r() * Math.PI * 2,
        jitter: r(),
      };
    });
    Object.assign(glyphs[center], { sx: W / 2, sy: H / 2, rot: 0, scl: 1, phase: 0 });

    // Settling ripples out from the middle of the map.
    let tLand = 0;
    for (let s = 0; s < 3; s += 0.001) if (spring(s) >= 1) { tLand = s; break; }
    landings = [];
    glyphs.forEach((g) => {
      const d = Math.hypot(g.mx - mcx, g.my - mcy) / maxD;
      g.delay = d * 2.2 + g.jitter * 0.45;
      g.sweep = (g.mx / W) * 0.35;
      landings.push(secOf(T.SCENES.order[0] + g.delay) + tLand);
    });
    landings.sort((a, b) => a - b);

    const L = window.LOGO;
    const logoPath = new Path2D(L.d);
    logo = { ...L, path: logoPath, outline: parseOutline(L.d, logoPath, 6) };

    // Camera keyframes after the chaos: a slow push on the map, a flight to each
    // searched region, a dive into one glyph, then back out for the spell.
    const centroid = (tag) => {
      const hits = glyphs.filter((g, i) => fonts[i].style.startsWith(tag));
      return [hits.reduce((a, g) => a + g.mx, 0) / hits.length, hits.reduce((a, g) => a + g.my, 0) / hits.length];
    };
    const dive = glyphs[index.get(T.DIVE.font)];
    shots = [
      { beat: T.SCENES.order[0] + 3, dur: 5, x: W / 2, y: H / 2, z: 1.2 },
      ...T.SEARCHES.map((q) => { const [x, y] = centroid(q.tag); return { beat: q.beat, dur: 0.7, x, y, z: q.zoom }; }),
      { beat: T.DIVE.beat, dur: T.DIVE.hold - T.DIVE.beat, x: dive.mx, y: dive.my, z: GIANT_BOX / MAP_BOX * 0.8 },
      { beat: T.DIVE.out, dur: T.SCENES.spell[0] - T.DIVE.out, x: W / 2, y: H / 2, z: 1.08 },
    ];
  }

  // ---------- drawing helpers ----------

  function font(ctx, size, family, weight = 400, style = 'normal', spacing = 0) {
    ctx.font = `${style} ${weight} ${size}px "${family}"`;
    ctx.letterSpacing = spacing ? `${spacing}px` : '0px';
  }

  function ink(ctx, text) {
    const m = ctx.measureText(text);
    return { l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent, w: m.width };
  }

  // Draws text so its ink box is centred on (cx, cy).
  function textCentered(ctx, text, cx, cy) {
    const b = ink(ctx, text);
    ctx.fillText(text, cx - (b.r - b.l) / 2, cy + (b.a - b.d) / 2);
  }

  function label(ctx, text, x, y, color, align = 'left', alpha = 1, size = 17, halo = 0) {
    font(ctx, size, 'Source Sans 3', 600, 'normal', size * 0.32);
    ctx.textAlign = align;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    if (halo) withHalo(ctx, PAPER, halo, (draw) => draw(text.toUpperCase(), x, y));
    else ctx.fillText(text.toUpperCase(), x, y);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function withHalo(ctx, color, width, fn) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    fn((text, x, y) => ctx.strokeText(text, x, y));
    ctx.restore();
    fn((text, x, y) => ctx.fillText(text, x, y));
  }

  function reveal(ctx, since, dur = 0.18) {
    const u = clamp(since / dur);
    ctx.globalAlpha = u;
    const blur = (1 - expoOut(u)) * 10;
    ctx.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : 'none';
    return (1 - expoOut(u)) * 14;
  }

  function resetFx(ctx) {
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
  }

  function glyph(ctx, path, x, y, box, rot = 0) {
    const k = box / 80;
    const a = Math.cos(rot) * k, b = Math.sin(rot) * k;
    ctx.setTransform(a, b, -b, a, x - (a * 40 - b * 40), y - (b * 40 + a * 40));
    ctx.fill(path);
  }

  const styleOf = (i) => fonts[i].style.replace('/', '  /  ');

  // ---------- intro: one letter, in motion ----------

  // Draws a glyph so that point (fx, fy) of its 80-unit box lands on (cx, cy).
  function glyphAt(ctx, path, cx, cy, box, rot, fx = 40, fy = 40) {
    const k = box / 80;
    const c = Math.cos(rot), s = Math.sin(rot);
    const dx = (40 - fx) * k, dy = (40 - fy) * k;
    glyph(ctx, path, cx + c * dx - s * dy, cy + s * dx + c * dy, box, rot);
  }

  const DEG = Math.PI / 180;

  function frameLabels(ctx, fi, fg, alpha = 0.6) {
    font(ctx, 17, 'Space Mono');
    ctx.fillStyle = fg;
    ctx.globalAlpha = alpha;
    ctx.fillText(`${String(fi + 1).padStart(4, '0')} / ${N}`, 96, 110);
    ctx.globalAlpha = 1;
    label(ctx, fonts[fi].name, W - 96, 110, fg, 'right', alpha);
    label(ctx, styleOf(fi), 96, H - 96, fg, 'left', alpha);
  }

  // On-curve points, off-curve handles and bounds of an SVG path, for the construction view.
  const outlines = new Map();
  const probe = document.createElement('canvas').getContext('2d');
  function outline(fi) {
    if (!outlines.has(fi)) outlines.set(fi, parseOutline(window.FONTMAP_DATA.glyphs.A[fi], paths.A[fi]));
    return outlines.get(fi);
  }

  // Points buried inside the filled shape (overlapping contours) are flagged hidden.
  function parseOutline(d, path2d, eps = 0.7) {
    const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    const on = [], off = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0;
    const num = () => parseFloat(tokens[i++]);
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; on.push([x, y]); cmd = rel ? 'l' : 'L'; break;
        case 'L': x = ox + num(); y = oy + num(); on.push([x, y]); break;
        case 'H': x = (rel ? x : 0) + num(); on.push([x, y]); break;
        case 'V': y = (rel ? y : 0) + num(); on.push([x, y]); break;
        case 'Q': { const cx = ox + num(), cy = oy + num(); const ex = ox + num(), ey = oy + num();
          off.push([cx, cy, x, y], [cx, cy, ex, ey]); px = cx; py = cy; x = ex; y = ey; on.push([x, y]); break; }
        case 'T': { const cx = 2 * x - px, cy = 2 * y - py; const ex = ox + num(), ey = oy + num();
          off.push([cx, cy, x, y], [cx, cy, ex, ey]); px = cx; py = cy; x = ex; y = ey; on.push([x, y]); break; }
        case 'C': { const c1x = ox + num(), c1y = oy + num(), c2x = ox + num(), c2y = oy + num(), ex = ox + num(), ey = oy + num();
          off.push([c1x, c1y, x, y], [c2x, c2y, ex, ey]); px = c2x; py = c2y; x = ex; y = ey; on.push([x, y]); break; }
        case 'S': { const c2x = ox + num(), c2y = oy + num(), ex = ox + num(), ey = oy + num();
          off.push([c2x, c2y, ex, ey]); px = c2x; py = c2y; x = ex; y = ey; on.push([x, y]); break; }
        case 'Z': x = sx; y = sy; break;
        default: i++;
      }
      if (!/[QTCS]/i.test(cmd)) { px = x; py = y; }
    }
    const xs = on.map((p) => p[0]), ys = on.map((p) => p[1]);
    const buried = ([u, v]) => [[eps, eps], [-eps, eps], [eps, -eps], [-eps, -eps]].every(([du, dv]) => probe.isPointInPath(path2d, u + du, v + dv));
    const o = {
      on, off,
      onVisible: on.map((p) => !buried(p)),
      offVisible: off.map((p) => !buried(p) && !buried([p[2], p[3]])),
      minX: Math.min(...xs), maxX: Math.max(...xs), top: Math.min(...ys), base: Math.max(...ys),
    };
    return o;
  }

  // The A as a type designer sees it: outline, points, handles and vertical metrics.
  function construction(ctx, fi, cx, cy, box, rot, fx, fy, color, bg, alpha) {
    const k = box / 80;
    const c = Math.cos(rot), s = Math.sin(rot);
    const gx = cx + c * (40 - fx) * k - s * (40 - fy) * k;
    const gy = cy + s * (40 - fx) * k + c * (40 - fy) * k;
    const toScreen = (u, v) => [gx + c * (u - 40) * k - s * (v - 40) * k, gy + s * (u - 40) * k + c * (v - 40) * k];
    const o = outline(fi);
    const px = 1 / k;
    ctx.setTransform(c * k, s * k, -s * k, c * k, gx - (c * 40 - s * 40) * k, gy - (s * 40 + c * 40) * k);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.globalAlpha = 0.35 * alpha;
    ctx.lineWidth = px;
    ctx.beginPath();
    for (const v of [o.top, o.base]) { ctx.moveTo(-4000, v); ctx.lineTo(4000, v); }
    ctx.stroke();
    ctx.setLineDash([6 * px, 6 * px]);
    ctx.beginPath();
    const axis = (o.minX + o.maxX) / 2;
    ctx.moveTo(axis, -4000); ctx.lineTo(axis, 4000);
    ctx.moveTo(-4000, (o.top + o.base) / 2); ctx.lineTo(4000, (o.top + o.base) / 2);
    for (const u of [o.minX, o.maxX]) { ctx.moveTo(u, -4000); ctx.lineTo(u, 4000); }
    ctx.stroke();
    ctx.setLineDash([]);

    // Overlapping contours (a crossbar drawn over the stems) would show inner
    // lines: stroke twice as wide, then fill with the background so only the
    // outer edge of the merged shape remains.
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 4.4 * px;
    ctx.stroke(paths.A[fi]);
    ctx.fillStyle = bg;
    ctx.fill(paths.A[fi]);

    ctx.globalAlpha = 0.5 * alpha;
    ctx.lineWidth = px;
    ctx.beginPath();
    o.off.forEach(([hx, hy, ax, ay], j) => { if (o.offVisible[j]) { ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); } });
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.4 * px;
    o.off.forEach(([hx, hy], j) => {
      if (!o.offVisible[j]) return;
      ctx.beginPath(); ctx.arc(hx, hy, 4.5 * px, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill(); ctx.stroke();
    });
    const sq = 9 * px;
    ctx.fillStyle = color;
    o.on.forEach(([ax, ay], j) => { if (o.onVisible[j]) ctx.fillRect(ax - sq / 2, ay - sq / 2, sq, sq); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;

    // Metric labels sit on their guide, at the right margin.
    [[o.top, 'Cap height'], [o.base, 'Baseline']].forEach(([v, text]) => {
      const [x0, y0] = toScreen(axis, v);
      const X = W - 96;
      const y = y0 + ((X - x0) / c) * s;
      if (y > 40 && y < H - 40) label(ctx, text, X, y - 12, color, 'right', 0.7 * alpha, 15);
    });
  }

  function macro(ctx, b, t) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    let k = 0;
    T.MACRO.forEach((m, j) => { if (bd >= m.beat) k = j; });
    const m = T.MACRO[k];
    const fi = index.get(m.font);
    const since = t - secOf(m.beat);
    const u = clamp(b - m.beat);
    let box = m.box * (1 + 0.12 * u) * (1 + 0.3 * (1 - expoOut(since / 0.4)));
    let rot = lerp(m.rot[0], m.rot[1], u) * DEG;
    let fx = m.fx, fy = m.fy;
    const last = k === T.MACRO.length - 1;
    let pull = 0;
    if (last) {
      pull = cubicInOut((b - (m.beat + 0.2)) / 0.75);
      box = Math.exp(lerp(Math.log(m.box * (1 + 0.3 * (1 - expoOut(since / 0.4)))), Math.log(GIANT_BOX), pull));
      rot = lerp(m.rot[0], m.rot[1], pull) * DEG;
      fx = lerp(m.fx, 40, pull);
      fy = lerp(m.fy, 40, pull);
    }
    construction(ctx, fi, W / 2, H / 2, box, rot, fx, fy, PAPER, INK, clamp(since / 0.12));

    const out = last ? 1 - clamp(pull * 2) : 1;
    label(ctx, 'Anatomy of a letter', 96, 110, PAPER, 'left', 0.7);
    label(ctx, fonts[fi].name, W - 96, 110, PAPER, 'right', 0.7);
    font(ctx, 88, 'Playfair Display', 400, 'italic');
    ctx.fillStyle = PAPER;
    const r = clamp(since / 0.18);
    ctx.globalAlpha = r * out;
    ctx.fillText(m.part + '.', 92, H - 92 + (1 - expoOut(r)) * 14);
    ctx.globalAlpha = 1;

    const fadeIn = 1 - clamp(t / 0.12);
    if (fadeIn > 0) {
      ctx.globalAlpha = fadeIn;
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // Each new face is set in ink; the ones before it linger as hairlines.
  function layers(ctx, b, t) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    const shown = T.LAYERS.filter((l) => bd >= l.beat);
    const landed = bd >= T.LAND;
    const cur = landed ? { beat: T.LAND, font: 'playfair-display' } : shown[shown.length - 1];
    const fade = 1 - clamp((b - T.CLEAR) / (T.LAND - T.CLEAR));

    ctx.strokeStyle = INK;
    shown.slice(0, landed ? shown.length : -1).forEach((l, j, all) => {
      const age = all.length - j;
      ctx.globalAlpha = fade * Math.max(0.12, 0.55 - age * 0.05);
      const k = GIANT_BOX / 80;
      ctx.setTransform(k, 0, 0, k, W / 2 - 40 * k, H / 2 - 40 * k);
      ctx.lineWidth = 1.3 / k;
      ctx.stroke(paths.A[index.get(l.font)]);
    });
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const fi = index.get(cur.font);
    const since = t - secOf(cur.beat);
    ctx.fillStyle = INK;
    glyph(ctx, paths.A[fi], W / 2, H / 2, GIANT_BOX * (1 + (cur.beat > T.INVERT_BEAT ? 0.06 : 0.02) * Math.exp(-since * 14)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    frameLabels(ctx, fi, INK);
  }

  function intro(ctx, b, t) {
    if (bd < T.INVERT_BEAT) macro(ctx, b, t);
    else layers(ctx, b, t);
  }

  // ---------- the field: chaos, order, search, spell share one camera ----------

  function camera(b) {
    const [c0] = T.SCENES.chaos;
    let cam = { x: W / 2, y: H / 2, z: Math.exp(lerp(Math.log(GIANT_BOX / SCATTER_BOX), 0, quartOut((b - c0) / 2.4))) };
    let from = { x: W / 2, y: H / 2, z: 1 };
    for (const s of shots) {
      if (b < s.beat) break;
      const u = cubicInOut((b - s.beat) / s.dur);
      cam = { x: lerp(from.x, s.x, u), y: lerp(from.y, s.y, u), z: Math.exp(lerp(Math.log(from.z), Math.log(s.z), u)) };
      from = s;
    }
    return cam;
  }

  function currentSearch() {
    let q = null;
    for (const s of T.SEARCHES) if (bd >= s.beat) q = s;
    return q;
  }

  function field(ctx, b, t) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    const [c0] = T.SCENES.chaos;
    const [o0] = T.SCENES.order;
    const [q0, q1] = T.SCENES.search;
    const [s0] = T.SCENES.spell;
    const { x: cx, y: cy, z: zoom } = camera(b);
    const diveIdx = index.get(T.DIVE.font);
    const diving = bd >= T.DIVE.beat && bd < s0;
    const closeUp = diving ? clamp((zoom * MAP_BOX - 260) / 300) : 0;

    // Glyphs fade back behind a caption so the line reads cleanly.
    const countOn = 0;
    const placeOn = clamp((b - (o0 + PLACE_AT)) / 0.5) * (1 - clamp((b - (q0 - 0.5)) / 0.5));
    const veil = Math.max(countOn, placeOn) * 0.88;
    const corner = clamp((b - q0) / 0.3) + (bd >= s0 ? 1 : 0);

    const query = bd >= q0 && bd < T.DIVE.beat ? currentSearch() : null;
    const lit = query ? clamp((b - (query.beat + 0.4)) / 0.15) : 0;

    ctx.fillStyle = INK;
    for (let i = 0; i < N; i++) {
      const g = glyphs[i];
      const drift = i === center ? 0 : 1;
      const wob = clamp((b - c0) / 2);
      const sx = g.sx + drift * wob * 7 * Math.sin(t * 0.9 + g.phase);
      const sy = g.sy + drift * wob * 7 * Math.cos(t * 0.7 + g.phase * 1.3);
      const srot = g.rot + drift * wob * 0.25 * Math.sin(t * 0.5 + g.phase);
      let x = sx, y = sy, rot = srot, box = SCATTER_BOX * g.scl;
      if (b >= o0) {
        const p = spring(t - secOf(o0 + g.delay));
        x = lerp(sx, g.mx, p);
        y = lerp(sy, g.my, p);
        rot = lerp(srot, 0, p);
        box = lerp(SCATTER_BOX * g.scl, MAP_BOX, p);
      }

      let alpha = 1;
      if (query) {
        if (fonts[i].style.startsWith(query.tag)) box *= 1 + 0.35 * lit;
        else alpha = 1 - 0.88 * lit;
      }

      let char = 'A';
      const local = bd - s0 - g.sweep;
      if (local >= 0) {
        const step = Math.min(T.SPELL.length - 1, Math.floor(local / 0.5));
        char = T.SPELL[step];
        const since = t - secOf(s0 + g.sweep + step * 0.5);
        box *= 1 + 0.3 * Math.exp(-Math.max(0, since) * 16);
      }

      const X = (x - cx) * zoom + W / 2;
      const Y = (y - cy) * zoom + H / 2;
      const bs = box * zoom;
      if (X < -bs || X > W + bs || Y < -bs || Y > H + bs) continue;
      // Up close, the dived-into glyph turns back into its construction drawing.
      if (diving && i === diveIdx && bs > 260) {
        const c = clamp((bs - 260) / 300);
        ctx.globalAlpha = alpha * (1 - c);
        glyph(ctx, paths.A[i], X, Y, bs, rot);
        ctx.globalAlpha = 1;
        construction(ctx, i, X, Y, bs, 0, 40, 40, INK, PAPER, c);
        ctx.fillStyle = INK;
        continue;
      }
      if (veil) alpha *= 1 - veil * Math.exp(-(((X - W / 2) / 640) ** 2) - (((Y - H / 2) / 190) ** 2));
      if (closeUp && i !== diveIdx) alpha *= 1 - 0.8 * closeUp;
      if (corner) alpha *= 1 - 0.9 * Math.min(1, corner) * Math.exp(-(((X - 330) / 560) ** 2) - (((Y - (H - 110)) / 150) ** 2));
      ctx.globalAlpha = alpha;
      glyph(ctx, paths[char][i], X, Y, bs, rot);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (b >= c0 + 0.5 && b < o0 + 2) counter(ctx, b, t);
    if (b >= o0 + PLACE_AT && b < q0) placeCaption(ctx, b, t);
    if (query) searchWord(ctx, b, t, query);
    if (diving) diveLabel(ctx, b, t, diveIdx);
    if (bd >= s0) typed(ctx, t);
  }

  // A small running count, in the same corner style as the opening.
  function counter(ctx, b, t) {
    const since = t - secOf(T.SCENES.chaos[0] + 0.5);
    const out = 1 - clamp((b - (T.SCENES.order[0] + 1)) / 0.75);
    const n = Math.round(N * quartOut(since / secOf(2)));
    font(ctx, 17, 'Space Mono');
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.7 * out;
    withHalo(ctx, PAPER, 12, (draw) => draw(`${String(n).padStart(4, '0')} / ${N}`, 96, 110));
    ctx.globalAlpha = 1;
    label(ctx, 'Google Fonts', W - 96, 110, INK, 'right', 0.7 * out, 17, 12);
  }

  function placeCaption(ctx, b, t) {
    const start = T.SCENES.order[0] + PLACE_AT;
    const out = clamp((b - (T.SCENES.search[0] - 0.5)) / 0.5);
    const parts = [
      { text: 'Every face,', at: 0, style: 'normal' },
      { text: 'in its place.', at: 0.75, style: 'italic' },
    ];
    const size = 118;
    font(ctx, size, 'Playfair Display');
    const w0 = ctx.measureText('Every face, ').width;
    font(ctx, size, 'Playfair Display', 400, 'italic');
    const w1 = ctx.measureText('in its place.').width;
    let x = W / 2 - (w0 + w1) / 2;
    const y = H / 2 + 40;
    for (const p of parts) {
      const since = t - secOf(start + p.at);
      font(ctx, size, 'Playfair Display', 400, p.style);
      if (since >= 0) {
        const dy = reveal(ctx, since, 0.22);
        ctx.globalAlpha *= 1 - out;
        ctx.fillStyle = INK;
        withHalo(ctx, PAPER, 30, (draw) => draw(p.text, x, y + dy));
        resetFx(ctx);
      }
      x += p.at === 0 ? w0 : w1;
    }
  }

  // Same layout as the opening: a small label top left, the word large at bottom left.
  function searchWord(ctx, b, t, query) {
    label(ctx, 'Search by style', 96, 110, INK, 'left', 0.7, 17, 12);
    const typedN = clamp(Math.floor(((bd - query.beat) / 0.35) * query.query.length) + 1, 0, query.query.length);
    const caret = Math.floor(bd * 4) % 2 === 0 ? '|' : '';
    const size = query.family === 'Press Start 2P' ? 64 : query.family === 'Space Mono' ? 92 : 120;
    font(ctx, size, query.family);
    ctx.fillStyle = INK;
    withHalo(ctx, PAPER, 24, (draw) => draw(query.query.slice(0, typedN), 92, H - 92));
    const w = ctx.measureText(query.query.slice(0, typedN)).width;
    font(ctx, size, 'Source Sans 3', 400);
    ctx.globalAlpha = 0.8;
    ctx.fillText(caret, 92 + w + 6, H - 92);
    ctx.globalAlpha = 1;
  }

  function diveLabel(ctx, b, t, fi) {
    const since = t - secOf(T.DIVE.beat + 0.6);
    const out = 1 - clamp((b - T.DIVE.out) / 0.3);
    if (since < 0 || out <= 0) return;
    label(ctx, styleOf(fi), 96, 110, INK, 'left', 0.7 * out, 17, 12);
    font(ctx, 120, T.DIVE.family);
    const dy = reveal(ctx, since, 0.2);
    ctx.globalAlpha *= out;
    ctx.fillStyle = INK;
    withHalo(ctx, PAPER, 24, (draw) => draw(fonts[fi].name, 92, H - 92 + dy));
    resetFx(ctx);
  }

  function typed(ctx, t) {
    const s0 = T.SCENES.spell[0];
    const count = clamp(Math.floor((bd - s0) / 0.5) + 1, 0, T.SPELL.length);
    const text = T.SPELL.slice(0, count).join('');
    const caret = Math.floor((bd - s0) * 4) % 2 === 0 ? '|' : '';
    label(ctx, 'Type any letter', 96, 110, INK, 'left', 0.7, 17, 12);
    font(ctx, 96, 'Space Mono', 400, 'normal', 12);
    ctx.fillStyle = INK;
    withHalo(ctx, PAPER, 24, (draw) => draw(text + caret, 92, H - 92));
    ctx.letterSpacing = '0px';
  }

  // ---------- end card ----------

  // Mirror of the opening: the wordmark is drawn in outline on its metrics, then inked.
  function logoCard(ctx, b, t) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    const [l0] = T.SCENES.logo;
    const since = t - secOf(l0);
    const inked = clamp((b - T.INK_BEAT) / 0.12);
    const drift = 1 + 0.02 * clamp((b - l0) / 4);
    const s = (1250 / logo.width) * drift * (1 + 0.03 * Math.exp(-Math.max(0, t - secOf(T.INK_BEAT)) * 10) * (b >= T.INK_BEAT ? 1 : 0));
    const x0 = W / 2 - (logo.left + logo.width / 2) * s;
    const base = H / 2 + (logo.capHeight * s) / 2 - 30;
    const o = logo.outline;
    const px = 1 / s;

    // Metrics grow out from the centre on the downbeat, then recede once inked.
    const grow = expoOut(since / 0.5);
    const guideAlpha = 0.35 * (1 - 0.7 * inked);
    const metrics = [[0, 'Baseline'], [-logo.xHeight, 'x-height'], [-logo.capHeight, 'Cap height'], [-logo.descender, 'Descender']];
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1;
    ctx.globalAlpha = guideAlpha;
    ctx.beginPath();
    metrics.forEach(([v]) => { const y = base + v * s; ctx.moveTo(W / 2 - (W / 2) * grow, y); ctx.lineTo(W / 2 + (W / 2) * grow, y); });
    ctx.stroke();
    ctx.globalAlpha = 1;
    metrics.forEach(([v, text]) => label(ctx, text, W - 96, base + v * s - 10, PAPER, 'right', 0.7 * grow * (1 - 0.8 * inked), 14));

    ctx.setTransform(s, 0, 0, s, x0, base);
    const draw = clamp(since / 0.1);
    if (inked < 1) {
      ctx.globalAlpha = draw * (1 - inked);
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 4.4 * px;
      ctx.stroke(logo.path);
      ctx.fillStyle = INK;
      ctx.fill(logo.path);
      ctx.lineWidth = px;
      ctx.globalAlpha = 0.5 * draw * (1 - inked);
      ctx.beginPath();
      o.off.forEach(([hx, hy, ax, ay], j) => { if (o.offVisible[j]) { ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); } });
      ctx.stroke();
      ctx.globalAlpha = draw * (1 - inked);
      ctx.lineWidth = 1.4 * px;
      o.off.forEach(([hx, hy], j) => {
        if (!o.offVisible[j]) return;
        ctx.beginPath(); ctx.arc(hx, hy, 2.6 * px, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); ctx.stroke();
      });
      const sq = 5.5 * px;
      ctx.fillStyle = PAPER;
      o.on.forEach(([ax, ay], j) => { if (o.onVisible[j]) ctx.fillRect(ax - sq / 2, ay - sq / 2, sq, sq); });
    }
    if (inked > 0) {
      ctx.globalAlpha = inked;
      ctx.fillStyle = PAPER;
      ctx.fill(logo.path);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const tg = t - secOf(T.INK_BEAT + 0.5);
    if (tg >= 0) {
      font(ctx, 50, 'Playfair Display', 400, 'italic');
      const dy = reveal(ctx, tg, 0.25);
      ctx.fillStyle = PAPER;
      textCentered(ctx, 'An ode to type.', W / 2, base + 150 + dy);
      resetFx(ctx);
    }
    const url = t - secOf(T.INK_BEAT + 1.25);
    if (url >= 0) label(ctx, 'huggingface.co/spaces/tfrere/font-map', W / 2, H - 70, PAPER, 'center', 0.55 * clamp(url / 0.3), 16);
  }

  // `td` is the time used for discrete choices (which font, which letter, which
  // scene). Motion-blur sub-frames share the frame's td so a cut never ghosts.
  function draw(ctx, t, td = t) {
    const b = beatOf(t);
    bd = beatOf(td);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    const S = T.SCENES;
    if (bd < S.intro[1]) intro(ctx, b, t);
    else if (bd < S.spell[1]) field(ctx, b, t);
    else logoCard(ctx, b, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const FAMILIES = [
    ['Playfair Display', 400, 'normal'], ['Playfair Display', 400, 'italic'], ['Source Sans 3', 600, 'normal'],
    ['Bebas Neue', 400, 'normal'], ['Pacifico', 400, 'normal'], ['Space Mono', 400, 'normal'],
    ['UnifrakturMaguntia', 400, 'normal'], ['Press Start 2P', 400, 'normal'], ['Abril Fatface', 400, 'normal'],
    ['Great Vibes', 400, 'normal'], ['Monoton', 400, 'normal'], ['Libre Franklin', 800, 'normal'],
    ['Roboto Slab', 700, 'normal'], ['Stardos Stencil', 700, 'normal'],
  ];

  // Some browsers never settle document.fonts.load for a face they already
  // have; waiting at most a few seconds keeps the page from hanging.
  async function ready() {
    const fontsLoaded = Promise.all(FAMILIES.map(([f, w, s]) => document.fonts.load(`${s} ${w} 40px "${f}"`, 'AaFontMap0123')));
    await Promise.race([fontsLoaded, new Promise((r) => setTimeout(r, 4000))]);
    init();
  }

  window.Trailer = { W, H, draw, ready, get landings() { return landings; } };
})();

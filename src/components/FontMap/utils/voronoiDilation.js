import * as d3 from 'd3';

/**
 * Overlap removal via D3 force simulation — minimum displacement strategy.
 *
 * forceCollide only pushes pairs that actually overlap; points already well
 * separated don't move at all. A weak forceX/forceY pulls every point back
 * toward its original UMAP position, so the layout drifts as little as possible.
 *
 * @param {Array<{id: string, x: number, y: number}>} points  - initial screen-space positions
 * @param {Object} opts
 * @param {number} opts.collideRadius   - collision radius per glyph in pixels
 * @param {number} opts.ticks           - number of simulation steps (more = fuller resolution)
 * @param {number} opts.originStrength  - pull-back toward UMAP origin [0, 1] (keep small, e.g. 0.1)
 * @returns {Array<{id: string, x: number, y: number}>}
 */
export function applyOverlapRemoval(points, { collideRadius = 10, ticks = 140, originStrength = 0.03 }) {
  if (ticks === 0 || collideRadius === 0 || points.length < 2) return points;

  // d3 forceSimulation mutates node objects in-place
  const nodes = points.map(p => ({ id: p.id, x: p.x, y: p.y, ox: p.x, oy: p.y }));

  const sim = d3.forceSimulation(nodes)
    .force('collide', d3.forceCollide(collideRadius).strength(1).iterations(3))
    .force('x', d3.forceX(n => n.ox).strength(originStrength))
    .force('y', d3.forceY(n => n.oy).strength(originStrength))
    .stop();

  // Run synchronously (no animation loop needed)
  for (let i = 0; i < ticks; i++) sim.tick();

  return nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
}

import { GraphicsContext } from 'pixi.js';
import { type GameMap, levelAt } from '../sim/map';
import { LEVEL_H, tileToScreen } from './iso';
import { fbm2, hexRGB, mix, noise2, type RGB, smooth } from './sculpt';

/** Facets per tile side. */
const R = 3;
/** Height of the tallest summits, px. */
export const TOP = 130;
/** Ground pixels per tile, to weigh heights against distances when lighting a facet. */
const RUN = 45;
/** Sun from the upper left and above, in ground space (tile x, tile y, up). */
const SUN = (() => {
  const v = [-0.72, -0.2, 0.66];
  const l = Math.hypot(...v);
  return v.map((k) => k / l);
})();

/** Rock from deep shade to full sun, then snow in shade and sun, and the scree of the highland floor. */
const RAMP = ['#646371', '#8a8a97', '#ad9f85', '#d6c8ab', '#ece2c8'].map(hexRGB);
const SNOW = [hexRGB('#b9c4da'), hexRGB('#f4f6f8')];
const SCREE = hexRGB('#aaa18c');
const ramp = (t: number): RGB => {
  const k = Math.min(RAMP.length - 1.001, Math.max(0, t * (RAMP.length - 1)));
  const i = Math.floor(k);
  return mix(RAMP[i], RAMP[i + 1], k - i);
};
const hex = ([r, g, b]: RGB) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

/**
 * Mountain ranges as one landscape each: a height field over all the mountain tiles, rising from
 * the edge of the range to ridges and summits inside, painted as flat-lit facets. Cut up per tile
 * so each piece sorts in depth with the trees and people around it.
 */
export function createMassif(map: GameMap) {
  const { width: W, height: H, tiles } = map;
  // Steps into the range. Off it, and on tiles beside a cliff, zero: the range comes down to the
  // ground there rather than hang over the edge.
  const D = new Float32Array(W * H);
  const queue: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const l = levelAt(map, x, y);
      let inside = tiles[i] === 'mountain' && x > 0 && y > 0 && x < W - 1 && y < H - 1;
      for (let dy = -1; dy <= 1 && inside; dy++)
        for (let dx = -1; dx <= 1; dx++) if (levelAt(map, x + dx, y + dy) !== l) inside = false;
      D[i] = inside ? Infinity : 0;
      if (!inside) queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of [i - 1, i + 1, i - W, i + W])
      if (j >= 0 && j < W * H && D[j] === Infinity) {
        D[j] = D[i] + 1;
        queue.push(j);
      }
  }
  const depth = (x: number, y: number) => D[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  /** Depth into the range at tile point (gx, gy), interpolated between tile centres. */
  const depthAt = (gx: number, gy: number) => {
    const u = gx - 0.5;
    const v = gy - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const [fu, fv] = [u - i, v - j];
    const a = depth(i, j) + (depth(i + 1, j) - depth(i, j)) * fu;
    const b = depth(i, j + 1) + (depth(i + 1, j + 1) - depth(i, j + 1)) * fu;
    return a + (b - a) * fv;
  };
  /** Height of the range, px: ridged noise under an envelope that grows with depth into it. */
  const height = (gx: number, gy: number) => {
    // The foot wanders off the tile grid, and the first tiles rise gently: foothills, not a wall.
    const e = depthAt(gx, gy) - 0.8 + (noise2(gx * 0.9, gy * 0.9, 76) - 0.5) * 0.9;
    if (e <= 0) return 0;
    const env = smooth(0, 1.8, e) ** 1.4 * 0.35 + (1 - Math.exp(-e / 2.6)) * 0.65;
    const ridge = 1 - Math.abs(fbm2(gx * 0.32, gy * 0.32, 77) * 2 - 1);
    // Broad swells: some stretches of a range carry its great summits, others only lower ridges.
    const swell = 0.7 + 0.55 * fbm2(gx * 0.11, gy * 0.11, 79);
    const h = TOP * env * swell * (0.35 + 0.75 * ridge ** 1.6) + 5 * env * noise2(gx * 1.4, gy * 1.4, 78);
    return Math.min(TOP, h);
  };

  /** Highest point of each tile, px: for the shadow the ranges cast on the land. */
  const peaks = new Float32Array(W * H);
  const pieces = new Map<number, GraphicsContext | null>();

  /** The facets of the range standing on tile (x, y), or null if none rises there. */
  function piece(x: number, y: number) {
    const i = y * W + x;
    if (pieces.has(i)) return pieces.get(i)!;
    let ctx: GraphicsContext | null = null;
    if (tiles[i] === 'mountain') {
      const lift = levelAt(map, x, y) * LEVEL_H;
      const N = R + 1;
      const vs = Array.from({ length: N * N }, (_, k) => {
        // Corners shifted a little off the grid (the same shift seen from every tile sharing them),
        // so the facets do not line up in rows.
        const [a, b] = [x * R + (k % N), y * R + Math.floor(k / N)];
        const [gx, gy] = [
          (a + (noise2(a * 7.3, b * 3.1, 82) - 0.5) * 0.5) / R,
          (b + (noise2(a * 3.7, b * 7.9, 83) - 0.5) * 0.5) / R,
        ];
        const h = height(gx, gy);
        const s = tileToScreen(gx, gy);
        return { gx, gy, h, sx: s.x, sy: s.y - lift - h };
      });
      if (vs.some((v) => v.h > 0.5)) {
        ctx = new GraphicsContext();
        const tri = (p: (typeof vs)[0], q: (typeof vs)[0], r: (typeof vs)[0]) => {
          const avg = (p.h + q.h + r.h) / 3;
          if (Math.max(p.h, q.h, r.h) < 0.5) return;
          const a = [(q.gx - p.gx) * RUN, (q.gy - p.gy) * RUN, q.h - p.h];
          const b = [(r.gx - p.gx) * RUN, (r.gy - p.gy) * RUN, r.h - p.h];
          let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          if (n[2] < 0) n = n.map((k) => -k);
          const l = Math.hypot(n[0], n[1], n[2]);
          const up = n[2] / l;
          const sun = Math.max(0, (n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) / l);
          const [cx, cy] = [(p.gx + q.gx + r.gx) / 3, (p.gy + q.gy + r.gy) / 3];
          // A touch of unevenness, as if each facet were a separate brush stroke.
          // Light in a few flat tones, like paint laid on in planes, not a smooth render.
          const raw = (sun - 0.12) * 1.35 + (noise2(cx * 1.3, cy * 1.3, 81) - 0.5) * 0.1;
          const light = Math.min(1, Math.max(0, Math.round(raw * 6) / 6));
          let rgb = ramp(light);
          const snowLine = TOP * 0.7 + 18 * (noise2(cx * 0.6, cy * 0.6, 80) - 0.5);
          if (avg > snowLine && up > 0.5) rgb = mix(SNOW[0], SNOW[1], light > 0.5 ? 1 : 0.15);
          rgb = mix(SCREE, rgb, smooth(1, 20, avg));
          const c = hex(rgb);
          // Stroked in its own colour too, so no hairline gaps open between facets.
          ctx!.poly([p.sx, p.sy, q.sx, q.sy, r.sx, r.sy]).fill(c).stroke({ width: 0.6, color: c });
          // A brush stroke down the slope, a shade darker (snow: a shade bluer): gullies and scree runs.
          if (avg > 8 && up < 0.9 && noise2(cx * 5.3, cy * 5.3, 84) > 0.45) {
            const low = [p, q, r].reduce((m, v) => (v.h < m.h ? v : m));
            const [mx, my] = [(p.sx + q.sx + r.sx) / 3, (p.sy + q.sy + r.sy) / 3];
            const tone = hex(mix(rgb, [70, 72, 92], 0.22));
            ctx!
              .moveTo(mx + (mx - low.sx) * 0.3, my + (my - low.sy) * 0.3)
              .lineTo(mx + (low.sx - mx) * 0.75, my + (low.sy - my) * 0.75)
              .stroke({ width: 0.9, color: tone, cap: 'round' });
          }
        };
        // Back to front: cells by depth, the back triangle of each before the front one.
        for (let s = 0; s <= 2 * (R - 1); s++)
          for (let a = Math.max(0, s - R + 1); a <= Math.min(s, R - 1); a++) {
            const bb = s - a;
            const A = vs[bb * N + a];
            const B = vs[bb * N + a + 1];
            const C = vs[(bb + 1) * N + a + 1];
            const Dv = vs[(bb + 1) * N + a];
            tri(A, B, Dv);
            tri(B, C, Dv);
          }
      }
    }
    pieces.set(i, ctx);
    return ctx;
  }

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (tiles[y * W + x] === 'mountain') {
        let top = 0;
        for (let b = 0; b <= R; b++) for (let a = 0; a <= R; a++) top = Math.max(top, height(x + a / R, y + b / R));
        peaks[y * W + x] = top;
      }

  return { piece, peaks };
}

import { Geometry, Shader } from 'pixi.js';
import { type GameMap, levelAt } from '../sim/map';
import { LEVEL_H, tileToScreen } from './iso';
import { fbm2, noise2, smooth } from './sculpt';

/** Mesh cells per tile side. */
const R = 6;
/** Ranges that never rise this high (px) are left flat. */
const MIN_RANGE = 45;
/** Height of the tallest summits, px. */
export const TOP = 230;
/** Ground pixels per tile, to weigh heights against distances for the slope. */
const RUN = 45;

const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aGround;
in vec3 aNormal;
in float aHeight;
out vec2 vPos;
out vec2 vGround;
out vec3 vNormal;
out float vH;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
  vGround = aGround;
  vNormal = aNormal;
  vH = aHeight;
}`;

/*
 * Painted rock: the light falls into four tones with soft brushed edges between them (no smooth
 * render, no facets), stone mottled at two scales, strokes running down the steep faces, snow
 * where the slope is high and gentle enough to hold it, and a dark line where the surface turns
 * away from the eye: the ridges and the silhouette are inked.
 */
const fragment = /* glsl */ `
in vec2 vPos;
in vec2 vGround;
in vec3 vNormal;
in float vH;
out vec4 finalColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
void main() {
  vec3 n = normalize(vNormal);
  float up = n.z;
  float paint = vnoise(vGround * 2.3) * 0.6 + vnoise(vGround * 5.1) * 0.4;
  float l = (dot(n, normalize(vec3(-0.72, -0.2, 0.66))) + 0.12) * 1.3 + (paint - 0.5) * 0.2;
  float t = clamp(l, 0.0, 0.999) * 3.0;
  // Crisp edges between the tones, softened just enough not to step: sharp paint, not a blur.
  float band = (floor(t) + smoothstep(0.93, 1.0, fract(t))) / 3.0;
  // Cold granite; warmth only where the sun strikes full.
  vec3 c0 = vec3(0.3, 0.31, 0.37), c1 = vec3(0.48, 0.48, 0.52), c2 = vec3(0.66, 0.63, 0.58), c3 = vec3(0.86, 0.82, 0.74);
  vec3 col = band < 0.334 ? mix(c0, c1, band * 3.0) : band < 0.667 ? mix(c1, c2, band * 3.0 - 1.0) : mix(c2, c3, band * 3.0 - 2.0);
  col *= 0.92 + 0.16 * paint;
  // Strokes down the fall line of the steep faces: gullies and scree runs.
  // Two layers, coarse and fine; the steeper the face, the more and longer the strokes.
  float steep = smoothstep(0.85, 0.4, up);
  float fall = vnoise(vec2(vPos.x * 0.45, vPos.y * mix(0.05, 0.025, steep) + vGround.x * 3.0));
  float fine = vnoise(vec2(vPos.x * 1.3 + 7.0, vPos.y * 0.09 + vGround.y * 5.0));
  col *= 1.0 - (0.16 * smoothstep(0.6, 0.85, fall) + 0.08 * smoothstep(0.65, 0.9, fine)) * steep;
  // Snow above a ragged line, where the slope is gentle enough to hold it.
  float line = ${(TOP * 0.6).toFixed(1)} + (vnoise(vGround * 0.8) - 0.5) * 44.0;
  float snow = smoothstep(line - 4.0, line + 4.0, vH) * smoothstep(0.32, 0.5, up + (paint - 0.5) * 0.2);
  col = mix(col, mix(vec3(0.68, 0.74, 0.86), vec3(0.96, 0.97, 0.98), smoothstep(0.3, 0.5, band)), snow);
  // Ink where the surface turns away from the eye.
  float face = dot(n, normalize(vec3(45.0, 45.0, 32.0)));
  float ink = 1.0 - smoothstep(0.03, 0.2, face);
  // A warm rim of light just inside the ink where the sun strikes.
  col += vec3(0.16, 0.12, 0.06) * smoothstep(0.2, 0.45, face) * (1.0 - smoothstep(0.45, 0.7, face)) * step(0.66, band);
  col = mix(col, c0 * 0.55, ink * 0.75);
  // Scree at the foot, mottled; the foot itself solid with a ragged edge, never see-through.
  col = mix(vec3(0.667, 0.631, 0.549) * (0.9 + 0.2 * vnoise(vGround * 6.0)), col, smoothstep(6.0, 9.0, vH + (paint - 0.5) * 10.0));
  float a = smoothstep(0.0, 0.25, vH - 1.5 * vnoise(vGround * 3.0));
  finalColor = vec4(col * a, a);
}`;

/**
 * Mountain ranges as one landscape each: a height field over all the mountain tiles, rising from
 * the edge of the range to ridges and summits inside, painted by the shader above. Cut up per tile
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
    const env = smooth(0, 2.2, e) ** 1.6 * 0.3 + (1 - Math.exp(-e / 3.2)) * 0.7;
    // Ridged noise, sharpened: crests with gullies between them.
    const ridge = 1 - Math.abs(fbm2(gx * 0.25, gy * 0.25, 77) * 2 - 1);
    // Broad swells: some stretches of a range carry its great summits, others only lower ridges.
    const swell = 0.6 + 0.6 * fbm2(gx * 0.1, gy * 0.1, 79);
    // Gullies filled to a third of the crests: one massif, not needles beside pits.
    const h = TOP * env * swell * (0.34 + 0.72 * ridge ** 1.8) + 6 * env * noise2(gx * 1.4, gy * 1.4, 78);
    return Math.min(TOP, h);
  };

  /** Highest point of each tile, px: for the shadow the ranges cast on the land. */
  const peaks = new Float32Array(W * H);
  const pieces = new Map<number, Geometry | null>();
  const shader = Shader.from({ gl: { vertex, fragment, name: 'massif' }, resources: {} });

  /** The mesh of the range standing on tile (x, y), or null if none rises there. */
  function piece(x: number, y: number) {
    const i = y * W + x;
    if (pieces.has(i)) return pieces.get(i)!;
    let mesh: Geometry | null = null;
    if (tiles[i] === 'mountain') {
      const lift = levelAt(map, x, y) * LEVEL_H;
      const N = R + 1;
      const pos: number[] = [];
      const ground: number[] = [];
      const normal: number[] = [];
      const heights: number[] = [];
      for (let k = 0; k < N * N; k++) {
        // Corners shifted a little off the grid (the same shift seen from every tile sharing them).
        const [a, b] = [x * R + (k % N), y * R + Math.floor(k / N)];
        const [gx, gy] = [
          (a + (noise2(a * 7.3, b * 3.1, 82) - 0.5) * 0.3) / R,
          (b + (noise2(a * 3.7, b * 7.9, 83) - 0.5) * 0.3) / R,
        ];
        const h = height(gx, gy);
        const s = tileToScreen(gx, gy);
        // A smooth normal from the height field around the corner, shared by its neighbours.
        const e = 0.5 / R;
        const nx = -(height(gx + e, gy) - height(gx - e, gy)) / (2 * e * RUN);
        const ny = -(height(gx, gy + e) - height(gx, gy - e)) / (2 * e * RUN);
        pos.push(s.x, s.y - lift - h);
        ground.push(gx, gy);
        normal.push(nx, ny, 1);
        heights.push(h);
      }
      if (heights.some((h) => h > 3)) {
        // Back to front: cells by depth, the back triangle of each before the front one.
        const index: number[] = [];
        for (let s = 0; s <= 2 * (R - 1); s++)
          for (let a = Math.max(0, s - R + 1); a <= Math.min(s, R - 1); a++) {
            const b = s - a;
            const [A, B, C, D] = [b * N + a, b * N + a + 1, (b + 1) * N + a + 1, (b + 1) * N + a];
            for (const tri of [
              [A, B, D],
              [B, C, D],
            ])
              if (Math.max(...tri.map((v) => heights[v])) > 0.5) index.push(...tri);
          }
        mesh = new Geometry({
          attributes: {
            aPosition: { buffer: new Float32Array(pos), format: 'float32x2' },
            aGround: { buffer: new Float32Array(ground), format: 'float32x2' },
            aNormal: { buffer: new Float32Array(normal), format: 'float32x3' },
            aHeight: { buffer: new Float32Array(heights), format: 'float32' },
          },
          indexBuffer: new Uint32Array(index),
        });
      }
    }
    pieces.set(i, mesh);
    return mesh;
  }

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (tiles[y * W + x] === 'mountain') {
        let top = 0;
        for (let b = 0; b <= R; b++) for (let a = 0; a <= R; a++) top = Math.max(top, height(x + a / R, y + b / R));
        peaks[y * W + x] = top;
      }
  // A patch of mountain tiles too small to rise to a real range stays flat, scree and boulders.
  const seen = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (tiles[i] !== 'mountain' || seen[i]) continue;
    const patch = [i];
    seen[i] = 1;
    for (let q = 0; q < patch.length; q++)
      for (const j of [patch[q] - 1, patch[q] + 1, patch[q] - W, patch[q] + W])
        if (j >= 0 && j < W * H && tiles[j] === 'mountain' && !seen[j]) {
          seen[j] = 1;
          patch.push(j);
        }
    if (Math.max(...patch.map((j) => peaks[j])) >= MIN_RANGE) continue;
    for (const j of patch) {
      peaks[j] = 0;
      pieces.set(j, null);
    }
  }

  return { piece, peaks, shader };
}

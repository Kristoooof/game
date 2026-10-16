/*
 * Per-pixel lit object art. Instead of flat painted shapes, each object is a small 3D model
 * (a height field for rocks and mountains, spheres for a leafy crown, stacked cones for a
 * conifer) shaded pixel by pixel with the one sun of the scene (upper left), ambient
 * occlusion in its hollows, light bleeding through leaf edges and a surface texture.
 * The result is drawn over whatever the canvas already holds (contact shadow, trunk).
 */

type Ctx = CanvasRenderingContext2D;
export type RGB = [number, number, number];

/** Smooth value noise in [0, 1], tileless, seeded. */
export function noise2(x: number, y: number, seed = 0) {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * sx;
  const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
  return a + (b - a) * sy;
}
export const fbm2 = (x: number, y: number, seed = 0) =>
  noise2(x, y, seed) * 0.5 + noise2(x * 2.1, y * 2.1, seed + 1) * 0.3 + noise2(x * 4.3, y * 4.3, seed + 2) * 0.2;

export const hexRGB = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Draw an RGBA buffer (device pixels) over the canvas, blending with what is there. */
function blit(c: Ctx, data: Uint8ClampedArray, w: number, h: number) {
  const off = Object.assign(document.createElement('canvas'), { width: w, height: h });
  off.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  c.save();
  c.resetTransform();
  c.drawImage(off, 0, 0);
  c.restore();
}

/** Sun direction in screen space: x right, y down, z towards the viewer. */
const SUN = (() => {
  const v = [-0.55, -0.62, 0.56];
  const l = Math.hypot(...v);
  return v.map((k) => k / l);
})();

export interface Field {
  /** Footprint-centre ground point in art pixels, and art pixels per footprint unit across. */
  cx: number;
  cy: number;
  scale: number;
  /** Height in art pixels at footprint point (u, v) in [-1, 1]²; ≤ 0 outside the object. */
  height: (u: number, v: number) => number;
  /** Surface colour for a point: its height, the up-component of its normal, and the light on it. */
  color: (p: { u: number; v: number; h: number; up: number; light: number; occl: number }) => RGB;
  /** Grid cells across the footprint. */
  grid?: number;
}

/**
 * A height field seen in the scene's isometric projection: drawn back to front as little
 * columns, each lit from its own normal, darkened in hollows.
 */
export function litField(c: Ctx, S: number, f: Field) {
  const W = c.canvas.width;
  const H = c.canvas.height;
  const out = new Uint8ClampedArray(W * H * 4);
  const N = f.grid ?? 200;
  const step = 2 / N;
  const e = step * 1.5;
  const k = f.scale;
  for (let s = 0; s <= 2 * (N - 1); s++)
    for (let i = Math.max(0, s - N + 1); i <= Math.min(s, N - 1); i++) {
      const u = -1 + (i + 0.5) * step;
      const v = -1 + (s - i + 0.5) * step;
      const h = f.height(u, v);
      if (h <= 0) continue;
      // Normal from the slope (heights in art px, footprint units ≈ k art px across).
      const dx = (f.height(u + e, v) - f.height(u - e, v)) / (2 * e * k);
      const dy = (f.height(u, v + e) - f.height(u, v - e)) / (2 * e * k);
      const n = [-dx, -dy, 1];
      const l = Math.hypot(n[0], n[1], n[2]);
      // Ground space (u, v, up) to screen light: the sun comes from -u (screen left) and above.
      const light = clamp01((-n[0] * 0.72 - n[1] * 0.24 + n[2] * 0.62) / l);
      // Hollows: lower than the average around them.
      const r = 0.07;
      const avg = (f.height(u + r, v) + f.height(u - r, v) + f.height(u, v + r) + f.height(u, v - r)) / 4;
      const occl = clamp01(1 + (h - avg) * 0.08);
      const rgb = f.color({ u, v, h, up: n[2] / l, light, occl });
      const sx = Math.round((f.cx + (u - v) * k * 0.5) * S);
      const sy = Math.round((f.cy + (u + v) * k * 0.25 - h) * S);
      const alpha = clamp01(h / 2.5) * 255;
      // A column down to where the cells in front begin, so steep faces leave no holes.
      const front = Math.min(f.height(u + step, v), f.height(u, v + step), h);
      const len = Math.max(3, Math.ceil((h - front + step * k * 0.25) * S) + 2);
      for (let yy = sy; yy < sy + len; yy++)
        for (let xx = sx - 1; xx <= sx; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const o = (yy * W + xx) * 4;
          out[o] = rgb[0];
          out[o + 1] = rgb[1];
          out[o + 2] = rgb[2];
          out[o + 3] = Math.max(out[o + 3], alpha);
        }
    }
  blit(c, out, W, H);
}

/**
 * A leafy crown: a cluster of spheres, each pixel lit from the sphere surface it shows, with
 * leaf-sized texture, light shining through the rim, and darker hollows deep in the crown.
 */
export function litCrown(c: Ctx, S: number, balls: number[][], palette: string[], seed: number) {
  const W = c.canvas.width;
  const H = c.canvas.height;
  const out = new Uint8ClampedArray(W * H * 4);
  const [dark, mid, light] = palette.map(hexRGB);
  const glow = mix(light, [235, 240, 150], 0.4);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y, r] of balls) {
    x0 = Math.min(x0, x - r);
    x1 = Math.max(x1, x + r);
    y0 = Math.min(y0, y - r);
    y1 = Math.max(y1, y + r);
  }
  const zMax = Math.max(...balls.map(([, , r, z]) => (z ?? 0) + r));
  for (let py = Math.floor(y0 * S); py < y1 * S; py++)
    for (let px = Math.floor(x0 * S); px < x1 * S; px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const x = px / S;
      const y = py / S;
      // The nearest surface: the sphere point closest to the viewer.
      let best = -Infinity;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const [bx, by, r, bz = 0] of balls) {
        const dx = x - bx;
        const dy = y - by;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const z = bz + Math.sqrt(r * r - d2);
        if (z > best) [best, nx, ny, nz] = [z, dx / r, dy / r, (z - bz) / r];
      }
      if (best === -Infinity) continue;
      const leaf = noise2(x * 1.1, y * 1.1, seed) * 0.6 + noise2(x * 2.6, y * 2.6, seed + 5) * 0.4;
      // A ragged, leafy outline rather than a round edge.
      const alpha = smooth(0.18, 0.42, nz + leaf * 0.45 - 0.2);
      if (alpha <= 0) continue;
      const sun = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
      const depth = clamp01(best / zMax);
      let lum = (0.22 + 0.85 * sun) * (0.55 + 0.45 * depth) * (0.72 + 0.5 * leaf);
      lum = clamp01(lum);
      let rgb = lum < 0.5 ? mix(dark, mid, lum * 2) : mix(mid, light, (lum - 0.5) * 2);
      // Sunlight through the leaves at the lit edge.
      rgb = mix(rgb, glow, smooth(0.45, 0.05, nz) * sun * 0.6);
      const o = (py * W + px) * 4;
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      out[o + 3] = alpha * 255;
    }
  blit(c, out, W, H);
}

/**
 * A conifer's foliage: stacked drooping cones from the bottom tier up, each pixel lit from the
 * cone's surface, clumps of boughs as texture, shade under each tier's skirt.
 */
export function litConifer(
  c: Ctx,
  S: number,
  tiers: { ty: number; by: number; hw: number }[],
  cx: number,
  palette: string[],
  seed: number,
) {
  const W = c.canvas.width;
  const H = c.canvas.height;
  const out = new Uint8ClampedArray(W * H * 4);
  const [dark, mid, light] = palette.map(hexRGB);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const x = px / S;
      const y = py / S;
      // The highest tier covering this pixel hides the ones below it.
      for (let i = tiers.length - 1; i >= 0; i--) {
        const { ty, by, hw } = tiers[i];
        const t = (y - ty) / (by - ty);
        const ragged = noise2(x * 1.6, y * 0.9, seed + i);
        const bottom = by - 1.6 * noise2(x * 0.9, i * 7.3, seed);
        if (t < 0 || y > bottom) continue;
        const w = hw * Math.pow(t, 0.85) * (0.84 + 0.22 * ragged);
        const dx = (x - cx) / Math.max(0.6, w);
        if (Math.abs(dx) >= 1) continue;
        const nx = dx * 0.8;
        const ny = -0.25 + 0.45 * t;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const sun = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
        const clump = noise2(x * 1.4, y * 2.4, seed + 3);
        // Shade just under the tier above, and towards the cone's edges.
        const under = i < tiers.length - 1 ? smooth(0, 0.35, t) : 1;
        let lum = (0.2 + 0.85 * sun) * (0.6 + 0.4 * under) * (0.68 + 0.5 * clump);
        lum = clamp01(lum * (1 - Math.abs(dx) * 0.15));
        const rgb = lum < 0.5 ? mix(dark, mid, lum * 2) : mix(mid, light, (lum - 0.5) * 2);
        const o = (py * W + px) * 4;
        out[o] = rgb[0];
        out[o + 1] = rgb[1];
        out[o + 2] = rgb[2];
        out[o + 3] = 255 * smooth(1, 0.9, Math.abs(dx));
        break;
      }
    }
  blit(c, out, W, H);
}

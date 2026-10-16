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

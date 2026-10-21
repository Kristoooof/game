import { type Container, Graphics, Matrix, Sprite, Texture } from 'pixi.js';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { type GameMap, terrainAt } from '../sim/map';
import type { World } from '../sim/world';
import { mulberry32 } from '../sim/rng';
import { diamond, groundToScreen, liftAt, tileToScreen } from './iso';

const shade = (color: number, k: number) =>
  (Math.min(255, Math.round(((color >> 16) & 255) * k)) << 16) |
  (Math.min(255, Math.round(((color >> 8) & 255) * k)) << 8) |
  Math.min(255, Math.round((color & 255) * k));

/** Mirror mode: heights go down instead of up, the building's reflection in still water. */
let flip = false;
/** Terrace height of the building being drawn: all of it stands on one level. */
let lift = 0;
/** Screen point of tile coords (x, y) at height h above raised land (below it in mirror mode). */
/** Turned buildings are drawn mirrored across their footprint's diagonal (x and y swapped about
 * its centre): the front faces right instead of left. */
let turned = false;
let mid = [0, 0];
const P = (x: number, y: number, h: number) => {
  if (turned) [x, y] = [mid[0] + (y - mid[1]), mid[1] + (x - mid[0])];
  const s = tileToScreen(x, y);
  return [s.x, (flip ? s.y + h : s.y - h) - lift];
};

const fill = (g: Graphics, pts: number[][], color: number) => g.poly(pts.flat()).fill(color);
const edge = (g: Graphics, pts: number[][], color: number, width = 0.8) =>
  g.poly(pts.flat()).stroke({ width, color, alpha: 0.6 });

/** Value noise that wraps every `period` lattice cells: for seamless repeating textures. */
function pnoise(x: number, y: number, period: number, seed: number) {
  const h = (i: number, j: number) => {
    i = ((i % period) + period) % period;
    j = ((j % period) + period) % period;
    let n = (i * 374761393 + j * 668265263 + seed * 1442695041) | 0;
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
/** A repeating overlay texture: per texel a shade (−1 dark … +1 light) laid over the surface's own colour. */
function overlayTexture(w: number, h: number, shadeAt: (x: number, y: number) => number) {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c = canvas.getContext('2d')!;
  const img = c.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.max(-1, Math.min(1, shadeAt(x, y)));
      const o = (y * w + x) * 4;
      const lightness = v > 0 ? 255 : 0;
      img.data.set([lightness, lightness, lightness, Math.abs(v) * 255], o);
    }
  c.putImageData(img, 0, 0);
  const t = Texture.from(canvas);
  t.source.style.addressMode = 'repeat';
  t.source.style.update();
  return t;
}
let surfaces: { plaster: Texture; tiles: Texture; thatch: Texture } | null = null;
/** Plaster, roof tiles and thatch, made on first use (needs a DOM canvas). */
const surface = () =>
  (surfaces ??= {
    // Plaster: soft blotches of damp and wear, and a fine grain.
    plaster: overlayTexture(64, 64, (x, y) => {
      const v = pnoise(x / 8, y / 8, 8, 1) * 0.65 + pnoise(x / 4, y / 4, 16, 2) * 0.35 - 0.5;
      const grain = pnoise(x, y, 64, 3) - 0.5;
      return v * 0.32 + grain * 0.12;
    }),
    // Clay tiles in staggered rows: each tile darker under the row above, a lit lower lip, a
    // shadowed gap at each side, and every tile a slightly different shade.
    tiles: overlayTexture(32, 24, (x, y) => {
      const row = Math.floor(y / 12);
      const ry = (y % 12) / 12;
      const tx = ((x + row * 4) % 8) / 8;
      const tile = Math.floor((x + row * 4) / 8) + row * 7;
      const lip = 0.84 + 0.08 * Math.sin(Math.PI * tx);
      let v = -0.35 * (1 - ry) ** 2 + (pnoise(tile * 1.7, row * 3.1, 64, 4) - 0.5) * 0.25;
      if (ry > lip - 0.1 && ry < lip) v += 0.22;
      if (ry >= lip) v -= 0.45;
      if (tx < 0.08 || tx > 0.94) v -= 0.3;
      return v + (pnoise(x / 2, y / 2, 16, 5) - 0.5) * 0.1;
    }),
    // Thatch: straw running down the slope, in layered courses.
    thatch: overlayTexture(32, 32, (x, y) => {
      const straw = pnoise(x * 0.9, y / 6, 29, 6) - 0.5;
      const course = (y % 16) / 16;
      return straw * 0.5 - (course > 0.85 ? 0.3 : 0) + (course < 0.15 ? 0.1 : 0);
    }),
  });
/**
 * Lay a surface texture over a face: `shape` is the outline, `origin` its top-left corner,
 * `along` and `down` the face's directions; `texel` world pixels per texture pixel.
 */
function overlay(
  g: Graphics,
  shape: number[][],
  origin: number[],
  along: number[],
  down: number[],
  tex: Texture,
  texel: number,
) {
  const la = Math.hypot(along[0], along[1]) || 1;
  const ld = Math.hypot(down[0], down[1]) || 1;
  const m = new Matrix(
    (along[0] / la) * texel,
    (along[1] / la) * texel,
    (down[0] / ld) * texel,
    (down[1] / ld) * texel,
    origin[0],
    origin[1],
  );
  g.poly(shape.flat()).fill({ texture: tex, matrix: m, textureSpace: 'global' });
}
/** A quad face (bottom-left, bottom-right, top-right, top-left) with a texture laid square on it. */
const overlayQuad = (g: Graphics, q: number[][], tex: Texture, texel: number) =>
  overlay(g, q, q[3], [q[1][0] - q[0][0], q[1][1] - q[0][1]], [q[0][0] - q[3][0], q[0][1] - q[3][1]], tex, texel);

/** Random seeded per building, so the same building always looks the same. */
let rnd: () => number = Math.random;

/**
 * Night lights (lit window glass, lanterns) also go here when set, shown additively after dark:
 * shapes into its first child, a Graphics, and soft pools of light as sprites beside it.
 */
let glowLayer: Container | null = null;
let glow: Graphics | null = null;
export const setGlow = (c: Container | null) => {
  glowLayer = c;
  glow = c ? (c.children[0] as Graphics) : null;
};
/** A soft round falloff, white: tinted and stretched into each pool of light. Painted once. */
let poolTexture: Texture | null = null;
/** A smooth pool of light centred on (x, y), rx × ry: no rings, unlike stacked shapes. */
function pool(x: number, y: number, rx: number, ry: number, color: number, alpha: number) {
  if (!glowLayer) return;
  if (!poolTexture) {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [t, a] of [
      [0, 1],
      [0.2, 0.78],
      [0.4, 0.45],
      [0.6, 0.2],
      [0.8, 0.06],
      [1, 0],
    ])
      g.addColorStop(t, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    poolTexture = Texture.from(c);
  }
  const s = new Sprite({ texture: poolTexture, anchor: 0.5, tint: color, alpha });
  s.position.set(x, y);
  s.setSize(rx * 2, ry * 2);
  glowLayer.addChild(s);
}
/** Sun for cast shadows: screen offset per pixel of height, and opacity (see daylight.ts). */
let sun = { dx: 0.4, dy: 0.17, alpha: 1 };
export const setSun = (s: typeof sun) => (sun = s);
/** How wet roofs are after rain, 0..1: darker, with a gleam along the ridge. */
let wet = 0;
export const setWet = (w: number) => (wet = w);
/** Rain on a roof face: darkened, wetter towards the eaves. */
/**
 * A few odd patches of tiles on roof face `face` (eave, eave, ridge, ridge): weathered darker or
 * newer and brighter, so no roof is a printed pattern. Stable per face.
 */
const patchRoof = (g: Graphics, face: number[][], roofColor: number) => {
  const r = mulberry32(Math.round(face[0][0] * 7 + face[0][1] * 13));
  const at = (u: number, v: number) => {
    const [e0, e1, r1, r0] = face;
    const a = [e0[0] + (e1[0] - e0[0]) * u, e0[1] + (e1[1] - e0[1]) * u];
    const b = [r0[0] + (r1[0] - r0[0]) * u, r0[1] + (r1[1] - r0[1]) * u];
    return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v];
  };
  for (let k = 0; k < 4; k++) {
    const [u, v, du, dv] = [0.1 + r() * 0.7, 0.05 + r() * 0.7, 0.05 + r() * 0.1, 0.08 + r() * 0.15];
    g.poly([...at(u, v), ...at(u + du, v), ...at(u + du, v + dv), ...at(u, v + dv)]).fill({
      color: shade(roofColor, r() < 0.6 ? 0.78 : 1.2),
      alpha: 0.45,
    });
  }
};

const wetRoof = (g: Graphics, face: number[][]) => {
  if (wet > 0) g.poly(face.flat()).fill({ color: 0x101820, alpha: 0.22 * wet });
};

/** Lights quad `pts` warmly at night; about one window in five stays dark (stable per position). */
function lit(pts: number[][]) {
  if (!glow) return;
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  if (Math.abs(Math.floor(cx * 7 + cy * 13)) % 5 === 0) return;
  // A soft halo, and light spilling onto the ground below the window.
  pool(cx, cy + 15, 26, 10, 0xff9a30, 0.32);
  pool(cx, cy, 18, 18, 0xff9a30, 0.3);
  pool(cx, cy, 7, 7, 0xffb040, 0.35);
  glow.poly(pts.flat()).fill(0xffc45a);
}
/** Small lantern at screen point (x, y): iron housing by day, a warm light with a pool on the ground by night. */
function lantern(g: Graphics, x: number, y: number, ground: number) {
  g.rect(x - 1, y - 1.6, 2, 3).fill(0x2a2420);
  if (!glow) return;
  pool(x, ground, 34, 13, 0xffa040, 0.42);
  pool(x, y, 15, 15, 0xff9a30, 0.4);
  pool(x, y, 5, 5, 0xffc860, 0.6);
  glow.rect(x - 0.7, y - 1.1, 1.4, 2).fill(0xffe0a0);
}

/** Scatter dots over a quad (corners bottom-left, bottom-right, top-right, top-left): plaster, stone grain. */
function speckle(g: Graphics, q: number[][], color: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const s = rnd();
    const t = rnd();
    const lerp = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const [x, y] = lerp(lerp(q[0], q[1], s), lerp(q[3], q[2], s), t);
    g.circle(x, y, 0.35 + rnd() * 0.35).fill({ color, alpha: alpha * (0.5 + rnd() * 0.5) });
  }
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Walls of a box from h0 to h1: the two faces turned to the viewer, plus the top. */
function walls(g: Graphics, b: Box, h0: number, h1: number, color: number, top = true) {
  const { x0, y0, x1, y1 } = b;
  const left = [P(x0, y1, h0), P(x1, y1, h0), P(x1, y1, h1), P(x0, y1, h1)];
  const right = [P(x1, y1, h0), P(x1, y0, h0), P(x1, y0, h1), P(x1, y1, h1)];
  // The face towards the sun (upper left) lit, the other in shade, whichever way it is turned.
  fill(g, left, shade(color, turned ? 0.72 : 0.92));
  fill(g, right, shade(color, turned ? 0.92 : 0.72));
  overlayQuad(g, left, surface().plaster, 0.3);
  overlayQuad(g, right, surface().plaster, 0.3);
  if (top) fill(g, [P(x0, y0, h1), P(x1, y0, h1), P(x1, y1, h1), P(x0, y1, h1)], color);
  // Weathering: rain-splash grime along the foot of the wall, the top a touch lighter.
  if (h1 - h0 > 6) {
    for (const [face, k] of [
      [left, 1],
      [right, 0.8],
    ] as const) {
      const at = (t: number, v: number) => [
        face[0][0] + (face[1][0] - face[0][0]) * t,
        face[0][1] + (face[1][1] - face[0][1]) * t - v,
      ];
      const foot = Math.min(4, (h1 - h0) * 0.3);
      g.poly([...at(0, 0), ...at(1, 0), ...at(1, foot), ...at(0, foot)]).fill({ color: 0x2a2018, alpha: 0.16 * k });
      g.poly([...at(0, h1 - h0 - 2.5), ...at(1, h1 - h0 - 2.5), ...at(1, h1 - h0), ...at(0, h1 - h0)]).fill({
        color: 0xffffff,
        alpha: 0.07 * k,
      });
    }
  }
  edge(g, left, shade(color, 0.5));
  edge(g, right, shade(color, 0.45));
  // Plaster grain: darker and lighter flecks, denser on the shaded face.
  const n = Math.round((h1 - h0) * 1.6);
  speckle(g, left, shade(color, 0.7), n, 0.35);
  speckle(g, left, shade(color, 1.1), n / 2, 0.3);
  speckle(g, right, shade(color, 0.55), n, 0.35);
  if (h0 === 0 && h1 > 8 && b.x1 - b.x0 > 0.6) {
    // Plaster flaked off here and there, the stonework showing through in a ragged patch.
    for (const [side, k] of [
      [onLeft, 1],
      [onRight, 0.8],
    ] as const) {
      if (rnd() < 0.35) continue;
      const t = 0.12 + rnd() * 0.6;
      const v = 3 + rnd() * (h1 - 9);
      const stone = shade(0xa89a84, k);
      side(g, b, t, t + 0.12, v, v + 3.2, stone);
      side(g, b, t + 0.03, t + 0.17, v + 1.2, v + 4.6, stone);
      side(g, b, t + 0.02, t + 0.15, v + 2.2, v + 2.5, shade(stone, 0.7));
      side(g, b, t + 0.08, t + 0.085, v + 2.5, v + 4.4, shade(stone, 0.7));
    }
    // Moss creeping up the wall from the plinth, thicker on the shaded face.
    speckle(g, [P(b.x0, b.y1, 2.2), P(b.x1, b.y1, 2.2), P(b.x1, b.y1, 4.2), P(b.x0, b.y1, 4.2)], 0x4a6a2a, 10, 0.35);
    speckle(g, [P(b.x1, b.y1, 2.2), P(b.x1, b.y0, 2.2), P(b.x1, b.y0, 5), P(b.x1, b.y1, 5)], 0x3e5e26, 18, 0.45);
  }
  if (h0 === 0 && h1 > 8) {
    // Stone plinth with a darker contact line where the wall meets the ground.
    onLeft(g, b, 0, 1, 0, 2.2, 0x8c867a);
    onRight(g, b, 0, 1, 0, 2.2, 0x6e695f);
    onLeft(g, b, 0, 1, 0, 0.7, 0x4a463f);
    onRight(g, b, 0, 1, 0, 0.7, 0x3c3934);
    // Joints between the plinth stones.
    const n = Math.round((b.x1 - b.x0 + b.y1 - b.y0) * 4);
    for (let k = 1; k < n; k++) {
      const t = k / n + (rnd() - 0.5) * 0.03;
      onLeft(g, b, t - 0.004, t + 0.004, 0.7, 2.2, 0x5a564c);
      onRight(g, b, t - 0.004, t + 0.004, 0.7, 2.2, 0x4a463e);
    }
  }
}

/** A rectangle drawn on the left face (y = y1) between fractions t0..t1 along x. */
const onLeft = (g: Graphics, b: Box, t0: number, t1: number, h0: number, h1: number, color: number) => {
  const x = (t: number) => b.x0 + t * (b.x1 - b.x0);
  const pts = [P(x(t0), b.y1, h0), P(x(t1), b.y1, h0), P(x(t1), b.y1, h1), P(x(t0), b.y1, h1)];
  fill(g, pts, color);
  return pts;
};
/** A rectangle drawn on the right face (x = x1) between fractions t0..t1 along y. */
const onRight = (g: Graphics, b: Box, t0: number, t1: number, h0: number, h1: number, color: number) => {
  const y = (t: number) => b.y0 + t * (b.y1 - b.y0);
  const pts = [P(b.x1, y(t1), h0), P(b.x1, y(t0), h0), P(b.x1, y(t0), h1), P(b.x1, y(t1), h1)];
  fill(g, pts, color);
  return pts;
};

/** Building with walls of height `wall` and a gable roof whose ridge runs along x. */
function gabled(g: Graphics, b: Box, wall: number, roof: number, wallColor: number, roofColor: number, thatch = false) {
  const { x0, y0, x1, y1 } = b;
  const yc = (y0 + y1) / 2;
  const o = 0.08;
  const top = wall + roof;
  walls(g, b, 0, wall, wallColor, false);
  // Shadow cast by the eaves on the walls below.
  onLeft(g, b, 0, 1, wall - 3, wall, shade(wallColor, 0.55));
  onRight(g, b, 0, 1, wall - 3, wall, shade(wallColor, 0.45));
  fill(g, [P(x1, y0, wall), P(x1, y1, wall), P(x1, yc, top)], shade(wallColor, 0.72));
  const north = [P(x0 - o, y0 - o, wall - 1), P(x1 + o, y0 - o, wall - 1), P(x1 + o, yc, top), P(x0 - o, yc, top)];
  const south = [P(x0 - o, y1 + o, wall - 1), P(x1 + o, y1 + o, wall - 1), P(x1 + o, yc, top), P(x0 - o, yc, top)];
  // Sunlit slope warm and bright, the far one well in shade.
  fill(g, north, shade(roofColor, 0.64));
  fill(g, south, shade(roofColor, 1.08));
  // Boarding up the gable end, plank by plank.
  for (let k = 1; k < 6; k++) {
    const y = y0 + ((y1 - y0) * k) / 6;
    const h = wall + roof * (1 - Math.abs(y - yc) / (yc - y0));
    const [a, b] = [P(x1, y, wall), P(x1, y, h)];
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
  }
  g.stroke({ width: 0.5, color: shade(wallColor, 0.5), alpha: 0.6 });
  // Roof covering laid along each slope, eave to ridge.
  const cover = thatch ? surface().thatch : surface().tiles;
  overlayQuad(g, south, cover, 0.42);
  overlayQuad(g, north, cover, 0.42);
  if (!thatch) {
    patchRoof(g, south, shade(roofColor, 1.08));
    patchRoof(g, north, shade(roofColor, 0.64));
  }
  wetRoof(g, south);
  wetRoof(g, north);
  const r0 = P(x0 - o, yc, top);
  const r1 = P(x1 + o, yc, top);
  g.moveTo(r0[0], r0[1])
    .lineTo(r1[0], r1[1])
    .stroke({ width: 2, color: shade(roofColor, 0.55) });
  if (wet > 0)
    g.moveTo(r0[0], r0[1] + 1.2)
      .lineTo(r1[0], r1[1] + 1.2)
      .stroke({ width: 0.8, color: 0xdde8f0, alpha: 0.35 * wet });
  edge(g, south, shade(roofColor, 0.45), 1);
}

const timber = (g: Graphics, b: Box, wall: number) => {
  const beam = 0x5b3b24;
  for (const t of [0, 0.5, 1]) onLeft(g, b, t - 0.02, t + 0.02, 0, wall, beam);
  onLeft(g, b, 0, 1, wall * 0.48, wall * 0.55, beam);
  for (const t of [0, 1]) onRight(g, b, t - 0.03, t + 0.03, 0, wall, beam);
};

/** Framed window with glass glint and a pair of shutters, on the left (y = y1) face. */
function windowLeft(g: Graphics, b: Box, t: number, w: number, h0: number, h1: number, shutter: number) {
  const sw = w * 0.55;
  onLeft(g, b, t - sw, t, h0, h1, shutter);
  onLeft(g, b, t + w, t + w + sw, h0, h1, shade(shutter, 0.85));
  onLeft(g, b, t - 0.01, t + w + 0.01, h0 - 0.8, h1 + 0.8, 0xe8e2d2);
  lit(onLeft(g, b, t + 0.01, t + w - 0.01, h0, h1, 0x2c3a4a));
  onLeft(g, b, t + 0.015, t + w * 0.45, h1 - (h1 - h0) * 0.45, h1 - 0.4, 0x6f8fae);
  // Glazing bars in a cross, and a sill casting a thin shadow.
  onLeft(g, b, t + w * 0.5 - 0.004, t + w * 0.5 + 0.004, h0, h1, 0xe8e2d2);
  onLeft(g, b, t + 0.01, t + w - 0.01, (h0 + h1) / 2 - 0.25, (h0 + h1) / 2 + 0.25, 0xe8e2d2);
  onLeft(g, b, t - 0.03, t + w + 0.03, h0 - 1.6, h0 - 0.7, 0xd8d0bc);
  onLeft(g, b, t - 0.02, t + w + 0.02, h0 - 2.2, h0 - 1.6, 0x5a5048);
}
function windowRight(g: Graphics, b: Box, t: number, w: number, h0: number, h1: number) {
  onRight(g, b, t - 0.01, t + w + 0.01, h0 - 0.8, h1 + 0.8, 0xc8c2b2);
  lit(onRight(g, b, t + 0.01, t + w - 0.01, h0, h1, 0x222e3a));
  onRight(g, b, t + w * 0.5 - 0.004, t + w * 0.5 + 0.004, h0, h1, 0xc8c2b2);
  onRight(g, b, t + 0.01, t + w - 0.01, (h0 + h1) / 2 - 0.25, (h0 + h1) / 2 + 0.25, 0xc8c2b2);
  onRight(g, b, t - 0.03, t + w + 0.03, h0 - 1.6, h0 - 0.7, 0xb8b0a0);
}
function door(g: Graphics, b: Box, t: number, w: number, h: number, color: number) {
  onLeft(g, b, t - 0.015, t + w + 0.015, 0, h + 1, 0x6e6658);
  onLeft(g, b, t, t + w, 0, h, color);
  // Planks, and a lintel beam over the frame.
  for (const k of [0.25, 0.5, 0.75]) onLeft(g, b, t + w * k - 0.004, t + w * k + 0.004, 0, h, shade(color, 0.65));
  onLeft(g, b, t - 0.03, t + w + 0.03, h + 1, h + 2.2, 0x5b3b24);
  // Iron hinges, a ring handle and a worn step.
  for (const hh of [h * 0.25, h * 0.75]) onLeft(g, b, t, t + w * 0.35, hh - 0.35, hh + 0.35, 0x2a2622);
  const [kx, ky] = P(b.x0 + (t + w * 0.8) * (b.x1 - b.x0), b.y1, h * 0.45);
  g.circle(kx, ky, 0.55).stroke({ width: 0.4, color: 0x2a2622 });
  onLeft(g, b, t - 0.03, t + w + 0.03, -0.6, 0.4, 0xa8a090);
  const [lx, ly] = P(b.x0 + (t + w + 0.06) * (b.x1 - b.x0), b.y1, h * 0.8);
  lantern(g, lx, ly, ly + h * 0.8);
}

const SHUTTERS = [0x3f6b4a, 0x4a5f8a, 0x8a3a2a, 0x6a5a2a];

const ROOFS = [0xb5452b, 0xa0522d, 0x9b3b2b, 0x8e5a3a];

/** Convex hull of points (monotone chain), for the area a footprint sweeps as its shadow. */
function hull(pts: number[][]) {
  pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: number[][]) => {
    const h: number[][] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  return [...half(pts), ...half([...pts].reverse())];
}
/** Soft cast shadow of a footprint `height` px tall: the footprint swept along the sun's direction. */
function shadow(g: Graphics, x: number, y: number, size: number, height = 26) {
  const foot = [P(x, y, 0), P(x + size, y, 0), P(x + size, y + size, 0), P(x, y + size, 0)];
  // A long low-sun shadow is kept within reach, and its edge is soft: four ever shorter sweeps.
  const reach = Math.min(1, 1.1 / Math.hypot(sun.dx, sun.dy));
  const swept = (k: number) =>
    hull([...foot, ...foot.map(([px, py]) => [px + sun.dx * height * k * reach, py + sun.dy * height * k * reach])]);
  for (const k of [1, 0.8, 0.6, 0.4]) g.poly(swept(k).flat()).fill({ color: 0x0a1a10, alpha: 0.055 * sun.alpha });
  // Contact shade: the ground darkens right against the walls, whatever the sun. It stays on the
  // plot (the walls stand a little in from its edge): a road alongside keeps its own colour.
  for (const e of [0.16, 0.1, 0.05]) {
    const q = [
      P(x + 0.18 - e, y + 0.18 - e, 0),
      P(x + size - 0.18 + e, y + 0.18 - e, 0),
      P(x + size - 0.18 + e, y + size - 0.18 + e, 0),
      P(x + 0.18 - e, y + size - 0.18 + e, 0),
    ];
    g.poly(q.flat()).fill({ color: 0x0a1a10, alpha: 0.07 });
  }
}

const WALL_COLORS = [0xece0c4, 0xd9b38c, 0xa9c4c9, 0xc9d6b0, 0xe6d5b8, 0xd8c0c8];
const DOOR_COLORS = [0x6b4426, 0x2f5a78, 0x3d6b3a, 0x7a2e2e, 0x4a4a52];
const AWNING_COLORS = [0xc8453a, 0x3f7fb0, 0xe0b040, 0x4f9a5a];

/** Hip roof: four sloping faces meeting at a short ridge along x. */
function hipped(g: Graphics, b: Box, wall: number, roof: number, wallColor: number, roofColor: number) {
  const { x0, y0, x1, y1 } = b;
  const o = 0.08;
  const top = wall + roof;
  const w = x1 - x0;
  const yc = (y0 + y1) / 2;
  walls(g, b, 0, wall, wallColor, false);
  const A = P(x0 + w * 0.3, yc, top);
  const B = P(x1 - w * 0.3, yc, top);
  const nw = P(x0 - o, y0 - o, wall - 1);
  const ne = P(x1 + o, y0 - o, wall - 1);
  const se = P(x1 + o, y1 + o, wall - 1);
  const sw = P(x0 - o, y1 + o, wall - 1);
  fill(g, [nw, ne, B, A], shade(roofColor, 0.64));
  fill(g, [sw, se, B, A], shade(roofColor, 1.08));
  fill(g, [nw, sw, A], shade(roofColor, 0.55));
  fill(g, [ne, se, B], shade(roofColor, 0.85));
  // Tiles on all four slopes, rows running along each eave.
  const tiles = surface().tiles;
  overlay(g, [sw, se, B, A], A, [se[0] - sw[0], se[1] - sw[1]], [sw[0] - A[0], sw[1] - A[1]], tiles, 0.42);
  patchRoof(g, [sw, se, B, A], shade(roofColor, 1.08));
  overlay(g, [nw, ne, B, A], A, [ne[0] - nw[0], ne[1] - nw[1]], [nw[0] - A[0], nw[1] - A[1]], tiles, 0.42);
  overlay(
    g,
    [nw, sw, A],
    A,
    [sw[0] - nw[0], sw[1] - nw[1]],
    [(nw[0] + sw[0]) / 2 - A[0], (nw[1] + sw[1]) / 2 - A[1]],
    tiles,
    0.42,
  );
  overlay(
    g,
    [ne, se, B],
    B,
    [se[0] - ne[0], se[1] - ne[1]],
    [(ne[0] + se[0]) / 2 - B[0], (ne[1] + se[1]) / 2 - B[1]],
    tiles,
    0.42,
  );
  for (const face of [
    [sw, se, B, A],
    [nw, ne, B, A],
    [nw, sw, A],
    [ne, se, B],
  ])
    wetRoof(g, face);
  if (wet > 0)
    g.moveTo(A[0], A[1] + 1)
      .lineTo(B[0], B[1] + 1)
      .stroke({ width: 0.8, color: 0xdde8f0, alpha: 0.35 * wet });
  edge(g, [sw, se, B, A], shade(roofColor, 0.45), 1);
}

/** Low fence around a yard, a hedge on the back, flower beds and a path to the door. */
function garden(g: Graphics, x: number, y: number, flower: number) {
  // Inside the 2×2 plot: a yard reaching into the next plot would be painted over by its building.
  const yard = { x0: x + 0.03, y0: y + 0.03, x1: x + 1.97, y1: y + 1.97 };
  const fence = 0x8a6a48;
  const post = (u: number, v: number) => {
    const bottom = P(u, v, 0);
    const top = P(u, v, 5);
    g.moveTo(bottom[0], bottom[1]).lineTo(top[0], top[1]);
  };
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.35));
    for (let i = 0; i <= n; i++) post(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
    for (const h of [2.2, 4.2]) {
      const a = P(ax, ay, h);
      const c = P(bx, by, h);
      g.moveTo(a[0], a[1]).lineTo(c[0], c[1]);
    }
  };
  // Fence on the two sides away from the road and the neighbours; the front is open for the path.
  side(yard.x0, yard.y0, yard.x1, yard.y0);
  side(yard.x0, yard.y0, yard.x0, yard.y1);
  g.stroke({ width: 0.8, color: fence, alpha: 0.95 });
  // Hedge along the back fence.
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const p = P(yard.x0 + (yard.x1 - yard.x0) * t, yard.y0 + 0.1, 0);
    g.ellipse(p[0], p[1] - 2, 4.2, 3).fill({ color: 0x3f7a34 });
    g.ellipse(p[0] - 1, p[1] - 3, 2.2, 1.6).fill({ color: 0x6aa84f, alpha: 0.9 });
  }
  // Flower beds beside the path, a few coloured blooms each.
  for (const [u, v] of [
    [x + 0.05, y + 1.78],
    [x + 1.5, y + 1.78],
  ] as const) {
    const bed = [P(u, v, 0), P(u + 0.4, v, 0), P(u + 0.4, v + 0.17, 0), P(u, v + 0.17, 0)].flat();
    g.poly(bed).fill({ color: 0x5a4030, alpha: 0.85 });
    for (let k = 0; k < 6; k++) {
      const q = P(u + 0.05 + rnd() * 0.3, v + 0.03 + rnd() * 0.11, 1);
      g.circle(q[0], q[1], 1.1).fill({ color: [flower, 0xffffff, 0xf7d34a][k % 3] });
    }
  }
  // Stepping path from the front of the house to the gate.
  const from = P(x + 0.5, y + 1.75, 0);
  const to = P(x + 0.5, y + 1.97, 0);
  g.moveTo(from[0], from[1]).lineTo(to[0], to[1]).stroke({ width: 3, color: 0xd6c39a, alpha: 0.9, cap: 'round' });
}

/** A house with one or two floors, a gable or hip roof, a painted wall and a coloured door and awning. */
/**
 * A home by the level of its people: peasants a single storey under thatch, burghers two storeys
 * under tiles, merchants a broad stone house under a hipped roof.
 */
function house(g: Graphics, x: number, y: number, variant: number, level: number) {
  const pick = (n: number) => Math.floor(rnd() * n);
  // The garden first: the fence behind the house must sit under the roof.
  if (!flip) garden(g, x, y, [0xd04a5a, 0xe07aa8, 0x7a5ad0][variant % 3]);
  const wallColor = level === 2 ? 0xe4dccb : WALL_COLORS[pick(WALL_COLORS.length)];
  const roof = level === 2 ? 0x7a2a22 : ROOFS[pick(ROOFS.length)];
  const floors = level ? 2 : 1;
  const wallH = floors === 2 ? 22 : 13;
  const b: Box =
    level === 2
      ? { x0: x + 0.12, y0: y + 0.18, x1: x + 1.88, y1: y + 1.78 }
      : { x0: x + 0.2, y0: y + 0.25, x1: x + 1.8, y1: y + 1.75 };
  if (level === 0) gabled(g, b, wallH, 12, wallColor, 0x9a8650, true);
  else if (level === 1 && rnd() < 0.5) gabled(g, b, wallH, 11, wallColor, roof);
  else hipped(g, b, wallH, level === 2 ? 13 : 11, wallColor, roof);
  // Merchants' houses stand on a dressed stone plinth.
  if (level === 2) walls(g, b, 0, 3, 0xa89e8a, false);
  if (wallColor === WALL_COLORS[0]) timber(g, b, wallH);
  const door_ = DOOR_COLORS[pick(DOOR_COLORS.length)];
  door(g, b, 0.43, 0.14, 8, door_);
  // Striped awning over the door.
  const awning = AWNING_COLORS[pick(AWNING_COLORS.length)];
  onLeft(g, b, 0.37, 0.63, 8.4, 10, awning);
  onLeft(g, b, 0.37, 0.63, 8.4, 8.9, shade(awning, 1.12));
  const sh = SHUTTERS[variant % SHUTTERS.length];
  const rows = floors === 2 ? [5, 14] : [5];
  for (const row of rows) {
    for (const t of [0.14, 0.72]) {
      windowLeft(g, b, t, 0.12, row, row + 4.5, sh);
      if (row === 5) {
        onLeft(g, b, t - 0.02, t + 0.14, 3.6, 5, 0x6b4426);
        onLeft(g, b, t, t + 0.12, 4.6, 5.6, [0xd04a5a, 0xe8c040, 0xe07aa8][variant % 3]);
      }
    }
    windowRight(g, b, 0.38, 0.24, row + 1, row + 5);
  }
  const at = (a: number, b: number, c: number, d: number): Box => ({ x0: x + a, y0: y + b, x1: x + c, y1: y + d });
  const stack = at(0.45, 0.45, 0.62, 0.62);
  walls(g, stack, wallH + 3, wallH + 14, 0x8a5a44);
  // Brick courses on the chimney, every other joint staggered.
  for (let k = 1; k < 5; k++) {
    const h = wallH + 3 + k * 2.2;
    onLeft(g, stack, 0, 1, h - 0.15, h + 0.15, 0x5e3a2a);
    onRight(g, stack, 0, 1, h - 0.15, h + 0.15, 0x4e2e22);
    onLeft(g, stack, k % 2 ? 0.48 : 0.2, (k % 2 ? 0.48 : 0.2) + 0.03, h, h + 2.2, 0x5e3a2a);
  }
  walls(g, at(0.42, 0.42, 0.65, 0.65), wallH + 14, wallH + 15.5, 0x5e3e30);
  // Something of the household beside the walls: a woodpile, a bench or a rain barrel.
  const kind = variant % 3;
  if (kind === 0) {
    const pile = at(1.82, 0.45, 1.96, 1.2);
    walls(g, pile, 0, 6, 0x7a5028);
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 4; k++) {
        const [cx, cy] = P(pile.x1, pile.y0 + (0.1 + k * 0.2) * (pile.y1 - pile.y0), 1.1 + row * 1.9);
        g.ellipse(cx, cy, 1.1, 0.8).fill(0xd8b880).stroke({ width: 0.3, color: 0x7a4f25 });
      }
  } else if (kind === 1) {
    const bench = at(1.0, 1.82, 1.6, 1.93);
    walls(g, bench, 2, 3, 0x8a6038);
    for (const u of [1.05, 1.55]) walls(g, at(u, 1.84, u + 0.04, 1.9), 0, 2, 0x5a3e22);
  } else {
    const [bx, by] = P(x + 1.88, y + 1.55, 0);
    g.roundRect(bx - 2.6, by - 7, 5.2, 7, 1.6).fill(0x6e4a2a);
    g.ellipse(bx, by - 7, 2.6, 1.1).fill(0x3a4a5a);
    g.moveTo(bx - 2.6, by - 2)
      .lineTo(bx + 2.6, by - 2)
      .moveTo(bx - 2.6, by - 5)
      .lineTo(bx + 2.6, by - 5);
    g.stroke({ width: 0.5, color: 0x333333 });
  }
}

/** Wooden crate on tile point (x, y), `s` tiles wide, standing at height h0. */
function crate(g: Graphics, x: number, y: number, s: number, color: number, h0 = 0) {
  const b = { x0: x, y0: y, x1: x + s, y1: y + s };
  walls(g, b, h0, h0 + s * 16, color);
  const a = P(x, y + s, h0);
  const c = P(x + s, y + s, h0 + s * 16);
  g.moveTo(a[0], a[1])
    .lineTo(c[0], c[1])
    .stroke({ width: 0.6, color: shade(color, 0.55) });
}
/** Barrel standing at tile point (x, y). */
function barrel(g: Graphics, x: number, y: number) {
  const [sx, sy] = P(x, y, 0);
  g.roundRect(sx - 3, sy - 8, 6, 8, 2).fill(0x7a5230);
  g.ellipse(sx, sy - 8, 3, 1.3).fill(0x9a6e40);
  g.moveTo(sx - 3, sy - 2.5)
    .lineTo(sx + 3, sy - 2.5)
    .moveTo(sx - 3, sy - 6)
    .lineTo(sx + 3, sy - 6);
  g.stroke({ width: 0.6, color: 0x3a3a3a });
}
/** Grain sack at tile point (x, y). */
function sack(g: Graphics, x: number, y: number) {
  const [sx, sy] = P(x, y, 0);
  g.ellipse(sx, sy - 3, 3.4, 3.2).fill(0xd2c29a);
  g.ellipse(sx + 1, sy - 2, 2, 2).fill(0xbfae85);
  g.rect(sx - 1, sy - 7, 2, 1.6).fill(0x8a7a5a);
}
/** Treadwheel crane: mast at tile point (x, y), jib reaching out, a crate on the rope. */
function crane(g: Graphics, x: number, y: number) {
  walls(g, { x0: x - 0.06, y0: y - 0.06, x1: x + 0.06, y1: y + 0.06 }, 0, 44, 0x6a4a2a);
  const base = P(x, y, 40);
  const tip = P(x + 0.8, y + 0.35, 50);
  g.moveTo(base[0], base[1]).lineTo(tip[0], tip[1]).stroke({ width: 2.2, color: 0x5a3e22 });
  const brace = P(x, y, 26);
  g.moveTo(brace[0], brace[1])
    .lineTo((base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2)
    .stroke({ width: 1.2, color: 0x5a3e22 });
  g.moveTo(tip[0], tip[1])
    .lineTo(tip[0], tip[1] + 26)
    .stroke({ width: 0.6, color: 0x2a2018 });
  g.rect(tip[0] - 3.5, tip[1] + 26, 7, 6)
    .fill(0xa07a46)
    .stroke({ width: 0.6, color: 0x5a3e22 });
  // Treadwheel beside the mast.
  const w = P(x - 0.3, y + 0.05, 9);
  g.ellipse(w[0], w[1], 4.5, 9).stroke({ width: 1.6, color: 0x6a4a2a });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    g.moveTo(w[0] - Math.cos(a) * 4.5, w[1] - Math.sin(a) * 9).lineTo(w[0] + Math.cos(a) * 4.5, w[1] + Math.sin(a) * 9);
  }
  g.stroke({ width: 0.6, color: 0x5a3e22 });
}

/** A harbour's or fisher's pier: from the middle of a waterside footprint edge out over the sea, front sides first. */
export function pierBox(map: GameMap, x: number, y: number, size: number) {
  const water = (u: number, v: number) => terrainAt(map, u, v) === 'water';
  const m = size / 2;
  const L = 2.2;
  const W2 = 0.25;
  const mid = Math.floor(m);
  if (water(x + size, y + mid)) return { x0: x + size, y0: y + m - W2, x1: x + size + L, y1: y + m + W2 };
  if (water(x + mid, y + size)) return { x0: x + m - W2, y0: y + size, x1: x + m + W2, y1: y + size + L };
  if (water(x - 1, y + mid)) return { x0: x - L, y0: y + m - W2, x1: x, y1: y + m + W2 };
  if (water(x + mid, y - 1)) return { x0: x + m - W2, y0: y - L, x1: x + m + W2, y1: y };
  return null;
}

/** Wooden pier over the tile box (x0, y0)–(x1, y1): a plank deck on posts standing in the sea. */
export function drawPier(g: Graphics, x0: number, y0: number, x1: number, y1: number, mirrored = false) {
  flip = mirrored;
  lift = 0;
  rnd = mulberry32(Math.round(x0 * 131 + y0 * 31));
  const along = x1 - x0 > y1 - y0;
  const len = along ? x1 - x0 : y1 - y0;
  const at = (t: number, s: number) => (along ? [x0 + t, y0 + s * (y1 - y0)] : [x0 + s * (x1 - x0), y0 + t]);
  for (let t = 0.25; t < len; t += 0.65)
    for (const s of [0.15, 0.85]) {
      const [px, py] = at(t, s);
      walls(g, { x0: px - 0.05, y0: py - 0.05, x1: px + 0.05, y1: py + 0.05 }, -4, 3, 0x4e3620);
    }
  walls(g, { x0, y0, x1, y1 }, 2.4, 3.4, 0x9a7650);
  // Plank seams across the deck.
  for (let t = 0.14; t < len; t += 0.14) {
    const [ax, ay] = at(t, 0);
    const [bx, by] = at(t, 1);
    const a = P(ax, ay, 3.4);
    const b = P(bx, by, 3.4);
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 0.5, color: 0x6e5236 });
  }
  // Lantern post at the far end.
  const [ex, ey] = at(len - 0.15, 0.85);
  const base = P(ex, ey, 3.4);
  const top = P(ex, ey, 14);
  g.moveTo(base[0], base[1]).lineTo(top[0], top[1]).stroke({ width: 1, color: 0x3a2a1a });
  lantern(g, top[0], top[1] + 1, base[1] + 4);
  flip = false;
}

/** Draws building `type` with its top corner at tile (x, y). `variant` picks colours. */
export function drawBuilding(
  g: Graphics,
  type: BuildingId,
  x: number,
  y: number,
  variant = 0,
  mirrored = false,
  shadowed = true,
  /** A house's level (see data/population.ts). */
  level = 0,
  /** 1: turned, the front facing the other way. */
  rot = 0,
) {
  const size = BUILDINGS[type].size;
  rnd = mulberry32(variant * 7919 + x * 131 + y * 31 + type.length);
  flip = mirrored;
  lift = liftAt(x, y);
  if (!flip && shadowed) shadow(g, x, y, size);
  turned = rot === 1;
  mid = [x + size / 2, y + size / 2];
  const box = (a: number, b: number, c: number, d: number): Box => ({ x0: x + a, y0: y + b, x1: x + c, y1: y + d });
  switch (type) {
    case 'house':
      house(g, x, y, variant, level);
      break;
    case 'harbor': {
      // Harbour office: stone ground floor, timber gable, flag on the ridge.
      const b = box(0.15, 0.15, 1.2, 1.25);
      gabled(g, b, 16, 11, 0xb08a5a, 0x6b3f22);
      walls(g, b, 0, 8, 0xa89e8a, false);
      door(g, b, 0.4, 0.28, 10, 0x4a2f1a);
      windowLeft(g, b, 0.12, 0.14, 11, 14.5, 0x5a3a20);
      windowRight(g, b, 0.35, 0.3, 10, 14);
      const pole = P(x + 0.68, y + 0.7, 27);
      const tip = P(x + 0.68, y + 0.7, 46);
      g.moveTo(pole[0], pole[1]).lineTo(tip[0], tip[1]).stroke({ width: 1.2, color: 0x4a3420 });
      g.poly([tip[0], tip[1], tip[0] + 12, tip[1] + 3.5, tip[0], tip[1] + 7]).fill(0xc0392b);
      // Cargo waiting on the quay.
      crate(g, x + 1.35, y + 0.25, 0.3, 0xa07a46);
      crate(g, x + 1.62, y + 0.3, 0.26, 0x8f6a3c);
      crate(g, x + 1.4, y + 0.3, 0.22, 0xb08850, 0.3 * 16);
      barrel(g, x + 1.3, y + 0.95);
      barrel(g, x + 1.5, y + 1.05);
      // Wooden treadwheel crane at the front corner.
      crane(g, x + 1.6, y + 1.55);
      break;
    }
    case 'warehouse': {
      // Long hall: stone below, timber above, big braced doors and a hoist at the gable.
      const b = box(0.1, 0.12, 1.9, 1.45);
      gabled(g, b, 17, 14, 0xc9a46c, 0x7a4a2a);
      timber(g, b, 17);
      walls(g, b, 0, 7, 0x9a9282, false);
      onLeft(g, b, 0, 1, 6.6, 7.4, 0x6e6658);
      for (const t of [0.22, 0.58]) {
        onLeft(g, b, t, t + 0.2, 0, 12, 0x5a3a20);
        const [a1, a2] = [P(b.x0 + t * 1.8, b.y1, 0), P(b.x0 + (t + 0.2) * 1.8, b.y1, 12)];
        g.moveTo(a1[0], a1[1]).lineTo(a2[0], a2[1]).stroke({ width: 1, color: 0x3a2412 });
        onLeft(g, b, t + 0.098, t + 0.102, 0, 12, 0x3a2412);
      }
      windowRight(g, b, 0.35, 0.3, 10, 14);
      // Hoist beam over the loft door, rope and pulley.
      onRight(g, b, 0.4, 0.6, 18, 25, 0x4a2f1a);
      const h0 = P(b.x1, y + 0.78, 27);
      const h1 = P(b.x1 + 0.3, y + 0.78, 27);
      g.moveTo(h0[0], h0[1]).lineTo(h1[0], h1[1]).stroke({ width: 2, color: 0x4a3420 });
      g.circle(h1[0], h1[1] + 1.5, 1.6).fill(0x2a2018);
      g.moveTo(h1[0], h1[1] + 2)
        .lineTo(h1[0], h1[1] + 20)
        .stroke({ width: 0.6, color: 0x3a3020 });
      // Goods out front: crates, barrels and sacks.
      crate(g, x + 1.15, y + 1.55, 0.26, 0xa07a46);
      crate(g, x + 1.45, y + 1.6, 0.3, 0x8f6a3c);
      crate(g, x + 1.5, y + 1.65, 0.2, 0xb08850, 0.3 * 16);
      barrel(g, x + 0.35, y + 1.75);
      barrel(g, x + 0.6, y + 1.8);
      sack(g, x + 0.85, y + 1.75);
      sack(g, x + 0.95, y + 1.85);
      break;
    }
    case 'lumberjack': {
      // Log cabin: walls of stacked logs, shingle roof.
      const b = box(0.15, 0.15, 1.1, 1.05);
      gabled(g, b, 10, 9, 0x8a6238, 0x5e4a2e);
      for (let h = 1.5; h < 10; h += 1.8) {
        onLeft(g, b, 0, 1, h, h + 0.5, 0x5a3e22);
        onRight(g, b, 0, 1, h, h + 0.5, 0x4a321c);
      }
      door(g, b, 0.38, 0.26, 7, 0x4a2f1a);
      windowRight(g, b, 0.35, 0.3, 4, 7);
      // Big log pile: ends stacked in a pyramid on its front face.
      const pile = box(1.2, 0.2, 1.85, 1.25);
      walls(g, pile, 0, 9, 0x7a5028);
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 5 - row; k++) {
          const c = P(pile.x0 + (0.1 + (k + row * 0.5) * 0.13) * 1, pile.y1, 1.6 + row * 3);
          g.ellipse(c[0], c[1], 2.4, 1.6).fill(0xdcb980).stroke({ width: 0.6, color: 0x7a4f25 });
        }
      // Chopping block with an axe, chips, and a sawhorse with a log.
      const stump = P(x + 0.55, y + 1.5, 0);
      g.rect(stump[0] - 3, stump[1] - 4, 6, 4).fill(0x6a4626);
      g.ellipse(stump[0], stump[1] - 4, 3, 1.3).fill(0xd2b07a);
      g.moveTo(stump[0] + 1, stump[1] - 4)
        .lineTo(stump[0] + 5, stump[1] - 10)
        .stroke({ width: 1, color: 0x5a3a20 });
      g.poly([stump[0] - 0.5, stump[1] - 3.5, stump[0] + 2.5, stump[1] - 5.5, stump[0] + 1, stump[1] - 2]).fill(
        0x9aa0a6,
      );
      for (let k = 0; k < 8; k++) g.rect(stump[0] - 7 + rnd() * 14, stump[1] - 1 + rnd() * 3, 1.2, 0.8).fill(0xd8b880);
      const s0 = P(x + 1.25, y + 1.55, 0);
      const s1 = P(x + 1.75, y + 1.55, 0);
      for (const sp of [s0, s1])
        g.moveTo(sp[0] - 2, sp[1])
          .lineTo(sp[0], sp[1] - 5)
          .lineTo(sp[0] + 2, sp[1])
          .stroke({ width: 0.8, color: 0x4a3420 });
      g.moveTo(s0[0] - 3, s0[1] - 6.5)
        .lineTo(s1[0] + 3, s1[1] - 6.5)
        .stroke({ width: 3.2, color: 0x8b5a2b });
      g.ellipse(s1[0] + 3, s1[1] - 6.5, 1.2, 1.6).fill(0xdcb980);
      break;
    }
    case 'fisher': {
      // Weathered plank hut with a thatched roof.
      const b = box(0.15, 0.15, 1.0, 1.0);
      gabled(g, b, 9, 10, 0x8fa3a6, 0x9a8650, true);
      for (let t = 0.1; t < 1; t += 0.12) {
        onLeft(g, b, t, t + 0.01, 0, 9, 0x6a7c80);
        onRight(g, b, t, t + 0.01, 0, 9, 0x56676a);
      }
      door(g, b, 0.38, 0.28, 7, 0x4a3a2a);
      // Net drying rack: two posts, a net with a mesh hanging between them.
      const p1 = P(x + 1.45, y + 0.25, 0);
      const p2 = P(x + 1.45, y + 1.15, 0);
      const t1 = P(x + 1.45, y + 0.25, 15);
      const t2 = P(x + 1.45, y + 1.15, 15);
      g.poly([...t1, ...t2, p2[0], p2[1] - 4, p1[0], p1[1] - 4]).fill({ color: 0x8a8460, alpha: 0.35 });
      for (let k = 1; k < 8; k++) {
        const a = [t1[0] + ((t2[0] - t1[0]) * k) / 8, t1[1] + ((t2[1] - t1[1]) * k) / 8];
        g.moveTo(a[0], a[1]).lineTo(a[0], a[1] + 11);
      }
      for (let k = 1; k < 4; k++) g.moveTo(t1[0], t1[1] + k * 3).lineTo(t2[0], t2[1] + k * 3);
      g.stroke({ width: 0.4, color: 0x4a4430, alpha: 0.7 });
      g.moveTo(p1[0], p1[1]).lineTo(t1[0], t1[1]).moveTo(p2[0], p2[1]).lineTo(t2[0], t2[1]);
      g.stroke({ width: 1.4, color: 0x4a3420 });
      // Fish drying on a pole.
      const f0 = P(x + 0.3, y + 1.45, 11);
      const f1 = P(x + 1.0, y + 1.45, 11);
      g.moveTo(f0[0], f0[1])
        .lineTo(f0[0], f0[1] + 11)
        .moveTo(f1[0], f1[1])
        .lineTo(f1[0], f1[1] + 11);
      g.moveTo(f0[0], f0[1]).lineTo(f1[0], f1[1]).stroke({ width: 1, color: 0x4a3420 });
      for (let k = 1; k < 7; k++) {
        const fx = f0[0] + ((f1[0] - f0[0]) * k) / 7;
        const fy = f0[1] + ((f1[1] - f0[1]) * k) / 7;
        g.ellipse(fx, fy + 3, 0.9, 2.6).fill(k % 2 ? 0xb8c4c8 : 0x9aa8ae);
      }
      // Upturned rowing boat and a barrel.
      const bt = P(x + 0.55, y + 1.8, 0);
      g.ellipse(bt[0], bt[1] - 1.5, 9, 3.4).fill(0x6a4a2a);
      g.ellipse(bt[0], bt[1] - 2.2, 8, 2.4).fill(0x8a6038);
      g.moveTo(bt[0] - 8, bt[1] - 2)
        .lineTo(bt[0] + 8, bt[1] - 2)
        .stroke({ width: 0.5, color: 0x4a3018 });
      barrel(g, x + 1.15, y + 1.8);
      break;
    }
    case 'sheepfarm': {
      // Thatched fold at the back, a fenced paddock in front with the flock and a haystack.
      const b = box(0.12, 0.12, 1.15, 0.85);
      gabled(g, b, 8, 9, 0x9a7a52, 0xa08a50, true);
      for (let t = 0.08; t < 1; t += 0.11) onLeft(g, b, t, t + 0.012, 0, 8, 0x6a5232);
      door(g, b, 0.55, 0.3, 6.5, 0x4a3a2a);
      const hay = P(x + 1.55, y + 0.45, 0);
      g.ellipse(hay[0], hay[1] - 4, 7, 6).fill(0xc8a850);
      g.ellipse(hay[0] - 2, hay[1] - 6, 3.5, 2.6).fill(0xdcc070);
      g.moveTo(hay[0] - 6, hay[1] - 2)
        .lineTo(hay[0] + 6, hay[1] - 2)
        .stroke({ width: 0.5, color: 0x8a7030 });
      // Sheep: woolly bodies, dark faces, a few heads down grazing.
      for (const [u, v, k] of [
        [0.45, 1.25, 0],
        [0.85, 1.45, 1],
        [1.3, 1.2, 0],
        [1.55, 1.6, 1],
        [0.95, 1.05, 0],
      ]) {
        const [sx, sy] = P(x + u, y + v, 0);
        g.ellipse(sx + 0.5, sy, 4, 1.2).fill({ color: 0x000000, alpha: 0.18 });
        g.rect(sx - 2, sy - 2.5, 0.8, 2.5)
          .fill(0x3a3430)
          .rect(sx + 1.6, sy - 2.5, 0.8, 2.5)
          .fill(0x3a3430);
        g.ellipse(sx, sy - 4, 3.6, 2.4).fill(0xeee8d8);
        g.ellipse(sx - 0.8, sy - 4.8, 2.2, 1.3).fill(0xfaf6ec);
        g.ellipse(sx + 3.6, sy - (k ? 2.6 : 4.8), 1.3, 1).fill(0x3a3430);
      }
      // Post-and-rail fence round the paddock's open sides.
      const fence = [
        [0.08, 0.95],
        [0.08, 1.9],
        [1.9, 1.9],
        [1.9, 0.08],
      ];
      for (let k = 0; k < fence.length - 1; k++) {
        const [a, c] = [fence[k], fence[k + 1]];
        for (const h of [2.2, 4.2]) {
          const [p0, p1] = [P(x + a[0], y + a[1], h), P(x + c[0], y + c[1], h)];
          g.moveTo(p0[0], p0[1]).lineTo(p1[0], p1[1]);
        }
        for (let t = 0; t <= 1; t += 0.2) {
          const [px, py] = P(x + a[0] + (c[0] - a[0]) * t, y + a[1] + (c[1] - a[1]) * t, 0);
          g.moveTo(px, py).lineTo(px, py - 5);
        }
      }
      g.stroke({ width: 0.8, color: 0x6a4a2a });
      break;
    }
    case 'weaver': {
      // Half-timbered workshop; bolts of dyed cloth drying on a line in front.
      const b = box(0.15, 0.15, 1.45, 1.25);
      gabled(g, b, 14, 10, 0xe2d6b8, 0x8a4a32);
      timber(g, b, 14);
      door(g, b, 0.42, 0.18, 8, 0x5a3a20);
      for (const t of [0.12, 0.72]) windowLeft(g, b, t, 0.12, 5, 9.5, 0x4a6a8a);
      windowRight(g, b, 0.3, 0.3, 6, 10);
      const [l0, l1] = [P(x + 1.62, y + 0.25, 12), P(x + 1.62, y + 1.6, 12)];
      for (const [px, py] of [l0, l1]) g.moveTo(px, py).lineTo(px, py + 12);
      g.moveTo(l0[0], l0[1]).lineTo(l1[0], l1[1]);
      g.stroke({ width: 1, color: 0x4a3420 });
      [0x3f5f8a, 0xb84a3a, 0xd8c890, 0x5a7a3a].forEach((c, k) => {
        const t = 0.15 + k * 0.2;
        const [a0, a1] = [P(x + 1.62, y + 0.25 + t * 1.35, 12), P(x + 1.62, y + 0.25 + (t + 0.14) * 1.35, 12)];
        g.poly([a0[0], a0[1], a1[0], a1[1], a1[0], a1[1] + 8, a0[0], a0[1] + 7]).fill(c);
        g.poly([a0[0], a0[1], a1[0], a1[1], a1[0], a1[1] + 1.2, a0[0], a0[1] + 1.2]).fill(shade(c, 0.7));
      });
      sack(g, x + 0.3, y + 1.55);
      sack(g, x + 0.55, y + 1.62);
      break;
    }
    case 'smithy': {
      // Stone forge under a slate roof, its open front glowing, an anvil and a quench tub outside.
      const b = box(0.2, 0.2, 1.35, 1.3);
      gabled(g, b, 11, 9, 0xa09a8c, 0x4f5866);
      lit(onLeft(g, b, 0.35, 0.75, 0, 7, 0x2a1a12));
      onLeft(g, b, 0.4, 0.7, 0, 3, 0xd8742a);
      onLeft(g, b, 0.45, 0.65, 0.5, 2, 0xffc060);
      onLeft(g, b, 0.32, 0.78, 7, 8.2, 0x5b3b24);
      windowRight(g, b, 0.35, 0.3, 5, 8);
      const stack = box(0.35, 0.35, 0.62, 0.62);
      walls(g, stack, 11, 28, 0x8a8478);
      walls(g, box(0.32, 0.32, 0.65, 0.65), 28, 29.5, 0x5e5850);
      const [ax, ay] = P(x + 1.0, y + 1.6, 0);
      g.rect(ax - 1.5, ay - 4, 3, 4).fill(0x5a3e22);
      g.poly([ax - 4, ay - 6, ax + 3, ay - 6, ax + 4.5, ay - 5, ax + 3, ay - 4, ax - 3, ay - 4]).fill(0x3a3e44);
      g.rect(ax - 4, ay - 6.4, 7, 0.6).fill(0x8a9098);
      barrel(g, x + 1.6, y + 1.5);
      crate(g, x + 1.45, y + 0.3, 0.3, 0x7a5a36);
      break;
    }
    case 'brickworks': {
      // A squat kiln with its own chimney, a drying shed on posts, stacks of finished bricks.
      const kiln = box(0.15, 0.15, 0.95, 0.95);
      walls(g, kiln, 0, 12, 0xa8543a);
      fill(g, [P(kiln.x0, kiln.y1, 12), P(kiln.x1, kiln.y1, 12), P(0.55 + x, 0.55 + y, 19)], 0x8a3e2a);
      fill(g, [P(kiln.x1, kiln.y1, 12), P(kiln.x1, kiln.y0, 12), P(0.55 + x, 0.55 + y, 19)], 0x6e3020);
      lit(onLeft(g, kiln, 0.35, 0.65, 0, 4.5, 0x2a1410));
      onLeft(g, kiln, 0.4, 0.6, 0.3, 2.4, 0xe0802a);
      const stack = box(0.48, 0.48, 0.66, 0.66);
      walls(g, stack, 16, 30, 0x8a4430);
      // Drying shed: four posts and a plank roof over rows of green bricks.
      const shed = box(1.05, 0.2, 1.85, 1.0);
      for (const [u, v] of [
        [shed.x0, shed.y0],
        [shed.x1, shed.y0],
        [shed.x0, shed.y1],
        [shed.x1, shed.y1],
      ]) {
        const [p0, p1] = [P(u, v, 0), P(u, v, 9)];
        g.moveTo(p0[0], p0[1]).lineTo(p1[0], p1[1]);
      }
      g.stroke({ width: 1, color: 0x4a3420 });
      for (let k = 0; k < 3; k++) walls(g, box(1.15, 0.3 + k * 0.22, 1.75, 0.4 + k * 0.22), 0, 2.5, 0x9a8a6a);
      fill(
        g,
        [
          P(shed.x0 - 0.05, shed.y0, 10),
          P(shed.x1 + 0.05, shed.y0, 10),
          P(shed.x1 + 0.05, shed.y1 + 0.08, 8.5),
          P(shed.x0 - 0.05, shed.y1 + 0.08, 8.5),
        ],
        0x7a5a36,
      );
      // Fired bricks stacked in the yard.
      for (const [u, v] of [
        [0.3, 1.3],
        [0.75, 1.45],
        [1.3, 1.4],
      ]) {
        const pile = box(u, v, u + 0.3, v + 0.25);
        walls(g, pile, 0, 6, 0xb5523a);
        for (let h = 1.5; h < 6; h += 1.5) onLeft(g, pile, 0, 1, h - 0.15, h + 0.15, 0x7a3020);
      }
      break;
    }
    case 'chapel': {
      const nave = box(0.2, 0.4, 1.6, 1.55);
      gabled(g, nave, 14, 10, 0xe2dccd, 0x4f5866);
      for (const t of [0.15, 0.45]) lit(onLeft(g, nave, t, t + 0.1, 5, 11, 0x6a7fa0));
      // Round window in the front gable.
      const rw = P(nave.x1, (nave.y0 + nave.y1) / 2, 18);
      g.circle(rw[0], rw[1], 2.6).fill(0x6a7fa0).stroke({ width: 0.8, color: 0xb8b0a0 });
      const t = box(1.25, 1.2, 1.85, 1.8);
      walls(g, t, 0, 32, 0xd6cfbf);
      onLeft(g, t, 0.3, 0.7, 0, 9, 0x5a3a20);
      onLeft(g, t, 0.35, 0.65, 20, 27, 0x2b2b35);
      onRight(g, t, 0.35, 0.65, 20, 27, 0x2b2b35);
      // Bell in the belfry opening.
      const bell = P(t.x0 + 0.3, t.y1, 22.5);
      g.poly([
        bell[0] - 2.2,
        bell[1] + 1.5,
        bell[0] - 1.4,
        bell[1] - 2.5,
        bell[0] + 1.4,
        bell[1] - 2.5,
        bell[0] + 2.2,
        bell[1] + 1.5,
      ]).fill(0xc8a040);
      const apex = P(x + 1.55, y + 1.5, 52);
      const c = [P(t.x0, t.y1, 32), P(t.x1, t.y1, 32), P(t.x1, t.y0, 32)];
      fill(g, [c[0], c[1], apex], 0x5a6474);
      fill(g, [c[1], c[2], apex], 0x434b58);
      g.moveTo(apex[0], apex[1])
        .lineTo(apex[0], apex[1] - 8)
        .moveTo(apex[0] - 3, apex[1] - 5.5)
        .lineTo(apex[0] + 3, apex[1] - 5.5);
      g.stroke({ width: 1.2, color: 0xd4af37 });
      // Small churchyard: grave crosses on the left.
      for (const [gx, gy] of [
        [0.3, 1.75],
        [0.6, 1.8],
        [0.9, 1.75],
      ]) {
        const q = P(x + gx, y + gy, 0);
        g.moveTo(q[0], q[1])
          .lineTo(q[0], q[1] - 6)
          .moveTo(q[0] - 2, q[1] - 4.5)
          .lineTo(q[0] + 2, q[1] - 4.5);
        g.stroke({ width: 1, color: 0x8a8478 });
      }
      break;
    }
    case 'road':
      break;
  }
  flip = false;
  turned = false;
}

/** World point where smoke leaves a building's chimney, if it has one. */
export function chimneyAt(type: BuildingId, x: number, y: number, level = 0, rot = 0) {
  lift = liftAt(x, y);
  // The forge and the kiln smoke too; a house's chimney rises with its storeys.
  const at = { house: [0.535, level ? 38 : 29], smithy: [0.485, 30], brickworks: [0.57, 31] }[type as string];
  if (!at) return null;
  turned = rot === 1;
  mid = [x + BUILDINGS[type].size / 2, y + BUILDINGS[type].size / 2];
  const [px, py] = P(x + at[0], y + at[0], at[1]);
  turned = false;
  return { x: px, y: py };
}

/** World point of a forge's or kiln's glowing mouth, where sparks fly out, if it has one. */
export function forgeAt(type: BuildingId, x: number, y: number, rot = 0) {
  const at = { smithy: [0.83, 1.3, 2], brickworks: [0.55, 0.95, 2] }[type as string];
  if (!at) return null;
  lift = liftAt(x, y);
  turned = rot === 1;
  mid = [x + 1, y + 1];
  const [px, py] = P(x + at[0], y + at[1], at[2]);
  turned = false;
  return { x: px, y: py };
}

/** Dirt roads on tiles [x0, x1) × [y0, y1): a rounded track joined to every road neighbour. */
/** `wet`: 0 dry .. 1 after heavy rain, when puddles stand in many more ruts. */
export function drawRoads(g: Graphics, w: World, x0 = 0, y0 = 0, x1 = w.map.width, y1 = w.map.height, wet = 0) {
  const isRoad = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < w.map.width &&
    y < w.map.height &&
    w.buildings.get(w.occupied[y * w.map.width + x])?.type === 'road';
  const segs: number[][] = [];
  /** Road over a river: a wooden bridge instead of dirt. */
  const bridges: number[][] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!isRoad(x, y)) continue;
      const c = groundToScreen(x + 0.5, y + 0.5);
      const over = w.map.tiles[y * w.map.width + x] === 'river' ? bridges : segs;
      over.push([c.x, c.y, c.x, c.y]);
      // All four directions: a neighbour in another chunk draws its own half.
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ])
        if (isRoad(x + dx, y + dy)) {
          // Halfway to the neighbour's (maybe raised) centre: across a cliff the road is a ramp.
          const o = groundToScreen(x + dx + 0.5, y + dy + 0.5);
          over.push([c.x, c.y, (c.x + o.x) / 2, (c.y + o.y) / 2]);
        }
    }
  // Bridge: dark rails either side of a plank deck, with planks across it.
  for (const [width, color] of [
    [24, 0x3e2c1a],
    [19, 0x9a7048],
  ] as const) {
    for (const [ax, ay, bx, by] of bridges) g.moveTo(ax, ay).lineTo(bx, by);
    if (bridges.length) g.stroke({ width, color, cap: 'butt', join: 'round' });
  }
  for (const [ax, ay, bx, by] of bridges) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) continue;
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    for (let d = 2; d < len; d += 4) {
      const [px, py] = [ax + ux * d, ay + uy * d];
      g.moveTo(px - uy * 9, py + ux * 9).lineTo(px + uy * 9, py - ux * 9);
    }
  }
  if (bridges.length) g.stroke({ width: 0.7, color: 0x5a3e24 });
  if (!segs.length) return;
  // Layered strokes: dark verge, packed dirt, then a lighter worn centre.
  for (const [width, color, alpha] of [
    [26, 0x5b4a2e, 0.35],
    [21, 0x9b7c50, 1],
    [9, 0xb99a68, 0.7],
  ]) {
    for (const [ax, ay, bx, by] of segs) g.moveTo(ax, ay).lineTo(bx, by);
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }
  // Wheel ruts either side of the crown, and loose stones scattered along the verges.
  const ruts: number[][] = [];
  for (const [ax, ay, bx, by] of segs) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) continue;
    const [nx, ny] = [-(by - ay) / len, (bx - ax) / len];
    for (const side of [-4.5, 4.5])
      ruts.push([ax + nx * side, ay + ny * side * 0.6, bx + nx * side, by + ny * side * 0.6]);
    const r = mulberry32(Math.round(ax * 7 + ay * 13));
    for (let k = 0; k < 4; k++) {
      const t = r();
      const side = (r() < 0.5 ? -1 : 1) * (8 + r() * 3);
      const x = ax + (bx - ax) * t + nx * side;
      const y = ay + (by - ay) * t + ny * side * 0.6;
      // Earthy greys a little lighter than the road: no cold specks that glow blue by night.
      const [rx, ry] = [1 + r() * 0.8, 0.7 + r() * 0.5];
      g.ellipse(x + 0.3, y + 0.4, rx, ry).fill({ color: 0x4a3a26, alpha: 0.35 });
      g.ellipse(x, y, rx, ry).fill({ color: r() < 0.5 ? 0x8c7c62 : 0xa08e70, alpha: 0.85 });
    }
  }
  for (const [ax, ay, bx, by] of ruts) g.moveTo(ax, ay).lineTo(bx, by);
  if (ruts.length) g.stroke({ width: 1.6, color: 0x6e5636, alpha: 0.45, cap: 'round' });
  // Tufts of grass creeping onto the verges, and now and then a puddle in a rut.
  for (const [ax, ay, bx, by] of segs) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) continue;
    const [nx, ny] = [-(by - ay) / len, (bx - ax) / len];
    const r = mulberry32(Math.round(ax * 3 + ay * 17 + 5));
    for (let k = 0; k < 3; k++) {
      const t = r();
      const side = (r() < 0.5 ? -1 : 1) * (10 + r() * 2);
      const x = ax + (bx - ax) * t + nx * side;
      const y = ay + (by - ay) * t + ny * side * 0.6;
      for (let b = 0; b < 4; b++) g.moveTo(x + (b - 1.5) * 0.7, y).lineTo(x + (b - 1.5) * 1.2, y - 2 - r() * 1.5);
      g.stroke({ width: 0.5, color: 0x5a7a34, alpha: 0.9 });
    }
    if (r() < 0.12 + 0.45 * wet) {
      const t = 0.3 + r() * 0.4;
      g.ellipse(ax + (bx - ax) * t + nx * 4.5, ay + (by - ay) * t + ny * 2.7, 3.2, 1.4).fill({
        color: 0x6a8aa0,
        alpha: 0.55,
      });
    }
  }
}

/** Road tiles in [x0, x1) × [y0, y1) with a lamp post on the verge: every few, never on a bridge or by a building. */
export function lampPosts(w: World, x0: number, y0: number, x1: number, y1: number) {
  const posts: [number, number][] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * w.map.width + x;
      if (w.buildings.get(w.occupied[i])?.type !== 'road' || (x * 73 + y * 151) % 5 !== 0 || w.map.tiles[i] === 'river')
        continue;
      // Not right beside a building: its barrels and crates stand on the verge there.
      let clear = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const b = w.buildings.get(w.occupied[(y + dy) * w.map.width + x + dx]);
          if (b && b.type !== 'road') clear = false;
        }
      if (clear) posts.push([x, y]);
    }
  return posts;
}

/** Lamp post on the verge of road tile (x, y), its lantern lit after dark. */
export function drawLampPost(g: Graphics, x: number, y: number) {
  const f = groundToScreen(x + 0.85, y + 0.15);
  g.moveTo(f.x, f.y)
    .lineTo(f.x, f.y - 15)
    .stroke({ width: 1.3, color: 0x2a2420 });
  g.moveTo(f.x, f.y - 15)
    .lineTo(f.x + 2.5, f.y - 15)
    .stroke({ width: 0.9, color: 0x2a2420 });
  lantern(g, f.x + 2.5, f.y - 13.5, f.y);
}

/** Light grid over the land the player may build on. */
export function drawTerritory(g: Graphics, w: World) {
  g.clear();
  w.owned.forEach((o, i) => {
    if (o) g.poly(diamond(i % w.map.width, Math.floor(i / w.map.width)));
  });
  g.fill({ color: 0xffffff, alpha: 0.12 }).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
}

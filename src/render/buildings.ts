import { Graphics } from 'pixi.js';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { World } from '../sim/world';
import { diamond, tileToScreen } from './iso';

const shade = (color: number, k: number) =>
  (Math.min(255, Math.round(((color >> 16) & 255) * k)) << 16) |
  (Math.min(255, Math.round(((color >> 8) & 255) * k)) << 8) |
  Math.min(255, Math.round((color & 255) * k));

/** Screen point of tile coords (x, y) at height h above raised land. */
const P = (x: number, y: number, h: number) => {
  const s = tileToScreen(x, y);
  return [s.x, s.y - h];
};

const fill = (g: Graphics, pts: number[][], color: number) => g.poly(pts.flat()).fill(color);
const edge = (g: Graphics, pts: number[][], color: number, width = 0.8) =>
  g.poly(pts.flat()).stroke({ width, color, alpha: 0.6 });

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
  fill(g, left, shade(color, 0.92));
  fill(g, right, shade(color, 0.72));
  if (top) fill(g, [P(x0, y0, h1), P(x1, y0, h1), P(x1, y1, h1), P(x0, y1, h1)], color);
  edge(g, left, shade(color, 0.5));
  edge(g, right, shade(color, 0.45));
  if (h0 === 0 && h1 > 8) {
    // Stone plinth with a darker contact line where the wall meets the ground.
    onLeft(g, b, 0, 1, 0, 2.2, 0x8c867a);
    onRight(g, b, 0, 1, 0, 2.2, 0x6e695f);
    onLeft(g, b, 0, 1, 0, 0.7, 0x4a463f);
    onRight(g, b, 0, 1, 0, 0.7, 0x3c3934);
  }
}

/** A rectangle drawn on the left face (y = y1) between fractions t0..t1 along x. */
const onLeft = (g: Graphics, b: Box, t0: number, t1: number, h0: number, h1: number, color: number) => {
  const x = (t: number) => b.x0 + t * (b.x1 - b.x0);
  fill(g, [P(x(t0), b.y1, h0), P(x(t1), b.y1, h0), P(x(t1), b.y1, h1), P(x(t0), b.y1, h1)], color);
};
/** A rectangle drawn on the right face (x = x1) between fractions t0..t1 along y. */
const onRight = (g: Graphics, b: Box, t0: number, t1: number, h0: number, h1: number, color: number) => {
  const y = (t: number) => b.y0 + t * (b.y1 - b.y0);
  fill(g, [P(b.x1, y(t1), h0), P(b.x1, y(t0), h0), P(b.x1, y(t0), h1), P(b.x1, y(t1), h1)], color);
};

/** Building with walls of height `wall` and a gable roof whose ridge runs along x. */
function gabled(g: Graphics, b: Box, wall: number, roof: number, wallColor: number, roofColor: number) {
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
  fill(g, north, shade(roofColor, 0.75));
  fill(g, south, roofColor);
  // Roof tiles: rows parallel to the eave, with staggered joints between rows.
  const rows = 6;
  const at = (k: number, u: number) =>
    P(x0 - o + u * (x1 - x0 + 2 * o), y1 + o - k * (y1 + o - yc), wall - 1 + k * (top - wall + 1));
  for (let r = 1; r < rows; r++) {
    const a = at(r / rows, 0);
    const c = at(r / rows, 1);
    g.moveTo(a[0], a[1]).lineTo(c[0], c[1]);
  }
  g.stroke({ width: 0.8, color: shade(roofColor, 0.55), alpha: 0.8 });
  const cols = Math.round((x1 - x0) * 7);
  for (let r = 0; r < rows; r++)
    for (let c = 1; c < cols; c++) {
      const u = (c + (r % 2) * 0.5) / cols;
      const a = at(r / rows, u);
      const e = at((r + 1) / rows, u);
      g.moveTo(a[0], a[1]).lineTo(e[0], e[1]);
    }
  g.stroke({ width: 0.5, color: shade(roofColor, 0.6), alpha: 0.55 });
  // Light catching the lower edge of each row.
  for (let r = 0; r < rows; r++) {
    const a = at(r / rows + 0.02, 0);
    const c = at(r / rows + 0.02, 1);
    g.moveTo(a[0], a[1]).lineTo(c[0], c[1]);
  }
  g.stroke({ width: 0.6, color: shade(roofColor, 1.35), alpha: 0.5 });
  const r0 = P(x0 - o, yc, top);
  const r1 = P(x1 + o, yc, top);
  g.moveTo(r0[0], r0[1])
    .lineTo(r1[0], r1[1])
    .stroke({ width: 2, color: shade(roofColor, 0.55) });
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
  onLeft(g, b, t + 0.01, t + w - 0.01, h0, h1, 0x2c3a4a);
  onLeft(g, b, t + 0.015, t + w * 0.45, h1 - (h1 - h0) * 0.45, h1 - 0.4, 0x6f8fae);
}
function windowRight(g: Graphics, b: Box, t: number, w: number, h0: number, h1: number) {
  onRight(g, b, t - 0.01, t + w + 0.01, h0 - 0.8, h1 + 0.8, 0xc8c2b2);
  onRight(g, b, t + 0.01, t + w - 0.01, h0, h1, 0x222e3a);
}
function door(g: Graphics, b: Box, t: number, w: number, h: number, color: number) {
  onLeft(g, b, t - 0.015, t + w + 0.015, 0, h + 1, 0x6e6658);
  onLeft(g, b, t, t + w, 0, h, color);
  onLeft(g, b, t + w * 0.5 - 0.004, t + w * 0.5 + 0.004, 0, h, shade(color, 0.6));
}

const SHUTTERS = [0x3f6b4a, 0x4a5f8a, 0x8a3a2a, 0x6a5a2a];

const ROOFS = [0xb5452b, 0xa0522d, 0x9b3b2b, 0x8e5a3a];

function shadow(g: Graphics, x: number, y: number, size: number) {
  const [tx, ty, rx, ry, bx, by, lx, ly] = [
    ...P(x, y, 0),
    ...P(x + size, y, 0),
    ...P(x + size, y + size, 0),
    ...P(x, y + size, 0),
  ];
  g.poly([tx + 7, ty + 3, rx + 7, ry + 3, bx + 7, by + 3, lx + 7, ly + 3]).fill({ color: 0x000000, alpha: 0.18 });
}

/** Draws building `type` with its top corner at tile (x, y). `variant` picks colours. */
export function drawBuilding(g: Graphics, type: BuildingId, x: number, y: number, variant = 0) {
  const size = BUILDINGS[type].size;
  shadow(g, x, y, size);
  const box = (a: number, b: number, c: number, d: number): Box => ({ x0: x + a, y0: y + b, x1: x + c, y1: y + d });
  switch (type) {
    case 'house': {
      const b = box(0.2, 0.25, 1.8, 1.75);
      gabled(g, b, 13, 11, 0xece0c4, ROOFS[variant % ROOFS.length]);
      timber(g, b, 13);
      door(g, b, 0.43, 0.14, 8, 0x6b4426);
      const sh = SHUTTERS[variant % SHUTTERS.length];
      for (const t of [0.14, 0.72]) {
        windowLeft(g, b, t, 0.12, 5, 9.5, sh);
        // Flower box under the window.
        onLeft(g, b, t - 0.02, t + 0.14, 3.6, 5, 0x6b4426);
        onLeft(g, b, t, t + 0.12, 4.6, 5.6, [0xd04a5a, 0xe8c040, 0xe07aa8][variant % 3]);
      }
      windowRight(g, b, 0.38, 0.24, 6, 10);
      const ch = box(0.45, 0.45, 0.62, 0.62);
      walls(g, ch, 16, 27, 0x8a5a44);
      walls(g, box(0.42, 0.42, 0.65, 0.65), 27, 28.5, 0x5e3e30);
      break;
    }
    case 'harbor': {
      const b = box(0.15, 0.2, 1.75, 1.6);
      gabled(g, b, 15, 12, 0xa87b4f, 0x6b3f22);
      for (const t of [0.25, 0.5, 0.75]) onLeft(g, b, 0, 1, t * 15 - 0.4, t * 15 + 0.4, 0x7d5733);
      door(g, b, 0.35, 0.3, 11, 0x4a2f1a);
      walls(g, box(1.45, 1.6, 1.8, 1.95), 0, 6, 0xb08850);
      walls(g, box(1.1, 1.65, 1.4, 1.95), 0, 5, 0x9c7444);
      const pole = P(x + 1.85, y + 0.35, 0);
      const tip = P(x + 1.85, y + 0.35, 40);
      g.moveTo(pole[0], pole[1]).lineTo(tip[0], tip[1]).stroke({ width: 1.4, color: 0x4a3420 });
      g.poly([tip[0], tip[1], tip[0] + 14, tip[1] + 4, tip[0], tip[1] + 8]).fill(0xc0392b);
      break;
    }
    case 'warehouse': {
      const b = box(0.1, 0.2, 1.9, 1.7);
      gabled(g, b, 14, 13, 0xc9a46c, 0x7a4a2a);
      timber(g, b, 14);
      door(g, b, 0.36, 0.28, 11, 0x5a3a20);
      onLeft(g, b, 0.36, 0.64, 10.6, 11.2, 0x3a2412);
      windowRight(g, b, 0.3, 0.4, 8, 11.5);
      walls(g, box(1.55, 1.75, 1.9, 1.98), 0, 5, 0xa07a46);
      break;
    }
    case 'lumberjack': {
      const b = box(0.15, 0.15, 1.15, 1.1);
      gabled(g, b, 10, 9, 0x9c7448, 0x5e4a2e);
      onLeft(g, b, 0.38, 0.62, 0, 7, 0x4a2f1a);
      const logs = box(1.25, 1.15, 1.9, 1.85);
      walls(g, logs, 0, 6, 0x8b5a2b);
      for (const [t, h] of [
        [0.2, 1.5],
        [0.5, 1.5],
        [0.8, 1.5],
        [0.35, 4.4],
        [0.65, 4.4],
      ]) {
        const c = P(logs.x1, logs.y0 + t * (logs.y1 - logs.y0), h);
        g.ellipse(c[0], c[1], 2.6, 1.6).fill(0xdcb980).stroke({ width: 0.6, color: 0x7a4f25 });
      }
      break;
    }
    case 'fisher': {
      const b = box(0.15, 0.2, 1.15, 1.2);
      gabled(g, b, 10, 9, 0xb8b3a2, 0x4a6a7a);
      onLeft(g, b, 0.38, 0.62, 0, 7, 0x4a3a2a);
      const p1 = P(x + 1.5, y + 0.45, 0);
      const p2 = P(x + 1.5, y + 1.7, 0);
      const t1 = P(x + 1.5, y + 0.45, 14);
      const t2 = P(x + 1.5, y + 1.7, 14);
      g.poly([...t1, ...t2, p2[0], p2[1] - 4, p1[0], p1[1] - 4]).fill({ color: 0x9a8f6a, alpha: 0.45 });
      for (let k = 1; k < 6; k++) {
        const a = [t1[0] + ((t2[0] - t1[0]) * k) / 6, t1[1] + ((t2[1] - t1[1]) * k) / 6];
        g.moveTo(a[0], a[1]).lineTo(a[0], a[1] + 10);
      }
      g.stroke({ width: 0.5, color: 0x5a5030, alpha: 0.7 });
      g.moveTo(p1[0], p1[1]).lineTo(t1[0], t1[1]).moveTo(p2[0], p2[1]).lineTo(t2[0], t2[1]);
      g.stroke({ width: 1.4, color: 0x4a3420 });
      break;
    }
    case 'chapel': {
      const nave = box(0.2, 0.4, 1.6, 1.55);
      gabled(g, nave, 14, 10, 0xe2dccd, 0x4f5866);
      for (const t of [0.15, 0.45]) onLeft(g, nave, t, t + 0.1, 5, 11, 0x6a7fa0);
      const t = box(1.25, 1.2, 1.85, 1.8);
      walls(g, t, 0, 32, 0xd6cfbf);
      onLeft(g, t, 0.3, 0.7, 0, 9, 0x5a3a20);
      onLeft(g, t, 0.35, 0.65, 20, 27, 0x2b2b35);
      onRight(g, t, 0.35, 0.65, 20, 27, 0x2b2b35);
      const apex = P(x + 1.55, y + 1.5, 52);
      const c = [P(t.x0, t.y1, 32), P(t.x1, t.y1, 32), P(t.x1, t.y0, 32)];
      fill(g, [c[0], c[1], apex], 0x5a6474);
      fill(g, [c[1], c[2], apex], 0x434b58);
      g.moveTo(apex[0], apex[1])
        .lineTo(apex[0], apex[1] - 8)
        .moveTo(apex[0] - 3, apex[1] - 5.5)
        .lineTo(apex[0] + 3, apex[1] - 5.5);
      g.stroke({ width: 1.2, color: 0xd4af37 });
      break;
    }
    case 'road':
      break;
  }
}

/** World point where smoke leaves a building's chimney, if it has one. */
export function chimneyAt(type: BuildingId, x: number, y: number) {
  if (type !== 'house') return null;
  const [px, py] = P(x + 0.535, y + 0.535, 29);
  return { x: px, y: py };
}

/** Dirt roads on tiles [x0, x1) × [y0, y1): a rounded track joined to every road neighbour. */
export function drawRoads(g: Graphics, w: World, x0 = 0, y0 = 0, x1 = w.map.width, y1 = w.map.height) {
  const isRoad = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < w.map.width &&
    y < w.map.height &&
    w.buildings.get(w.occupied[y * w.map.width + x])?.type === 'road';
  const segs: number[][] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!isRoad(x, y)) continue;
      const c = tileToScreen(x + 0.5, y + 0.5);
      segs.push([c.x, c.y, c.x, c.y]);
      // All four directions: a neighbour in another chunk draws its own half.
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ])
        if (isRoad(x + dx, y + dy)) {
          const n = tileToScreen(x + dx / 2 + 0.5, y + dy / 2 + 0.5);
          segs.push([c.x, c.y, n.x, n.y]);
        }
    }
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
}

/** Light grid over the land the player may build on. */
export function drawTerritory(g: Graphics, w: World) {
  g.clear();
  w.owned.forEach((o, i) => {
    if (o) g.poly(diamond(i % w.map.width, Math.floor(i / w.map.width)));
  });
  g.fill({ color: 0xffffff, alpha: 0.12 }).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
}

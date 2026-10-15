import { Graphics } from 'pixi.js';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import type { World } from '../sim/world';
import { tileToScreen } from './iso';
import { diamond } from './terrain';

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
  fill(g, [P(x1, y0, wall), P(x1, y1, wall), P(x1, yc, top)], shade(wallColor, 0.72));
  const north = [P(x0 - o, y0 - o, wall - 1), P(x1 + o, y0 - o, wall - 1), P(x1 + o, yc, top), P(x0 - o, yc, top)];
  const south = [P(x0 - o, y1 + o, wall - 1), P(x1 + o, y1 + o, wall - 1), P(x1 + o, yc, top), P(x0 - o, yc, top)];
  fill(g, north, shade(roofColor, 0.75));
  fill(g, south, roofColor);
  // Roof tiles: a few lines parallel to the eave.
  for (const k of [0.33, 0.66]) {
    const a = P(x0 - o, y1 + o - k * (y1 + o - yc), wall - 1 + k * (top - wall + 1));
    const c = P(x1 + o, y1 + o - k * (y1 + o - yc), wall - 1 + k * (top - wall + 1));
    g.moveTo(a[0], a[1]).lineTo(c[0], c[1]);
  }
  g.stroke({ width: 0.7, color: shade(roofColor, 0.6), alpha: 0.7 });
  edge(g, south, shade(roofColor, 0.45), 1);
}

const timber = (g: Graphics, b: Box, wall: number) => {
  const beam = 0x5b3b24;
  for (const t of [0, 0.5, 1]) onLeft(g, b, t - 0.02, t + 0.02, 0, wall, beam);
  onLeft(g, b, 0, 1, wall * 0.48, wall * 0.55, beam);
  for (const t of [0, 1]) onRight(g, b, t - 0.03, t + 0.03, 0, wall, beam);
};

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
      onLeft(g, b, 0.42, 0.58, 0, 8, 0x6b4426);
      for (const t of [0.12, 0.72]) onLeft(g, b, t, t + 0.14, 5, 9, 0x3b4a5a);
      onRight(g, b, 0.35, 0.65, 6, 10, 0x3b4a5a);
      walls(g, box(0.45, 0.45, 0.62, 0.62), 16, 27, 0x8a5a44);
      break;
    }
    case 'harbor': {
      const b = box(0.15, 0.2, 1.75, 1.6);
      gabled(g, b, 15, 12, 0xa87b4f, 0x6b3f22);
      for (const t of [0.25, 0.5, 0.75]) onLeft(g, b, 0, 1, t * 15 - 0.4, t * 15 + 0.4, 0x7d5733);
      onLeft(g, b, 0.35, 0.65, 0, 11, 0x4a2f1a);
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
      onLeft(g, b, 0.36, 0.64, 0, 11, 0x5a3a20);
      onRight(g, b, 0.3, 0.7, 8, 11, 0x3b4a5a);
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

/** Keeps one Graphics per building in the terrain's depth-sorted object layer. */
export function createBuildingsView(objectsAt: (x: number, y: number) => { addChild(g: Graphics): void }) {
  const shown = new Map<number, Graphics>();
  return (w: World) => {
    for (const [id, g] of shown)
      if (!w.buildings.has(id)) {
        g.destroy();
        shown.delete(id);
      }
    for (const b of w.buildings.values()) {
      if (b.type === 'road' || shown.has(b.id)) continue;
      const g = new Graphics();
      drawBuilding(g, b.type, b.x, b.y, b.id);
      g.zIndex = b.x + b.y + BUILDINGS[b.type].size;
      objectsAt(b.x, b.y).addChild(g);
      shown.set(b.id, g);
    }
  };
}

/** Dirt roads: a rounded track through each road tile's centre, joined to road neighbours. */
export function drawRoads(g: Graphics, w: World) {
  g.clear();
  const isRoad = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < w.map.width &&
    y < w.map.height &&
    w.buildings.get(w.occupied[y * w.map.width + x])?.type === 'road';
  const segs: number[][] = [];
  for (const b of w.buildings.values()) {
    if (b.type !== 'road') continue;
    const c = tileToScreen(b.x + 0.5, b.y + 0.5);
    segs.push([c.x, c.y, c.x, c.y]);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ])
      if (isRoad(b.x + dx, b.y + dy)) {
        const n = tileToScreen(b.x + dx + 0.5, b.y + dy + 0.5);
        segs.push([c.x, c.y, n.x, n.y]);
      }
  }
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

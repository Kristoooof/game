import type { Graphics } from 'pixi.js';
import { BUILDINGS } from '../data/buildings';
import type { World } from '../sim/world';
import { diamond } from './terrain';
import { tileToScreen } from './iso';

const shade = (color: number, k: number) =>
  (Math.round(((color >> 16) & 255) * k) << 16) |
  (Math.round(((color >> 8) & 255) * k) << 8) |
  Math.round((color & 255) * k);

/** Iso box on a size×size footprint with its top corner at tile (x, y). */
export function drawBox(g: Graphics, x: number, y: number, size: number, height: number, color: number, alpha = 1) {
  const i = 0.12;
  const top = tileToScreen(x + i, y + i);
  const right = tileToScreen(x + size - i, y + i);
  const bottom = tileToScreen(x + size - i, y + size - i);
  const left = tileToScreen(x + i, y + size - i);
  const h = height;
  g.poly([left.x, left.y, bottom.x, bottom.y, bottom.x, bottom.y - h, left.x, left.y - h]).fill({
    color: shade(color, 0.8),
    alpha,
  });
  g.poly([bottom.x, bottom.y, right.x, right.y, right.x, right.y - h, bottom.x, bottom.y - h]).fill({
    color: shade(color, 0.6),
    alpha,
  });
  g.poly([top.x, top.y - h, right.x, right.y - h, bottom.x, bottom.y - h, left.x, left.y - h])
    .fill({ color, alpha })
    .stroke({ width: 1, color: shade(color, 0.5), alpha });
}

/** Roads flat on the ground, then buildings back to front. */
export function drawBuildings(g: Graphics, w: World) {
  g.clear();
  const list = [...w.buildings.values()].sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const b of list) if (b.type === 'road') g.poly(diamond(b.x, b.y)).fill(BUILDINGS.road.color);
  for (const b of list) {
    const def = BUILDINGS[b.type];
    if (b.type !== 'road') drawBox(g, b.x, b.y, def.size, def.height, def.color);
  }
}

/** Faint highlight of the land the player may build on. */
export function drawTerritory(g: Graphics, w: World) {
  g.clear();
  w.owned.forEach((o, i) => {
    if (o) g.poly(diamond(i % w.map.width, Math.floor(i / w.map.width))).fill({ color: 0xffffff, alpha: 0.2 });
  });
}

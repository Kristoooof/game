import { Graphics } from 'pixi.js';
import type { GameMap, Terrain } from '../sim/map';
import { TILE_H, TILE_W, tileToScreen } from './iso';

const COLORS: Record<Terrain, number> = {
  water: 0x1a6690,
  beach: 0xe3cf8f,
  grass: 0x6aa84f,
  forest: 0x4f8f43,
  mountain: 0x8a8070,
};

export const diamond = (x: number, y: number) => {
  const s = tileToScreen(x, y);
  return [s.x, s.y, s.x + TILE_W / 2, s.y + TILE_H / 2, s.x, s.y + TILE_H, s.x - TILE_W / 2, s.y + TILE_H / 2];
};

/** Whole map as one Graphics: ground diamonds, then trees and peaks back to front. */
export function drawTerrain(map: GameMap) {
  const g = new Graphics();
  map.tiles.forEach((t, i) => {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const color = t === 'water' && (x + y) % 2 ? 0x1c6e99 : COLORS[t];
    g.poly(diamond(x, y)).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.08 });
  });

  // Raised features overlap the tile behind them, so draw in x + y order.
  for (let d = 0; d < map.width + map.height - 1; d++) {
    for (let x = Math.max(0, d - map.height + 1); x <= Math.min(d, map.width - 1); x++) {
      const y = d - x;
      const t = map.tiles[y * map.width + x];
      const { x: cx, y: top } = tileToScreen(x, y);
      const cy = top + TILE_H / 2;
      if (t === 'forest') {
        for (const [ox, oy] of [
          [-10, 2],
          [9, -2],
          [0, 7],
        ])
          g.poly([cx + ox - 7, cy + oy + 4, cx + ox + 7, cy + oy + 4, cx + ox, cy + oy - 16]).fill(0x2d5e2a);
      } else if (t === 'mountain') {
        g.poly([cx - 26, cy + 8, cx + 26, cy + 8, cx, cy - 28]).fill(0x9c9283);
        g.poly([cx, cy - 28, cx + 26, cy + 8, cx + 6, cy + 8]).fill(0x7a7164);
        g.poly([cx - 7, cy - 19, cx + 7, cy - 19, cx, cy - 28]).fill(0xf2f2f2);
      }
    }
  }
  return g;
}

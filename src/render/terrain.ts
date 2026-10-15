import { Container, Graphics } from 'pixi.js';
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

const CHUNK = 16;

/** Ground diamonds for one chunk, and its trees and peaks drawn back to front. */
function drawChunk(map: GameMap, cx: number, cy: number) {
  const ground = new Graphics();
  const features = new Graphics();
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(map.width, x0 + CHUNK);
  const y1 = Math.min(map.height, y0 + CHUNK);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const t = map.tiles[y * map.width + x];
      const color = t === 'water' && (x + y) % 2 ? 0x1c6e99 : COLORS[t];
      ground.poly(diamond(x, y)).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.08 });
    }
  }
  // Raised features overlap the tile behind them, so draw in x + y order.
  for (let d = x0 + y0; d <= x1 + y1 - 2; d++) {
    for (let x = Math.max(x0, d - y1 + 1); x <= Math.min(d - y0, x1 - 1); x++) {
      const y = d - x;
      const t = map.tiles[y * map.width + x];
      const { x: px, y: top } = tileToScreen(x, y);
      const py = top + TILE_H / 2;
      if (t === 'forest') {
        for (const [ox, oy] of [
          [-10, 2],
          [9, -2],
          [0, 7],
        ])
          features.poly([px + ox - 7, py + oy + 4, px + ox + 7, py + oy + 4, px + ox, py + oy - 16]).fill(0x2d5e2a);
      } else if (t === 'mountain') {
        features.poly([px - 26, py + 8, px + 26, py + 8, px, py - 28]).fill(0x9c9283);
        features.poly([px, py - 28, px + 26, py + 8, px + 6, py + 8]).fill(0x7a7164);
        features.poly([px - 7, py - 19, px + 7, py - 19, px, py - 28]).fill(0xf2f2f2);
      }
    }
  }
  ground.cullable = features.cullable = true;
  return { ground, features };
}

/**
 * Terrain split into CHUNK×CHUNK pieces so off-screen chunks are culled and a terrain
 * change only redraws its own chunk. Features sit in a layer above all ground.
 */
export function createTerrain(map: GameMap) {
  const ground = new Container();
  const features = new Container();
  const cols = Math.ceil(map.width / CHUNK);
  const rows = Math.ceil(map.height / CHUNK);
  const chunks: ReturnType<typeof drawChunk>[] = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) chunks.push(drawChunk(map, cx, cy));
  // Back-to-front chunk order keeps features overlapping correctly across chunk edges.
  const order = chunks
    .map((_, i) => i)
    .sort((a, b) => (a % cols) + Math.floor(a / cols) - (b % cols) - Math.floor(b / cols));
  for (const i of order) {
    ground.addChild(chunks[i].ground);
    features.addChild(chunks[i].features);
  }

  /** Redraw the chunks covering tiles (x0, y0)..(x1, y1) inclusive. */
  const redraw = (x0: number, y0: number, x1: number, y1: number) => {
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
      for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        const i = cy * cols + cx;
        const old = chunks[i];
        if (!old) continue;
        chunks[i] = drawChunk(map, cx, cy);
        ground.addChildAt(chunks[i].ground, ground.getChildIndex(old.ground));
        features.addChildAt(chunks[i].features, features.getChildIndex(old.features));
        old.ground.destroy();
        old.features.destroy();
      }
    }
  };
  return { ground, features, redraw };
}

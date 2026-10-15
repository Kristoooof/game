export const TILE_W = 64;
export const TILE_H = 32;

/** Tile (x, y) to screen position of the tile's top corner. */
export function tileToScreen(x: number, y: number) {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

/** Screen position to the tile under it (inverse of tileToScreen). */
export function screenToTile(sx: number, sy: number) {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

export const TILE_W = 64;
export const TILE_H = 32;
/** Height in pixels of one terrace level. */
export const LEVEL_H = 20;
export const MAX_LEVEL = 2;

/** Tile (x, y) to screen position of the tile's top corner, at sea level. */
export function tileToScreen(x: number, y: number) {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

/** Screen position to the tile under it (inverse of tileToScreen), at sea level. */
export function screenToTile(sx: number, sy: number) {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

/** Terrace level of each tile, set once the map is known (0 everywhere until then). */
let levelOf: (x: number, y: number) => number = () => 0;
export const setLevels = (f: (x: number, y: number) => number) => (levelOf = f);
/** Pixels the ground at tile coords (x, y) is raised by. */
export const liftAt = (x: number, y: number) => levelOf(Math.floor(x), Math.floor(y)) * LEVEL_H;

/** Screen point on the ground (raised to its terrace) at tile coords (x, y). */
export function groundToScreen(x: number, y: number) {
  const s = tileToScreen(x, y);
  return { x: s.x, y: s.y - liftAt(x, y) };
}

/** The tile whose (raised) ground is seen at a screen point: higher terraces hide what is behind them. */
export function screenToGround(sx: number, sy: number) {
  for (let l = MAX_LEVEL; l > 0; l--) {
    const t = screenToTile(sx, sy + l * LEVEL_H);
    if (levelOf(t.x, t.y) === l) return t;
  }
  return screenToTile(sx, sy);
}

/** Corners (top, right, bottom, left) of tile (x, y) on its terrace, as a flat polygon. */
export const diamond = (x: number, y: number) => {
  const s = groundToScreen(x, y);
  return [s.x, s.y, s.x + TILE_W / 2, s.y + TILE_H / 2, s.x, s.y + TILE_H, s.x - TILE_W / 2, s.y + TILE_H / 2];
};

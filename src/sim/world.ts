import { BUILDINGS, GOOD_NAMES, type BuildingId, type Good } from '../data/buildings';
import { type GameMap, labelIslands, terrainAt } from './map';

export interface Building {
  id: number;
  type: BuildingId;
  x: number;
  y: number;
}

export interface World {
  map: GameMap;
  islands: Int32Array;
  buildings: Map<number, Building>;
  /** Building id per tile, 0 = free. */
  occupied: Int32Array;
  /** 1 where the player may build. */
  owned: Uint8Array;
  gold: number;
  // shortcut: one global stock, split per island in milestone 3 (warehouse storage).
  stock: Record<Good, number>;
  nextId: number;
  /** Bumped when terrain changes (forest cleared), so the renderer knows to redraw. */
  terrainRev: number;
}

export function createWorld(map: GameMap): World {
  const n = map.tiles.length;
  return {
    map,
    islands: labelIslands(map),
    buildings: new Map(),
    occupied: new Int32Array(n),
    owned: new Uint8Array(n),
    gold: 5000,
    stock: { wood: 50, tools: 30, bricks: 20 },
    nextId: 1,
    terrainRev: 0,
  };
}

const footprint = (type: BuildingId, x: number, y: number) => {
  const s = BUILDINGS[type].size;
  const tiles: [number, number][] = [];
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) tiles.push([x + dx, y + dy]);
  return tiles;
};

/** Why `type` cannot be built with its top corner at (x, y), or null if it can. */
export function placementError(w: World, type: BuildingId, x: number, y: number): string | null {
  const def = BUILDINGS[type];
  const tiles = footprint(type, x, y);
  for (const [tx, ty] of tiles) {
    const t = terrainAt(w.map, tx, ty);
    if (!t || t === 'water' || t === 'mountain') return 'Ide nem lehet építeni';
    const i = ty * w.map.width + tx;
    if (w.occupied[i]) return 'A hely foglalt';
    if (!def.settles && !w.owned[i]) return 'Saját területen kívül';
  }
  const touchesWater = tiles.some(([tx, ty]) =>
    [
      [tx + 1, ty],
      [tx - 1, ty],
      [tx, ty + 1],
      [tx, ty - 1],
    ].some(([nx, ny]) => terrainAt(w.map, nx, ny) === 'water'),
  );
  if (def.coast && !touchesWater) return 'Partra kell építeni';
  if (w.gold < def.cost.gold) return 'Nincs elég arany';
  for (const g of Object.keys(GOOD_NAMES) as Good[])
    if (w.stock[g] < (def.cost[g] ?? 0)) return `Nincs elég: ${GOOD_NAMES[g].toLowerCase()}`;
  return null;
}

/** Builds if possible. Returns the error otherwise. Building on forest clears it. */
export function place(w: World, type: BuildingId, x: number, y: number): string | null {
  const err = placementError(w, type, x, y);
  if (err) return err;
  const def = BUILDINGS[type];
  const id = w.nextId++;
  w.buildings.set(id, { id, type, x, y });
  for (const [tx, ty] of footprint(type, x, y)) {
    const i = ty * w.map.width + tx;
    w.occupied[i] = id;
    if (w.map.tiles[i] === 'forest') {
      w.map.tiles[i] = 'grass';
      w.terrainRev++;
    }
  }
  w.gold -= def.cost.gold;
  for (const g of Object.keys(GOOD_NAMES) as Good[]) w.stock[g] -= def.cost[g] ?? 0;
  if (def.radius) updateTerritory(w);
  return null;
}

/** Removes the building on tile (x, y), if any. No refund. */
export function demolish(w: World, x: number, y: number): Building | undefined {
  const b = w.buildings.get(w.occupied[y * w.map.width + x]);
  if (!b) return;
  w.buildings.delete(b.id);
  for (const [tx, ty] of footprint(b.type, b.x, b.y)) w.occupied[ty * w.map.width + tx] = 0;
  if (BUILDINGS[b.type].radius) updateTerritory(w);
  return b;
}

export const buildingAt = (w: World, x: number, y: number) =>
  terrainAt(w.map, x, y) ? w.buildings.get(w.occupied[y * w.map.width + x]) : undefined;

/** Land within a harbor's or warehouse's radius, on that building's island. */
function updateTerritory(w: World) {
  const { width, height } = w.map;
  w.owned.fill(0);
  for (const b of w.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (!def.radius) continue;
    const island = w.islands[b.y * width + b.x];
    const cx = b.x + def.size / 2;
    const cy = b.y + def.size / 2;
    const r = def.radius;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(height, cy + r); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(width, cx + r); x++)
        if (w.islands[y * width + x] === island && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r)
          w.owned[y * width + x] = 1;
  }
}

/** Tiles of an L-shaped road from a to b: along x first, then along y. */
export function roadPath(ax: number, ay: number, bx: number, by: number) {
  const path: [number, number][] = [];
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  for (let x = ax; x !== bx; x += sx) path.push([x, ay]);
  for (let y = ay; y !== by; y += sy) path.push([bx, y]);
  path.push([bx, by]);
  return path;
}

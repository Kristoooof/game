import { BUILDINGS, GOOD_NAMES, type BuildingId, type Good } from '../data/buildings';
import type { Need } from '../data/population';
import { type GameMap, labelIslands, levelAt, terrainAt } from './map';

export interface Building {
  id: number;
  type: BuildingId;
  x: number;
  y: number;
  /** Production buildings: goods made and waiting for a cart, inputs delivered, progress of the
   * current piece (0..1), and how hard it has been working of late (0..1). */
  output?: number;
  input?: number;
  progress?: number;
  busy?: number;
  /** Houses: level of the people in it (index into LEVELS), how many, how content (0..1);
   * goods owed (used up but not yet taken from the store) and how well each need is met (0..1). */
  level?: number;
  residents?: number;
  happy?: number;
  owed?: Partial<Record<Good, number>>;
  met?: Partial<Record<Need, number>>;
}

export type Stock = Record<Good, number>;

/** A depot's cart: out along `route` (road tile indices) to a producer and back. */
export interface Cart {
  id: number;
  depot: number;
  producer: number;
  route: number[];
  /** Position along the route in tiles; `dir` 1 going out, -1 coming back. */
  pos: number;
  dir: number;
  /** Seconds left loading or unloading at either end. */
  wait: number;
  /** What it carries and how much: fetching a producer's goods, or taking it its input. */
  good: Good | null;
  amount: number;
}

/** A stop on a ship's trade route: what it unloads there, then what it loads. */
export interface Stop {
  harbor: number;
  unload: Good[];
  load: Good[];
}

/** A ship at sea, in tile coordinates. */
export interface Ship {
  id: number;
  name: string;
  x: number;
  y: number;
  /** Heading, radians in tile space. */
  a: number;
  /** Water tiles (indices) still to sail through, the next first. */
  path: number[];
  /** Harbour it is making for (0: a point at sea), and the one it lies at (0: none). */
  goal: number;
  docked: number;
  cargo: Stock;
  /** Trade route: its stops, the one it is on, whether it is running. */
  route: Stop[];
  leg: number;
  sailing: boolean;
  /** Seconds left loading, unloading or trading. */
  wait: number;
  /** The free trader: not the player's, it buys and sells at the harbours. */
  trader?: boolean;
}

/** A message for the player: good news, or a warning (something is short, people are unhappy). */
export interface News {
  text: string;
  warn?: boolean;
}

/** Tells the player `text`, unless the same warning (`key`) was given in the last `every` seconds. */
export function warn(w: World, key: string, text: string, every = 90) {
  if (w.time - (w.warned.get(key) ?? -Infinity) < every) return;
  w.warned.set(key, w.time);
  w.news.push({ text, warn: true });
}

/** What the free trader may do with a good at an island: buy it from us, or sell it to us. */
export type Deal = 'sell' | 'buy';

export interface World {
  map: GameMap;
  islands: Int32Array;
  buildings: Map<number, Building>;
  /** Building id per tile, 0 = free. */
  occupied: Int32Array;
  /** 1 where the player may build. */
  owned: Uint8Array;
  gold: number;
  /** Goods per island (label), kept in its harbour and warehouses. */
  stocks: Map<number, Stock>;
  carts: Cart[];
  ships: Ship[];
  /** Per island, the goods its harbour trades with the free trader. */
  trade: Map<number, Partial<Record<Good, Deal>>>;
  /** Per island, the crops that grow there (not every island suits sheep). */
  fertile: Map<number, Set<Good>>;
  /** Game time, seconds. */
  time: number;
  /** Buildings whose look changed (a house rising a level): the renderer redraws and clears them. */
  changed: number[];
  /** Goods made and carted into the stores so far, by kind. */
  made: Stock;
  /** The quest being worked on (index into QUESTS), and news for the player (the UI takes them). */
  quest: number;
  news: News[];
  /** Game time each warning was last given (by its key), so it is not repeated every tick. */
  warned: Map<string, number>;
  nextId: number;
}

export const emptyStock = (): Stock => Object.fromEntries(Object.keys(GOOD_NAMES).map((g) => [g, 0])) as Stock;

export const islandOf = (w: World, x: number, y: number) => w.islands[y * w.map.width + x];

/** A settling harbour must be paid for from a ship lying within this many tiles. */
export const SETTLE_RANGE = 8;
/** Goods a ship can carry, all kinds together. */
export const HOLD = 40;

export const cargoOf = (s: Ship) => Object.values(s.cargo).reduce((a, n) => a + n, 0);

/**
 * The stock that pays for `type` at (x, y): its island's. On an island not yet settled, the
 * cargo of a ship close by (one carrying enough, if any), or null if none lies near.
 */
export function payingStock(w: World, type: BuildingId, x: number, y: number): Stock | null {
  const own = w.stocks.get(islandOf(w, x, y));
  if (own) return own;
  const near = w.ships
    .filter((s) => !s.trader && Math.hypot(s.x - x, s.y - y) <= SETTLE_RANGE)
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  const cost = BUILDINGS[type].cost;
  const enough = (s: Ship) => (Object.keys(GOOD_NAMES) as Good[]).every((g) => s.cargo[g] >= (cost[g] ?? 0));
  return (near.find(enough) ?? near[0])?.cargo ?? null;
}

/** Islands by size, largest first: the largest is where the game starts. */
function islandsBySize(labels: Int32Array) {
  const size = new Map<number, number>();
  for (const l of labels) if (l) size.set(l, (size.get(l) ?? 0) + 1);
  return [...size.keys()].sort((a, b) => size.get(b)! - size.get(a)! || a - b);
}

export function createWorld(map: GameMap): World {
  const n = map.tiles.length;
  const islands = labelIslands(map);
  const bySize = islandsBySize(islands);
  // Sheep thrive on every other island, never the home island (unless it is the only one):
  // cloth means trade.
  const fertile = new Map(bySize.map((l, k) => [l, new Set<Good>(k % 2 || bySize.length === 1 ? ['wool'] : [])]));
  const w: World = {
    map,
    islands,
    buildings: new Map(),
    occupied: new Int32Array(n),
    owned: new Uint8Array(n),
    gold: 5000,
    stocks: new Map(),
    carts: [],
    ships: [],
    trade: new Map(),
    fertile,
    time: 0,
    changed: [],
    made: emptyStock(),
    quest: 0,
    news: [],
    warned: new Map(),
    nextId: 1,
  };
  // The player's first ship, with the goods to found a town, off the largest island; the free
  // trader out at the edge of the map.
  const home = bySize[0];
  let sx = 0;
  let sy = 0;
  let count = 0;
  islands.forEach((l, i) => {
    if (l !== home) return;
    sx += i % map.width;
    sy += Math.floor(i / map.width);
    count++;
  });
  const start = nearestWater(map, count ? sx / count : map.width / 2, count ? sy / count : map.height / 2);
  const ship = (name: string, i: number, trader = false): Ship => ({
    id: w.nextId++,
    name,
    x: (i % map.width) + 0.5,
    y: Math.floor(i / map.width) + 0.5,
    a: 0,
    path: [],
    goal: 0,
    docked: 0,
    cargo: emptyStock(),
    route: [],
    leg: 0,
    sailing: false,
    wait: 0,
    trader,
  });
  if (start >= 0)
    w.ships.push({ ...ship('Hajnalcsillag', start), cargo: { ...emptyStock(), wood: 50, tools: 30, bricks: 20 } });
  const edge = map.tiles.indexOf('water');
  if (edge >= 0) w.ships.push(ship('Szabadkereskedő', edge, true));
  return w;
}

/** The water tile nearest (x, y), preferring one clear of the shore by two tiles. */
function nearestWater(map: GameMap, x: number, y: number) {
  const W = map.width;
  const toLand = new Int32Array(map.tiles.length).fill(-1);
  const queue: number[] = [];
  map.tiles.forEach((t, i) => {
    if (t !== 'water') {
      toLand[i] = 0;
      queue.push(i);
    }
  });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of [i % W ? i - 1 : -1, (i + 1) % W ? i + 1 : -1, i - W, i + W])
      if (j >= 0 && j < toLand.length && toLand[j] < 0) {
        toLand[j] = toLand[i] + 1;
        queue.push(j);
      }
  }
  let best = -1;
  let bestD = Infinity;
  for (const min of [2, 1]) {
    toLand.forEach((d, i) => {
      if (d < min) return;
      const dd = Math.hypot((i % W) + 0.5 - x, Math.floor(i / W) + 0.5 - y);
      if (dd < bestD) [best, bestD] = [i, dd];
    });
    if (best >= 0) return best;
  }
  return best;
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
    // Roads may cross a river (as a bridge); nothing else stands in it.
    if (!t || t === 'water' || t === 'mountain' || (t === 'river' && type !== 'road')) return 'Ide nem lehet építeni';
    const i = ty * w.map.width + tx;
    if (w.occupied[i]) return 'A hely foglalt';
    if (!def.settles && !w.owned[i]) return 'Saját területen kívül';
  }
  // A building stands on one terrace, never across a cliff (roads may, as ramps).
  if (type !== 'road' && new Set(tiles.map(([tx, ty]) => levelAt(w.map, tx, ty))).size > 1)
    return 'Ide nem lehet építeni';
  const touchesWater = tiles.some(([tx, ty]) =>
    [
      [tx + 1, ty],
      [tx - 1, ty],
      [tx, ty + 1],
      [tx, ty - 1],
    ].some(([nx, ny]) => terrainAt(w.map, nx, ny) === 'water'),
  );
  if (def.coast && !touchesWater) return 'Partra kell építeni';
  const crop = def.production?.fertile && def.production.output;
  if (crop && !w.fertile.get(islandOf(w, x, y))?.has(crop))
    return `Ezen a szigeten nem terem: ${GOOD_NAMES[crop].toLowerCase()}`;
  if (w.gold < def.cost.gold) return 'Nincs elég arany';
  const stock = payingStock(w, type, x, y);
  if (!stock) return 'Hajó kell a közelben az építőanyaggal';
  for (const g of Object.keys(GOOD_NAMES) as Good[])
    if (stock[g] < (def.cost[g] ?? 0)) return `Nincs elég: ${GOOD_NAMES[g].toLowerCase()}`;
  return null;
}

/** Builds if possible. Returns the error otherwise. Building on forest clears it. */
export function place(w: World, type: BuildingId, x: number, y: number): string | null {
  const err = placementError(w, type, x, y);
  if (err) return err;
  const def = BUILDINGS[type];
  const stock = payingStock(w, type, x, y)!;
  const id = w.nextId++;
  const b: Building = { id, type, x, y };
  if (def.production) Object.assign(b, { output: 0, input: 0, progress: 0, busy: 0 });
  // A new house: a couple moves in, hopeful.
  if (type === 'house') Object.assign(b, { level: 0, residents: 2, happy: 1, owed: {}, met: {} });
  w.buildings.set(id, b);
  for (const [tx, ty] of footprint(type, x, y)) {
    const i = ty * w.map.width + tx;
    w.occupied[i] = id;
    if (w.map.tiles[i] === 'forest') w.map.tiles[i] = 'grass';
  }
  w.gold -= def.cost.gold;
  for (const g of Object.keys(GOOD_NAMES) as Good[]) stock[g] -= def.cost[g] ?? 0;
  // A new island's first depot opens its store. The very first harbour of all: the ship that
  // brought the settlers unloads everything into it.
  const island = islandOf(w, x, y);
  if (def.depot && !w.stocks.has(island)) {
    const first = !w.stocks.size;
    w.stocks.set(island, first ? { ...stock } : emptyStock());
    if (first) Object.assign(stock, emptyStock());
  }
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
export function updateTerritory(w: World) {
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

const isRoad = (w: World, i: number) => w.buildings.get(w.occupied[i])?.type === 'road';

/** Road tiles (as tile indices) touching building b's footprint: where goods leave or arrive. */
export function roadsBeside(w: World, b: Building) {
  const W = w.map.width;
  const out = new Set<number>();
  for (const [tx, ty] of footprint(b.type, b.x, b.y))
    for (const [nx, ny] of [
      [tx + 1, ty],
      [tx - 1, ty],
      [tx, ty + 1],
      [tx, ty - 1],
    ])
      if (terrainAt(w.map, nx, ny) && isRoad(w, ny * W + nx)) out.add(ny * W + nx);
  return [...out];
}

/** Shortest route along roads (tile indices, start to goal) from any of `from` to any of `to`, or null. */
export function roadRoute(w: World, from: number[], to: number[]) {
  const W = w.map.width;
  const goal = new Set(to);
  const prev = new Map<number, number>(from.map((i) => [i, -1]));
  const queue = [...from];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (goal.has(i)) {
      const route = [i];
      for (let p = prev.get(i)!; p >= 0; p = prev.get(p)!) route.push(p);
      return route.reverse();
    }
    const x = i % W;
    for (const j of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, i + W, i - W])
      if (j >= 0 && j < w.map.tiles.length && !prev.has(j) && isRoad(w, j)) {
        prev.set(j, i);
        queue.push(j);
      }
  }
  return null;
}

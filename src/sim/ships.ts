import { BUILDINGS, PRICES, type Good } from '../data/buildings';
import { terrainAt } from './map';
import { cargoOf, emptyStock, HOLD, islandOf, type Ship, type World } from './world';

/** Tiles a ship sails per game second. */
const SPEED = 1.8;
/** Seconds a ship lies at a stop loading and unloading, or the trader trading. */
const STAY = 4;
/** The trader buys our surplus down to KEEP, and sells to us up to FILL. */
export const KEEP = 10;
export const FILL = 15;
export const SHIP_COST = { gold: 800, wood: 10, tools: 4 };

const isSea = (w: World, i: number) => w.map.tiles[i] === 'water';

/**
 * Shortest course over open water (A*, eight ways, never cutting a corner of land) from tile
 * index `from` to `to`, as the tiles to sail through after `from`; null if there is none.
 */
export function seaPath(w: World, from: number, to: number): number[] | null {
  const { width: W, tiles } = w.map;
  if (!isSea(w, to)) return null;
  const g = new Float32Array(tiles.length).fill(Infinity);
  const prev = new Int32Array(tiles.length).fill(-1);
  const closed = new Uint8Array(tiles.length);
  const h = (i: number) => {
    const dx = Math.abs((i % W) - (to % W));
    const dy = Math.abs(Math.floor(i / W) - Math.floor(to / W));
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  // Binary heap of [f, index].
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    for (let k = heap.length - 1; k > 0;) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ;) {
        const [l, r] = [2 * k + 1, 2 * k + 2];
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top[1];
  };
  g[from] = 0;
  push(h(from), from);
  while (heap.length) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === to) {
      const path = [];
      for (let k = to; k !== from; k = prev[k]) path.push(k);
      return path.reverse();
    }
    const x = i % W;
    const y = Math.floor(i / W);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!terrainAt(w.map, x + dx, y + dy)) continue;
        const j = (y + dy) * W + x + dx;
        if (!isSea(w, j) || closed[j]) continue;
        // Diagonally only between two water tiles: no slipping past a headland's corner.
        if (dx && dy && (!isSea(w, y * W + x + dx) || !isSea(w, (y + dy) * W + x))) continue;
        const cost = g[i] + (dx && dy ? Math.SQRT2 : 1);
        if (cost < g[j]) {
          g[j] = cost;
          prev[j] = i;
          push(cost + h(j), j);
        }
      }
  }
  return null;
}

/** The water tile beside harbour `id` where ships tie up, or -1. */
export function dockOf(w: World, id: number) {
  const b = w.buildings.get(id);
  if (!b) return -1;
  const W = w.map.width;
  const s = BUILDINGS[b.type].size;
  let best = -1;
  let open = -1;
  for (let y = b.y - 1; y <= b.y + s; y++)
    for (let x = b.x - 1; x <= b.x + s; x++) {
      if (!terrainAt(w.map, x, y) || !isSea(w, y * W + x)) continue;
      // The tile with the most water round it: the open side, clear of the beach.
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (terrainAt(w.map, x + dx, y + dy) === 'water') n++;
      if (n > open) [best, open] = [y * W + x, n];
    }
  return best;
}

const tileOf = (w: World, s: Ship) => Math.floor(s.y) * w.map.width + Math.floor(s.x);

/** Sends ship s to tile index `to` (a harbour `goal` when it is that harbour's dock). False if it cannot get there. */
function sail(w: World, s: Ship, to: number, goal = 0) {
  const path = to === tileOf(w, s) ? [] : seaPath(w, tileOf(w, s), to);
  if (!path) return false;
  [s.path, s.goal, s.docked] = [path, goal, 0];
  if (!path.length) s.docked = goal;
  return true;
}

/** The player's order: sail to tile (x, y), dropping any trade route. */
export function moveShip(w: World, s: Ship, x: number, y: number) {
  s.sailing = false;
  return sail(w, s, y * w.map.width + x);
}

/** Sail to harbour `id` and tie up there. */
export const sailToHarbor = (w: World, s: Ship, id: number) => sail(w, s, dockOf(w, id), id);

/** Moves `amount` of good g between ship s and the island store of the harbour it lies at (+ loads). */
export function transfer(w: World, s: Ship, g: Good, amount: number) {
  const b = w.buildings.get(s.docked);
  const stock = b && w.stocks.get(islandOf(w, b.x, b.y));
  if (!stock) return;
  const n = amount > 0 ? Math.min(amount, stock[g], HOLD - cargoOf(s)) : -Math.min(-amount, s.cargo[g]);
  stock[g] -= n;
  s.cargo[g] += n;
}

/** Builds a ship at harbour `id`, paid from its island's store. Returns the error, or null. */
export function buildShip(w: World, id: number): string | null {
  const b = w.buildings.get(id);
  const stock = b && w.stocks.get(islandOf(w, b.x, b.y));
  const dock = dockOf(w, id);
  if (!b || !stock || dock < 0) return 'Itt nem lehet hajót építeni';
  if (w.gold < SHIP_COST.gold) return 'Nincs elég arany';
  if (stock.wood < SHIP_COST.wood) return 'Nincs elég: fa';
  if (stock.tools < SHIP_COST.tools) return 'Nincs elég: szerszám';
  w.gold -= SHIP_COST.gold;
  stock.wood -= SHIP_COST.wood;
  stock.tools -= SHIP_COST.tools;
  const W = w.map.width;
  const names = ['Szélrózsa', 'Tengeri Sas', 'Szerencse', 'Délibáb', 'Vándor', 'Hullámlovas'];
  w.ships.push({
    id: w.nextId++,
    name: names[w.ships.filter((s) => !s.trader).length % names.length],
    x: (dock % W) + 0.5,
    y: Math.floor(dock / W) + 0.5,
    a: 0,
    path: [],
    goal: id,
    docked: id,
    cargo: emptyStock(),
    route: [],
    leg: 0,
    sailing: false,
    wait: 0,
  });
  return null;
}

/** Starts ship s on its trade route from the first stop, or stops it. */
export function setSailing(w: World, s: Ship, on: boolean) {
  s.sailing = on && s.route.length >= 2;
  if (s.sailing) {
    s.leg = 0;
    sailToHarbor(w, s, s.route[0].harbor);
  }
}

/** At a route stop: unload what it brings here, then fill the hold with what it takes on. */
function work(w: World, s: Ship) {
  const stop = s.route[s.leg];
  for (const g of stop.unload) transfer(w, s, g, -s.cargo[g]);
  // The room left shared among the goods to load, so one does not crowd out the rest.
  for (const [k, g] of stop.load.entries()) transfer(w, s, g, Math.floor((HOLD - cargoOf(s)) / (stop.load.length - k)));
}

/** The trader at a harbour: buys our surplus, sells us what we lack, as the island asks. */
function trade(w: World, s: Ship) {
  const b = w.buildings.get(s.docked);
  if (!b) return;
  const island = islandOf(w, b.x, b.y);
  const stock = w.stocks.get(island);
  const deals = w.trade.get(island);
  if (!stock || !deals) return;
  for (const g of Object.keys(deals) as Good[]) {
    if (deals[g] === 'sell' && stock[g] > KEEP) {
      w.gold += (stock[g] - KEEP) * PRICES[g];
      stock[g] = KEEP;
    } else if (deals[g] === 'buy' && stock[g] < FILL) {
      const price = Math.round(PRICES[g] * 1.5);
      const n = Math.min(FILL - stock[g], Math.floor(Math.max(0, w.gold) / price));
      stock[g] += n;
      w.gold -= n * price;
    }
  }
}

/** Harbours the trader calls at: those of islands with something to trade. */
const markets = (w: World) =>
  [...w.buildings.values()].filter(
    (b) => b.type === 'harbor' && Object.keys(w.trade.get(islandOf(w, b.x, b.y)) ?? {}).length,
  );

/** Advance every ship by dt game seconds. */
export function shipsTick(w: World, dt: number) {
  const W = w.map.width;
  for (const s of w.ships) {
    if (s.wait > 0) {
      s.wait -= dt;
      continue;
    }
    if (s.path.length) {
      // Towards the middle of the next tile on the course.
      const [tx, ty] = [(s.path[0] % W) + 0.5, Math.floor(s.path[0] / W) + 0.5];
      const d = Math.hypot(tx - s.x, ty - s.y);
      const step = SPEED * dt;
      if (d > 0.01) s.a = Math.atan2(ty - s.y, tx - s.x);
      if (d <= step) {
        [s.x, s.y] = [tx, ty];
        s.path.shift();
        if (!s.path.length) s.docked = s.goal;
      } else {
        s.x += ((tx - s.x) / d) * step;
        s.y += ((ty - s.y) / d) * step;
      }
      continue;
    }
    if (s.trader) {
      // Trade where it lies, then on to the next market; idle at sea while there is none.
      if (s.docked) {
        trade(w, s);
        s.docked = 0;
        s.wait = STAY;
        continue;
      }
      const list = markets(w);
      if (!list.length) continue;
      const next = list.find((b) => b.id > s.goal) ?? list[0];
      if (!sailToHarbor(w, s, next.id)) s.goal = next.id;
      continue;
    }
    if (s.sailing && s.docked === s.route[s.leg]?.harbor) {
      work(w, s);
      s.leg = (s.leg + 1) % s.route.length;
      s.wait = STAY;
      // Its next stop gone (demolished): the route ends here.
      if (!sailToHarbor(w, s, s.route[s.leg].harbor)) s.sailing = false;
    }
  }
}

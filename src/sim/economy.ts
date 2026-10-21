import { BUILDINGS, GOOD_NAMES, type Good } from '../data/buildings';
import { terrainAt } from './map';
import { type Building, type Cart, islandOf, roadRoute, roadsBeside, type World } from './world';

/** Simulation step, game seconds: the world advances in these, whatever the frame rate. */
export const TICK = 0.25;
/** Goods a producer holds before it must wait for a cart; the same for its input. */
export const CAP = 4;
/** Tiles a cart covers per game second. */
export const CART_SPEED = 1.1;
/** Seconds a cart stands loading or unloading. */
const HANDLING = 1;

/** How well a producer's surroundings feed it, 0..1: the share of the tiles it needs. */
export function coverage(w: World, b: Building) {
  const needs = BUILDINGS[b.type].production?.needs;
  if (!needs) return 1;
  const s = BUILDINGS[b.type].size;
  const [cx, cy] = [b.x + s / 2, b.y + s / 2];
  let n = 0;
  for (let y = Math.floor(cy - needs.radius); y < cy + needs.radius; y++)
    for (let x = Math.floor(cx - needs.radius); x < cx + needs.radius; x++) {
      const t = terrainAt(w.map, x, y);
      if (
        t &&
        needs.terrain.includes(t) &&
        !w.occupied[y * w.map.width + x] &&
        Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= needs.radius
      )
        n++;
    }
  return Math.min(1, n / needs.count);
}

/** Why a producer is not working at full speed, or null. */
export function trouble(w: World, b: Building): string | null {
  const p = BUILDINGS[b.type].production;
  if (!p) return null;
  if (!depotFor(w, b)) return 'Nincs úttal raktárhoz kötve';
  if (b.output! >= CAP) return 'Megtelt, a szekérre vár';
  if (p.input && !b.input) return `Nincs: ${GOOD_NAMES[p.input].toLowerCase()}`;
  if (coverage(w, b) < 1)
    return p.needs?.terrain.includes('forest') ? 'Kevés erdő a közelben' : 'Kevés alkalmas terület a közelben';
  return null;
}

/** The nearest depot on the producer's island that its roads reach, with the route there. */
function depotFor(w: World, b: Building) {
  const from = roadsBeside(w, b);
  if (!from.length) return null;
  const island = islandOf(w, b.x, b.y);
  let best: { depot: Building; route: number[] } | null = null;
  for (const d of w.buildings.values()) {
    if (!BUILDINGS[d.type].depot || islandOf(w, d.x, d.y) !== island) continue;
    const route = roadRoute(w, roadsBeside(w, d), from);
    if (route && (!best || route.length < best.route.length)) best = { depot: d, route };
  }
  return best;
}

/** Advance the economy by `dt` game seconds (call with TICK). */
export function tick(w: World, dt: number) {
  w.time += dt;
  // Production: a piece at a time while there is room for it and input to make it from.
  for (const b of w.buildings.values()) {
    const p = BUILDINGS[b.type].production;
    if (!p) continue;
    const working = b.output! < CAP && (!p.input || b.input! > 0);
    const rate = working ? coverage(w, b) : 0;
    b.progress! += (dt * rate) / p.seconds;
    if (b.progress! >= 1) {
      b.progress = 0;
      b.output!++;
      if (p.input) b.input!--;
    }
    // How hard it has worked over about the last minute.
    b.busy! += (rate - b.busy!) * Math.min(1, dt / 60);
  }
  // Every depot has one cart; an idle one takes the most pressing job on its island.
  for (const d of w.buildings.values())
    if (BUILDINGS[d.type].depot && !w.carts.some((c) => c.depot === d.id)) {
      const job = nextJob(w, d);
      if (job) w.carts.push(job);
    }
  w.carts = w.carts.filter((c) => moveCart(w, c, dt));
}

/** The job for depot d's cart: fetch from the fullest producer, or bring input to the neediest. */
function nextJob(w: World, d: Building): Cart | null {
  const stock = w.stocks.get(islandOf(w, d.x, d.y));
  if (!stock) return null;
  let best: { b: Building; score: number; good: Good | null; amount: number } | null = null;
  for (const b of w.buildings.values()) {
    const p = BUILDINGS[b.type].production;
    if (!p || w.carts.some((c) => c.producer === b.id)) continue;
    // Goods waiting count for more the fuller it is; an empty input store is as urgent as full.
    const fetch = b.output! >= 1 ? b.output! : 0;
    const need = p.input && b.input! <= 1 && stock[p.input] > 0 ? CAP - b.input! : 0;
    const score = Math.max(fetch, need);
    if (!score || (best && score <= best.score)) continue;
    if (depotFor(w, b)?.depot.id !== d.id) continue;
    // Taking input out: loaded now, from the depot's stock.
    const amount = need >= fetch && p.input ? Math.min(CAP - b.input!, stock[p.input]) : 0;
    best = { b, score, good: amount ? p.input! : null, amount };
  }
  if (!best) return null;
  const route = roadRoute(w, roadsBeside(w, d), roadsBeside(w, best.b))!;
  if (best.good) stock[best.good] -= best.amount;
  return {
    id: w.nextId++,
    depot: d.id,
    producer: best.b.id,
    route,
    pos: 0,
    dir: 1,
    wait: HANDLING,
    good: best.good,
    amount: best.amount,
  };
}

/** Moves cart c on; false once it is home and unloaded (or its depot is gone). */
function moveCart(w: World, c: Cart, dt: number) {
  const depot = w.buildings.get(c.depot);
  if (!depot) return false;
  if (c.wait > 0) {
    c.wait -= dt;
    return true;
  }
  c.pos += c.dir * dt * CART_SPEED;
  const end = c.route.length - 1;
  if (c.dir > 0 && c.pos >= end) {
    // At the producer: hand over the input, load what it has made, and turn back.
    c.pos = end;
    c.dir = -1;
    c.wait = HANDLING;
    const b = w.buildings.get(c.producer);
    const p = b && BUILDINGS[b.type].production;
    if (!b || !p) return true;
    if (c.good && c.good === p.input) {
      b.input! += c.amount;
      [c.good, c.amount] = [null, 0];
    }
    if (b.output! > 0) [c.good, c.amount, b.output] = [p.output, b.output!, 0];
  } else if (c.dir < 0 && c.pos <= 0) {
    // Home: into the island's store.
    const stock = w.stocks.get(islandOf(w, depot.x, depot.y));
    if (stock && c.good) stock[c.good] += c.amount;
    return false;
  }
  return true;
}

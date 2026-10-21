import type { Good } from '../data/buildings';
import { BUILDINGS } from '../data/buildings';
import type { GameMap, Terrain } from './map';
import {
  type Building,
  type Cart,
  createWorld,
  type Deal,
  type Ship,
  type Stock,
  updateTerritory,
  type World,
} from './world';

/** Where the map came from: a seed to generate it again, or the name of a hand-made one. */
export type Source = { seed: number } | { map: string };

/** A saved game: the map's source and the tiles changed since (forest cleared), and the world. */
export interface Save {
  v: 1;
  when: number;
  source: Source;
  tiles: [number, Terrain][];
  gold: number;
  buildings: Building[];
  stocks: [number, Stock][];
  carts: Cart[];
  ships: Ship[];
  trade: [number, Partial<Record<Good, Deal>>][];
  made: Stock;
  time: number;
  quest: number;
  nextId: number;
}

/** The world as a save. `pristine`: the tiles as the map was made, to store only what changed. */
export function toSave(w: World, source: Source, pristine: Terrain[]): Save {
  return {
    v: 1,
    when: Date.now(),
    source,
    tiles: w.map.tiles.flatMap((t, i): [number, Terrain][] => (t !== pristine[i] ? [[i, t]] : [])),
    gold: w.gold,
    buildings: [...w.buildings.values()],
    stocks: [...w.stocks],
    carts: w.carts,
    ships: w.ships,
    trade: [...w.trade],
    made: w.made,
    time: w.time,
    quest: w.quest,
    nextId: w.nextId,
  };
}

/** The world of save `s` on `map`, freshly made from its source. */
export function fromSave(map: GameMap, s: Save): World {
  for (const [i, t] of s.tiles) map.tiles[i] = t;
  const w = createWorld(map);
  Object.assign(w, {
    gold: s.gold,
    buildings: new Map(s.buildings.map((b) => [b.id, b])),
    stocks: new Map(s.stocks),
    carts: s.carts,
    ships: s.ships,
    trade: new Map(s.trade),
    made: s.made,
    time: s.time,
    quest: s.quest,
    nextId: s.nextId,
  });
  for (const b of w.buildings.values()) {
    const n = BUILDINGS[b.type].size;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) w.occupied[(b.y + dy) * map.width + b.x + dx] = b.id;
  }
  updateTerritory(w);
  return w;
}

/** Save slots in the browser: three of the player's and the autosave. */
export const SLOTS = ['1', '2', '3', 'auto'] as const;
export type Slot = (typeof SLOTS)[number];
const key = (slot: Slot) => `szigetek.mentes.${slot}`;

export function store(slot: Slot, s: Save) {
  try {
    localStorage.setItem(key(slot), JSON.stringify(s));
    return true;
  } catch {
    // Storage full or blocked.
    return false;
  }
}

export function fetchSave(slot: Slot): Save | null {
  try {
    const s = JSON.parse(localStorage.getItem(key(slot)) ?? 'null') as Save | null;
    return s?.v === 1 ? s : null;
  } catch {
    return null;
  }
}

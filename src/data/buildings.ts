import type { Terrain } from '../sim/map';

export type Good = 'wood' | 'tools' | 'bricks' | 'fish' | 'wool' | 'cloth';
export type Category = 'infra' | 'housing' | 'production' | 'public';
export type BuildingId =
  | 'harbor'
  | 'warehouse'
  | 'road'
  | 'house'
  | 'lumberjack'
  | 'fisher'
  | 'sheepfarm'
  | 'weaver'
  | 'smithy'
  | 'brickworks'
  | 'chapel';

/**
 * What a production building makes: one `output` every `seconds` of game time, using up one
 * `input` each time if it has one. `needs`: at least `count` tiles of `terrain` within `radius`
 * of it for full speed (fewer, slower).
 */
export interface Production {
  output: Good;
  seconds: number;
  input?: Good;
  needs?: { terrain: Terrain[]; radius: number; count: number };
}

export interface BuildingDef {
  name: string;
  category: Category;
  size: number;
  cost: { gold: number } & Partial<Record<Good, number>>;
  /** Must touch water (harbor, fisher). */
  coast?: boolean;
  /** Claims land within this many tiles on its own island. */
  radius?: number;
  /** Can be built outside claimed land: how new islands are settled. */
  settles?: boolean;
  /** Holds the island's goods; its cart fetches from producers and delivers their inputs. */
  depot?: boolean;
  production?: Production;
  /** Gold per minute to keep it running. */
  upkeep?: number;
}

export const GOOD_NAMES: Record<Good, string> = {
  wood: 'Fa',
  tools: 'Szerszám',
  bricks: 'Tégla',
  fish: 'Hal',
  wool: 'Gyapjú',
  cloth: 'Posztó',
};

export const CATEGORY_NAMES: Record<Category, string> = {
  infra: 'Infrastruktúra',
  housing: 'Lakás',
  production: 'Termelés',
  public: 'Közösség',
};

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  harbor: {
    name: 'Kikötő',
    upkeep: 20,
    category: 'infra',
    size: 2,
    cost: { gold: 1000, wood: 8, tools: 3 },
    coast: true,
    radius: 14,
    settles: true,
    depot: true,
  },
  warehouse: {
    name: 'Raktár',
    upkeep: 10,
    category: 'infra',
    size: 2,
    cost: { gold: 400, wood: 4, tools: 2 },
    radius: 10,
    depot: true,
  },
  road: { name: 'Út', category: 'infra', size: 1, cost: { gold: 5 } },
  house: { name: 'Paraszt ház', category: 'housing', size: 2, cost: { gold: 0, wood: 3 } },
  lumberjack: {
    name: 'Favágó',
    upkeep: 4,
    category: 'production',
    size: 2,
    cost: { gold: 50, wood: 2 },
    production: { output: 'wood', seconds: 20, needs: { terrain: ['forest'], radius: 3, count: 10 } },
  },
  fisher: {
    name: 'Halászkunyhó',
    upkeep: 5,
    category: 'production',
    size: 2,
    cost: { gold: 100, wood: 3, tools: 2 },
    coast: true,
    production: { output: 'fish', seconds: 25, needs: { terrain: ['water'], radius: 3, count: 8 } },
  },
  sheepfarm: {
    name: 'Birkafarm',
    upkeep: 6,
    category: 'production',
    size: 2,
    cost: { gold: 150, wood: 4, tools: 1 },
    production: { output: 'wool', seconds: 30, needs: { terrain: ['grass'], radius: 3, count: 12 } },
  },
  weaver: {
    name: 'Szövöde',
    upkeep: 10,
    category: 'production',
    size: 2,
    cost: { gold: 250, wood: 3, tools: 2, bricks: 2 },
    production: { output: 'cloth', seconds: 25, input: 'wool' },
  },
  smithy: {
    name: 'Kovácsműhely',
    upkeep: 12,
    category: 'production',
    size: 2,
    cost: { gold: 300, wood: 4, bricks: 3 },
    production: { output: 'tools', seconds: 40, input: 'wood' },
  },
  brickworks: {
    name: 'Téglaégető',
    upkeep: 8,
    category: 'production',
    size: 2,
    cost: { gold: 200, wood: 5, tools: 1 },
    // Clay and stone: below the mountains or on a rocky shore.
    production: { output: 'bricks', seconds: 35, needs: { terrain: ['mountain', 'rocky'], radius: 3, count: 3 } },
  },
  chapel: {
    name: 'Kápolna',
    upkeep: 8,
    category: 'public',
    size: 2,
    cost: { gold: 300, wood: 2, bricks: 4 },
  },
};

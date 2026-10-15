export type Good = 'wood' | 'tools' | 'bricks';
export type Category = 'infra' | 'housing' | 'production' | 'public';
export type BuildingId = 'harbor' | 'warehouse' | 'road' | 'house' | 'lumberjack' | 'fisher' | 'chapel';

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
}

export const GOOD_NAMES: Record<Good, string> = { wood: 'Fa', tools: 'Szerszám', bricks: 'Tégla' };

export const CATEGORY_NAMES: Record<Category, string> = {
  infra: 'Infrastruktúra',
  housing: 'Lakás',
  production: 'Termelés',
  public: 'Közösség',
};

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  harbor: {
    name: 'Kikötő',
    category: 'infra',
    size: 2,
    cost: { gold: 1000, wood: 8, tools: 3 },
    coast: true,
    radius: 14,
    settles: true,
  },
  warehouse: {
    name: 'Raktár',
    category: 'infra',
    size: 2,
    cost: { gold: 400, wood: 4, tools: 2 },
    radius: 10,
  },
  road: { name: 'Út', category: 'infra', size: 1, cost: { gold: 5 } },
  house: { name: 'Paraszt ház', category: 'housing', size: 2, cost: { gold: 0, wood: 3 } },
  lumberjack: {
    name: 'Favágó',
    category: 'production',
    size: 2,
    cost: { gold: 50, wood: 2 },
  },
  fisher: {
    name: 'Halászkunyhó',
    category: 'production',
    size: 2,
    cost: { gold: 100, wood: 3, tools: 2 },
    coast: true,
  },
  chapel: {
    name: 'Kápolna',
    category: 'public',
    size: 2,
    cost: { gold: 300, wood: 2, bricks: 4 },
  },
};

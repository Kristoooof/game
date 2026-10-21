import type { Good } from './buildings';

/** What a household wants: goods from the island's store, or faith (a chapel nearby). */
export type Need = Good | 'faith';

export interface Level {
  /** The people, and what their house is called. */
  name: string;
  house: string;
  /** Most residents a house of this level holds. */
  max: number;
  /** Gold per resident per minute, at full contentment. */
  tax: number;
  needs: Need[];
  /** Goods taken from the island's store to rise to the next level. */
  upgrade?: Partial<Record<Good, number>>;
}

export const LEVELS: Level[] = [
  { name: 'Paraszt', house: 'Paraszt ház', max: 8, tax: 1, needs: ['fish', 'faith'], upgrade: { wood: 3 } },
  {
    name: 'Polgár',
    house: 'Polgárház',
    max: 16,
    tax: 2,
    needs: ['fish', 'cloth', 'faith'],
    upgrade: { bricks: 3, tools: 2 },
  },
  { name: 'Kereskedő', house: 'Kereskedőház', max: 25, tax: 3, needs: ['fish', 'cloth', 'tools', 'faith'] },
];

/** Goods each resident uses up per minute. */
export const CONSUMPTION: Partial<Record<Good, number>> = { fish: 0.1, cloth: 0.05, tools: 0.03 };

export const NEED_NAMES: Record<Need, string> = {
  faith: 'kápolna',
  wood: 'fa',
  tools: 'szerszám',
  bricks: 'tégla',
  fish: 'hal',
  wool: 'gyapjú',
  cloth: 'posztó',
};

/** How far (tiles) a chapel serves the houses round it. */
export const CHAPEL_RADIUS = 10;

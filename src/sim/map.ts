import { mulberry32 } from './rng';

export type Terrain = 'water' | 'beach' | 'grass' | 'forest' | 'mountain';

export interface GameMap {
  width: number;
  height: number;
  /** Row-major: tiles[y * width + x]. */
  tiles: Terrain[];
}

export const terrainAt = (map: GameMap, x: number, y: number): Terrain | undefined =>
  x >= 0 && y >= 0 && x < map.width && y < map.height ? map.tiles[y * map.width + x] : undefined;

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth random field in [0, 1] with features about `cell` tiles wide. */
function valueNoise(rand: () => number, width: number, height: number, cell: number) {
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const grid = Array.from({ length: gw * gh }, rand);
  const g = (i: number, j: number) => grid[j * gw + i];
  return (x: number, y: number) => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    return lerp(lerp(g(ix, iy), g(ix + 1, iy), tx), lerp(g(ix, iy + 1), g(ix + 1, iy + 1), tx), ty);
  };
}

/** Archipelago: separate, noisy round islands in open sea. Deterministic for a given seed. */
export function generateMap(seed: number, size = 256, islandCount = 8): GameMap {
  const rand = mulberry32(seed);
  const islands: { x: number; y: number; r: number }[] = [];
  for (let tries = 0; islands.length < islandCount && tries < 2000; tries++) {
    const r = 22 + rand() * 18;
    const margin = r * 1.3 + 2;
    const x = margin + rand() * (size - 2 * margin);
    const y = margin + rand() * (size - 2 * margin);
    // Spacing beyond the noisy coastline keeps islands from merging.
    if (islands.every((i) => Math.hypot(i.x - x, i.y - y) > (i.r + r) * 1.3 + 3)) islands.push({ x, y, r });
  }

  const shape = valueNoise(rand, size, size, 12);
  const woods = valueNoise(rand, size, size, 14);
  const rocks = valueNoise(rand, size, size, 9);
  const tiles: Terrain[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const e = Math.max(-1, ...islands.map((i) => 1 - Math.hypot(i.x - x, i.y - y) / i.r));
      const h = e + (shape(x, y) - 0.5) * 0.4;
      tiles.push(
        h < 0
          ? 'water'
          : h < 0.12
            ? 'beach'
            : h > 0.6 && rocks(x, y) > 0.55
              ? 'mountain'
              : woods(x, y) > 0.55
                ? 'forest'
                : 'grass',
      );
    }
  }
  return { width: size, height: size, tiles };
}

const CHARS: Record<string, Terrain> = { '~': 'water', '.': 'beach', g: 'grass', f: 'forest', m: 'mountain' };

/** Hand-made map: one char per tile (~ water, . beach, g grass, f forest, m mountain), one line per row. */
export function parseMap(text: string): GameMap {
  const rows = text
    .trim()
    .split('\n')
    .map((r) => r.trim());
  const width = rows[0].length;
  const tiles = rows.flatMap((row, y) => {
    if (row.length !== width) throw new Error(`Map row ${y + 1} has ${row.length} tiles, expected ${width}`);
    return [...row].map((c, x) => {
      if (!(c in CHARS)) throw new Error(`Unknown map char '${c}' at ${x + 1},${y + 1}`);
      return CHARS[c];
    });
  });
  return { width, height: rows.length, tiles };
}

/** Island label per tile (4-neighbour flood fill): 0 for water, 1..n for each separate island. */
export function labelIslands(map: GameMap) {
  const labels = new Int32Array(map.tiles.length);
  let next = 0;
  map.tiles.forEach((t, start) => {
    if (t === 'water' || labels[start]) return;
    labels[start] = ++next;
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const j = ny * map.width + nx;
        const t2 = terrainAt(map, nx, ny);
        if (t2 && t2 !== 'water' && !labels[j]) {
          labels[j] = next;
          stack.push(j);
        }
      }
    }
  });
  return labels;
}

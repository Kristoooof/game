import { mulberry32 } from './rng';

/** `rocky`: stony shore instead of sand. `river`: fresh water across an island (only roads, as bridges). */
export type Terrain = 'water' | 'beach' | 'rocky' | 'grass' | 'forest' | 'mountain' | 'river';

export interface GameMap {
  width: number;
  height: number;
  /** Row-major: tiles[y * width + x]. */
  tiles: Terrain[];
  /** Terrace level per tile (0 sea level, up to MAX_LEVEL), row-major; absent means all flat. */
  levels?: Uint8Array;
  /** Where a river drops a terrace: the first tile below the fall and the flow direction. */
  waterfalls?: { x: number; y: number; dx: number; dy: number }[];
}

export const levelAt = (map: GameMap, x: number, y: number) =>
  x >= 0 && y >= 0 && x < map.width && y < map.height ? (map.levels?.[y * map.width + x] ?? 0) : 0;

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
  const dunes = valueNoise(rand, size, size, 10);
  const shore = valueNoise(rand, size, size, 7);
  const tiles: Terrain[] = [];
  const elev = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const e = Math.max(-1, ...islands.map((i) => 1 - Math.hypot(i.x - x, i.y - y) / i.r));
      const h = e + (shape(x, y) - 0.5) * 0.4;
      elev[y * size + x] = h;
      // Beaches widen into dune fields in places; some stretches of coast are bare rock.
      const beach = 0.09 + Math.max(0, dunes(x, y) - 0.5) * 0.5;
      tiles.push(
        h < 0
          ? 'water'
          : h < beach
            ? shore(x, y) > 0.68
              ? 'rocky'
              : 'beach'
            : h > 0.6 && rocks(x, y) > 0.55
              ? 'mountain'
              : woods(x, y) > 0.55
                ? 'forest'
                : 'grass',
      );
    }
  }
  const map: GameMap = { width: size, height: size, tiles, waterfalls: [] };
  map.levels = terraces(map, elev);
  for (const isl of islands) if (rand() < 0.8) carveRiver(map, isl, shape, rand);
  return map;
}

/**
 * Terraces from the elevation: level 1 inland, level 2 in the high middle. The coast stays at sea
 * level, a terrace keeps a few tiles from the sea, lone raised or sunken tiles are evened out, and
 * level 2 never borders level 0 (one cliff at a time).
 */
function terraces(map: GameMap, elev: Float32Array) {
  const { width: W, height: H, tiles } = map;
  const toSea = new Int32Array(W * H).fill(-1);
  const queue: number[] = [];
  tiles.forEach((t, i) => {
    if (t !== 'water') return;
    toSea[i] = 0;
    queue.push(i);
  });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of [i + 1, i - 1, i + W, i - W])
      if (j >= 0 && j < W * H && toSea[j] < 0) {
        toSea[j] = toSea[i] + 1;
        queue.push(j);
      }
  }
  const lv = new Uint8Array(W * H);
  tiles.forEach((t, i) => {
    if (t === 'water' || t === 'beach' || t === 'rocky') return;
    lv[i] = elev[i] > 0.62 && toSea[i] >= 7 ? 2 : elev[i] > 0.36 && toSea[i] >= 4 ? 1 : 0;
  });
  for (let pass = 0; pass < 3; pass++)
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const n = [lv[i + 1], lv[i - 1], lv[i + W], lv[i - W]];
        // A lone raised or sunken tile takes its lowest neighbour's level.
        if (!n.includes(lv[i])) lv[i] = Math.min(...n);
        if (
          lv[i] === 2 &&
          [i + 1, i - 1, i + W, i - W, i + W + 1, i + W - 1, i - W + 1, i - W - 1].some((j) => lv[j] === 0)
        )
          lv[i] = 1;
      }
  return lv;
}

/**
 * A river from the island's highlands (its highest mountain, else its centre) down to the sea:
 * it follows the island's slope with some meander and is two tiles wide. Where it leaves the
 * mountains it falls over the rock edge.
 */
function carveRiver(
  map: GameMap,
  isl: { x: number; y: number; r: number },
  shape: (x: number, y: number) => number,
  rand: () => number,
) {
  const { width: W, tiles } = map;
  const orig = tiles.slice();
  const slope = (x: number, y: number) => 1 - Math.hypot(isl.x - x, isl.y - y) / isl.r + (shape(x, y) - 0.5) * 0.15;
  let start = -1;
  let best = -Infinity;
  for (let y = Math.floor(isl.y - isl.r); y <= isl.y + isl.r; y++)
    for (let x = Math.floor(isl.x - isl.r); x <= isl.x + isl.r; x++) {
      const t = terrainAt(map, x, y);
      if (!t || t === 'water') continue;
      const score = slope(x, y) + (t === 'mountain' ? 10 : 0);
      if (score > best) [best, start] = [score, y * W + x];
    }
  if (start < 0) return;
  const seen = new Set<number>();
  const levels = map.levels!;
  // The river never climbs: its tiles are cut down to the level it has fallen to.
  let level = levels[start];
  let narrow = 8;
  let prev = [0, 0];
  for (let cur = start, steps = 0; steps < 200; steps++) {
    const x = cur % W;
    const y = Math.floor(cur / W);
    seen.add(cur);
    let next = -1;
    let low = Infinity;
    let dir = [0, 0];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const j = (y + dy) * W + x + dx;
      if (seen.has(j) || !terrainAt(map, x + dx, y + dy)) continue;
      // Never alongside its own earlier course: a winding river would otherwise smear into a pond.
      const touches = [j + 1, j - 1, j + W, j - W].some((k) => k !== cur && seen.has(k));
      // Always further from the island's centre, so it cannot circle in a hollow; the noise picks the bends.
      const out = Math.hypot(x + dx - isl.x, y + dy - isl.y) > Math.hypot(x - isl.x, y - isl.y);
      const v = shape(x + dx, y + dy) + (rand() - 0.5) * 0.15 + (touches ? 10 : 0) + (out ? 0 : 100);
      if (v < low) [low, next, dir] = [v, j, [dx, dy]];
    }
    if (next < 0) return;
    // A one-tile stream in the highlands and for a while below the fall, then two tiles wide.
    if (orig[cur] !== 'mountain') narrow--;
    // The second tile only on straight runs: on a diagonal the staircase is already wide enough.
    const wide = narrow <= 0 && dir[0] === prev[0] && dir[1] === prev[1];
    for (const k of wide ? [cur, cur + Math.abs(dir[1]) + Math.abs(dir[0]) * W] : [cur])
      if (tiles[k] !== 'water') {
        tiles[k] = 'river';
        levels[k] = Math.min(levels[k], level);
      }
    prev = dir;
    if (tiles[next] === 'water') return;
    // Dropping to a lower terrace: a waterfall over the cliff, and a narrow stream below it again.
    if (levels[next] < level) {
      level = levels[next];
      narrow = 6;
      map.waterfalls!.push({ x: next % W, y: Math.floor(next / W), dx: dir[0], dy: dir[1] });
    }
    cur = next;
  }
}

const CHARS: Record<string, Terrain> = {
  '~': 'water',
  '.': 'beach',
  k: 'rocky',
  g: 'grass',
  f: 'forest',
  m: 'mountain',
  r: 'river',
};

/** Hand-made map, one char per tile (~ water, . beach, k rocky shore, g grass, f forest, m mountain, r river), one line per row. */
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

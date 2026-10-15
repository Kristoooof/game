import { describe, expect, test } from 'vitest';
import pelda from '../data/maps/pelda.txt?raw';
import { type GameMap, generateMap, parseMap, terrainAt } from './map';

/** Sizes of connected land areas (4-neighbour flood fill). */
function landAreas(map: GameMap) {
  const seen = new Set<number>();
  const areas: number[] = [];
  map.tiles.forEach((t, start) => {
    if (t === 'water' || seen.has(start)) return;
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const t2 = terrainAt(map, nx, ny);
        const j = ny * map.width + nx;
        if (t2 && t2 !== 'water' && !seen.has(j)) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    areas.push(size);
  });
  return areas;
}

describe('generateMap', () => {
  test('is deterministic per seed', () => {
    expect(generateMap(42)).toEqual(generateMap(42));
    expect(generateMap(42).tiles).not.toEqual(generateMap(43).tiles);
  });

  test.each([1, 7, 1234, 99999])('seed %i: water border, several islands, all terrain', (seed) => {
    const map = generateMap(seed);
    for (let i = 0; i < map.width; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, map.height - 1],
        [0, i],
        [map.width - 1, i],
      ])
        expect(terrainAt(map, x, y)).toBe('water');
    }
    expect(landAreas(map).filter((a) => a >= 40).length).toBeGreaterThanOrEqual(3);
    expect(new Set(map.tiles)).toEqual(new Set(['water', 'beach', 'grass', 'forest', 'mountain']));
  });
});

describe('parseMap', () => {
  test('parses the bundled example map', () => {
    const map = parseMap(pelda);
    expect([map.width, map.height]).toEqual([32, 20]);
    expect(terrainAt(map, 6, 6)).toBe('mountain');
    expect(landAreas(map)).toHaveLength(3);
  });

  test('rejects ragged rows and unknown chars', () => {
    expect(() => parseMap('~~\n~')).toThrow('row 2');
    expect(() => parseMap('~x')).toThrow("'x'");
  });
});

import { describe, expect, test } from 'vitest';
import pelda from '../data/maps/pelda.txt?raw';
import { type GameMap, generateMap, labelIslands, levelAt, parseMap, terrainAt } from './map';

/** Sizes of separate islands. */
function landAreas(map: GameMap) {
  const sizes: number[] = [];
  for (const l of labelIslands(map)) if (l) sizes[l - 1] = (sizes[l - 1] ?? 0) + 1;
  return sizes;
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
    expect(new Set(map.tiles)).toEqual(new Set(['water', 'beach', 'rocky', 'grass', 'forest', 'mountain', 'river']));
  });

  test('rivers reach the sea without splitting their island', () => {
    const map = generateMap(1234);
    const labels = labelIslands(map);
    let mouths = 0;
    map.tiles.forEach((t, i) => {
      if (t !== 'river') return;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      // Every river tile belongs to an island, and some river tiles open onto the sea.
      expect(labels[i]).toBeGreaterThan(0);
      if (
        [
          terrainAt(map, x + 1, y),
          terrainAt(map, x - 1, y),
          terrainAt(map, x, y + 1),
          terrainAt(map, x, y - 1),
        ].includes('water')
      )
        mouths++;
    });
    expect(mouths).toBeGreaterThan(0);
    expect(map.waterfalls!.length).toBeGreaterThan(0);
    // Same islands as without rivers: a river counts as part of its island.
    const dry = { ...map, tiles: map.tiles.map((t) => (t === 'river' ? 'grass' : t)) };
    expect(Math.max(...labels)).toBe(Math.max(...labelIslands(dry)));
  });
});

describe('terraces', () => {
  test.each([1, 1234])('seed %i: coast at sea level, one cliff at a time, rivers fall at drops', (seed) => {
    const map = generateMap(seed);
    const W = map.width;
    map.tiles.forEach((t, i) => {
      const l = levelAt(map, i % W, Math.floor(i / W));
      if (t === 'water' || t === 'beach' || t === 'rocky') expect(l).toBe(0);
      // Level 2 only ever borders level 1, except where a river has cut down through it.
      if (l === 2 && t !== 'river')
        for (const j of [i + 1, i - 1, i + W, i - W])
          if (map.tiles[j] !== 'river') expect(levelAt(map, j % W, Math.floor(j / W))).toBeGreaterThan(0);
    });
    expect(Math.max(...map.levels!)).toBe(2);
    for (const f of map.waterfalls!)
      expect(levelAt(map, f.x - f.dx, f.y - f.dy)).toBeGreaterThan(levelAt(map, f.x, f.y));
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

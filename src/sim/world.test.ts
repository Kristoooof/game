import { expect, test } from 'vitest';
import { parseMap } from './map';
import { buildingAt, createWorld, demolish, place, placementError, roadPath } from './world';

const MAP = `
~~~~~~~~~~~
~..ggg.~gg~
~.gggff~gg~
~.ggmgg~~~~
~..ggg.~~~~
~~~~~~~~~~~`;

const owned = (w: ReturnType<typeof createWorld>, x: number, y: number) => w.owned[y * w.map.width + x];

test('harbor settles an island and claims land only on that island', () => {
  const w = createWorld(parseMap(MAP));
  expect(placementError(w, 'house', 2, 2)).toBe('Saját területen kívül');
  expect(placementError(w, 'harbor', 2, 2)).toBe('Partra kell építeni');
  expect(place(w, 'harbor', 1, 1)).toBeNull();
  expect(owned(w, 5, 4)).toBe(1);
  expect(owned(w, 8, 1)).toBe(0);
  expect(owned(w, 7, 1)).toBe(0); // water
  expect([w.gold, w.stock.wood, w.stock.tools]).toEqual([4000, 42, 27]);
});

test('placement checks terrain, overlap, coast and cost; forest is cleared', () => {
  const w = createWorld(parseMap(MAP));
  place(w, 'harbor', 1, 1);
  expect(placementError(w, 'house', 3, 3)).toBe('Ide nem lehet építeni'); // mountain at 4,3
  expect(placementError(w, 'house', 2, 2)).toBe('A hely foglalt');
  expect(place(w, 'house', 5, 2)).toBeNull();
  expect(w.map.tiles[2 * w.map.width + 5]).toBe('grass');
  expect(buildingAt(w, 6, 3)?.type).toBe('house');
  w.stock.bricks = 0;
  expect(placementError(w, 'chapel', 2, 3)).toBe('Nincs elég: tégla');
  w.gold = 0;
  expect(placementError(w, 'road', 3, 1)).toBe('Nincs elég arany');
});

test('demolish frees tiles and drops territory with its harbor', () => {
  const w = createWorld(parseMap(MAP));
  place(w, 'harbor', 1, 1);
  place(w, 'road', 3, 1);
  expect(demolish(w, 3, 1)?.type).toBe('road');
  expect(buildingAt(w, 3, 1)).toBeUndefined();
  expect(demolish(w, 2, 2)?.type).toBe('harbor');
  expect(owned(w, 4, 4)).toBe(0);
  expect(demolish(w, 0, 0)).toBeUndefined();
});

test('roadPath is an L along x then y', () => {
  expect(roadPath(0, 0, 2, 1)).toEqual([
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ]);
  expect(roadPath(3, 3, 3, 3)).toEqual([[3, 3]]);
  expect(roadPath(2, 2, 2, 0)).toEqual([
    [2, 2],
    [2, 1],
    [2, 0],
  ]);
});

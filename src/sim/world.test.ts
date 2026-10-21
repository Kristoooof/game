import { expect, test } from 'vitest';
import { parseMap } from './map';
import { buildingAt, createWorld, demolish, place, placementError, roadPath, roadRoute, roadsBeside } from './world';

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
  // The first harbour is paid from the ship lying off the island, which then unloads into it.
  const stock = w.stocks.get(w.islands[1 * w.map.width + 1])!;
  expect([w.gold, stock.wood, stock.tools]).toEqual([4000, 42, 27]);
  expect(w.ships[0].cargo.wood).toBe(0);
});

test('placement checks terrain, overlap, coast and cost; forest is cleared', () => {
  const w = createWorld(parseMap(MAP));
  place(w, 'harbor', 1, 1);
  expect(placementError(w, 'house', 3, 3)).toBe('Ide nem lehet építeni'); // mountain at 4,3
  expect(placementError(w, 'house', 2, 2)).toBe('A hely foglalt');
  expect(place(w, 'house', 5, 2)).toBeNull();
  expect(w.map.tiles[2 * w.map.width + 5]).toBe('grass');
  expect(buildingAt(w, 6, 3)?.type).toBe('house');
  w.stocks.get(w.islands[2 * w.map.width + 2])!.bricks = 0;
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

test('the second island needs a ship with the materials close by, and sheep only on some islands', () => {
  const w = createWorld(parseMap(MAP));
  place(w, 'harbor', 1, 1);
  const [ship] = w.ships;
  // The ship is empty now and lies off the home island, far from the eastern isle.
  [ship.x, ship.y] = [9.5, 3.5];
  expect(placementError(w, 'harbor', 8, 1)).toBe('Nincs elég: fa');
  [ship.x, ship.y] = [0.5, 5.5];
  ship.cargo.wood = 20;
  ship.cargo.tools = 5;
  expect(placementError(w, 'harbor', 8, 1)).toBe('Hajó kell a közelben az építőanyaggal');
  [ship.x, ship.y] = [9.5, 3.5];
  expect(place(w, 'harbor', 8, 1)).toBeNull();
  expect(ship.cargo.wood).toBe(12);
  expect(w.stocks.get(w.islands[1 * w.map.width + 8])!.wood).toBe(0);
  // The home island (the largest) keeps no sheep; the other does.
  expect(placementError(w, 'sheepfarm', 2, 3)).toBe('Ezen a szigeten nem terem: gyapjú');
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

test('carts find the shortest road route between buildings', () => {
  const w = createWorld(parseMap(MAP));
  place(w, 'harbor', 1, 1);
  for (const [x, y] of roadPath(3, 1, 3, 4)) place(w, 'road', x, y);
  place(w, 'road', 4, 4);
  place(w, 'house', 5, 1);
  const W = w.map.width;
  const harbor = buildingAt(w, 1, 1)!;
  const house = buildingAt(w, 5, 1)!;
  // The road at (3,1) touches the harbor; the house (5..6) has no road beside it until (4,1) is built.
  expect(roadsBeside(w, harbor)).toContain(1 * W + 3);
  expect(roadsBeside(w, house)).toEqual([]);
  place(w, 'road', 4, 1);
  const route = roadRoute(w, roadsBeside(w, harbor), roadsBeside(w, house));
  expect(route?.[route.length - 1]).toBe(1 * W + 4);
  expect(roadRoute(w, [4 * W + 4], roadsBeside(w, house))).toEqual([
    4 * W + 4,
    4 * W + 3,
    3 * W + 3,
    2 * W + 3,
    1 * W + 3,
    1 * W + 4,
  ]);
});

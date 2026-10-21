import { expect, test } from 'vitest';
import { CAP, coverage, tick, TICK, trouble } from './economy';
import { parseMap } from './map';
import { buildingAt, createWorld, place, roadPath, type World } from './world';

// A harbour on the west shore and a road east along row 3, between forest and grass.
const MAP = `
~~~~~~~~~~~~~~
~..ffffff.gg.~
~..ffffff.gg.~
~............~
~..gggggggg..~
~..gggggggg..~
~~~~~~~~~~~~~~`;

const run = (w: World, seconds: number) => {
  for (let t = 0; t < seconds; t += TICK) tick(w, TICK);
};

const setup = (roadEnd = 12) => {
  const w = createWorld(parseMap(MAP));
  expect(place(w, 'harbor', 1, 1)).toBeNull();
  for (const [x, y] of roadPath(2, 3, roadEnd, 3)) expect(place(w, 'road', x, y)).toBeNull();
  const stock = w.stocks.get(w.islands[1 * w.map.width + 1])!;
  return { w, stock };
};

test('a lumberjack by the forest makes wood and the cart brings it to the store', () => {
  const { w, stock } = setup();
  // In the wood (clearing its own four tiles): eight forest tiles left of the ten it wants.
  expect(place(w, 'lumberjack', 5, 1)).toBeNull();
  const lj = buildingAt(w, 5, 1)!;
  expect(coverage(w, lj)).toBeCloseTo(0.8);
  expect(trouble(w, lj)).toBe('Kevés erdő a közelben');
  const before = stock.wood;
  run(w, 120);
  // About five pieces in two minutes at 80 %, carted home (allow one on the way).
  expect(stock.wood - before).toBeGreaterThanOrEqual(3);
  expect(lj.busy).toBeGreaterThan(0.5);
});

test('without a road to a depot the goods pile up and production stops', () => {
  const { w } = setup(8);
  expect(place(w, 'sheepfarm', 10, 4)).toBeNull();
  const farm = buildingAt(w, 10, 4)!;
  expect(trouble(w, farm)).toBe('Nincs úttal raktárhoz kötve');
  run(w, 400);
  expect(farm.output).toBe(CAP);
  expect(farm.busy).toBeLessThan(0.1);
});

test('a weaver turns wool brought by cart into cloth', () => {
  const { w, stock } = setup();
  stock.wool = 6;
  expect(place(w, 'weaver', 8, 4)).toBeNull();
  const weaver = buildingAt(w, 8, 4)!;
  expect(trouble(w, weaver)).toBe('Nincs: gyapjú');
  run(w, 150);
  expect(stock.cloth).toBeGreaterThanOrEqual(3);
  expect(stock.wool + weaver.input!).toBeLessThanOrEqual(3);
});

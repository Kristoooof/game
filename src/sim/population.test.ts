import { expect, test } from 'vitest';
import { LEVELS } from '../data/population';
import { tick, TICK } from './economy';
import { parseMap } from './map';
import { balance, unmet } from './population';
import { buildingAt, createWorld, place, type World } from './world';

const MAP = `
~~~~~~~~~~~~
~..gggggg..~
~..gggggg..~
~..gggggg..~
~..gggggg..~
~~~~~~~~~~~~`;

const run = (w: World, seconds: number) => {
  for (let t = 0; t < seconds; t += TICK) tick(w, TICK);
};

const setup = () => {
  const w = createWorld(parseMap(MAP));
  expect(place(w, 'harbor', 1, 1)).toBeNull();
  expect(place(w, 'house', 4, 1)).toBeNull();
  const stock = w.stocks.get(w.islands[1 * w.map.width + 1])!;
  return { w, stock, house: buildingAt(w, 4, 1)! };
};

test('peasants without fish or a chapel grow discontent and leave', () => {
  const { w, house } = setup();
  run(w, 120);
  expect(unmet(w, house)).toEqual(['fish', 'faith']);
  expect(house.happy).toBeLessThan(0.2);
  expect(house.residents).toBe(Math.round(LEVELS[0].max * 0.25));
});

test('fed and with a chapel, a house fills up, eats fish and rises to burghers', () => {
  const { w, stock, house } = setup();
  stock.fish = 40;
  stock.wood = 10;
  expect(place(w, 'chapel', 7, 2)).toBeNull();
  run(w, 200);
  // Full by now, so it rose a level, paying three wood; the fish is being eaten.
  expect(house.level).toBe(1);
  expect(w.changed).toContain(house.id);
  expect(stock.fish).toBeLessThan(40);
  // Burghers also want cloth, which the island has none of.
  expect(unmet(w, house)).toEqual(['cloth']);
});

test('taxes come in and upkeep goes out', () => {
  const { w } = setup();
  const { income, upkeep, people } = balance(w);
  expect(people).toBe(2);
  expect(income).toBeGreaterThan(0);
  expect(upkeep).toBe(8);
  const gold = w.gold;
  run(w, 60);
  // A harbour's upkeep outweighs one small house's taxes.
  expect(w.gold).toBeLessThan(gold);
});

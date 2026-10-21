import { expect, test } from 'vitest';
import { tick, TICK } from './economy';
import { parseMap } from './map';
import { balance } from './population';
import { createWorld, place, roadPath } from './world';

// A home island: forest north, a mountain east, meadows south, sea all round.
const MAP = `
~~~~~~~~~~~~~~~~~~~~
~..fffffffff.......~
~..fffffffff....mm.~
~..fffffffff....mm.~
~..................~
~..gggggggggggggg..~
~..gggggggggggggg..~
~..gggggggggggggg..~
~..gggggggggggggg..~
~..................~
~~~~~~~~~~~~~~~~~~~~`;

/** A sensible start, as the quests lead it, played for twenty minutes of game time. */
test('a young town pays its way: gold never runs out, people and taxes grow', () => {
  const w = createWorld(parseMap(MAP));
  const build = (type: Parameters<typeof place>[1], x: number, y: number) =>
    expect([type, x, y, place(w, type, x, y)]).toEqual([type, x, y, null]);
  build('harbor', 1, 4);
  for (const [x, y] of roadPath(3, 4, 15, 4)) build('road', x, y);
  for (const [x, y] of roadPath(3, 9, 13, 9)) build('road', x, y);
  for (const [x, y] of roadPath(3, 5, 3, 8)) build('road', x, y);
  build('lumberjack', 5, 2);
  build('fisher', 1, 6);
  for (const x of [4, 6, 8, 10]) build('house', x, 5);
  build('chapel', 12, 5);
  build('brickworks', 14, 2);
  let lowest = w.gold;
  for (let t = 0; t < 20 * 60; t += TICK) {
    tick(w, TICK);
    lowest = Math.min(lowest, w.gold);
    // Six minutes in, more houses, as the town grows.
    if (Math.abs(t - 360) < TICK / 2) {
      for (const x of [4, 6, 8, 10]) build('house', x, 7);
      build('fisher', 1, 8);
    }
  }
  const { income, upkeep, people } = balance(w);
  expect(lowest).toBeGreaterThan(0);
  expect(people).toBeGreaterThanOrEqual(40);
  expect(income).toBeGreaterThan(upkeep);
  // Enough left over for a ship (600) and a harbour on the next island (1000).
  expect(w.gold).toBeGreaterThan(1600);
});

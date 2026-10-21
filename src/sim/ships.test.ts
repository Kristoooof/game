import { expect, test } from 'vitest';
import { PRICES } from '../data/buildings';
import { tick, TICK } from './economy';
import { parseMap } from './map';
import { buildShip, dockOf, FILL, KEEP, moveShip, sailToHarbor, seaPath, setSailing, transfer } from './ships';
import { buildingAt, createWorld, place, type World } from './world';

// Two islands with a channel between them; a headland in the middle of the channel.
const MAP = `
~~~~~~~~~~~~~~~~
~...~~~~~~~~~...
~...~~~.~~~~~...
~...~~~.~~~~~...
~...~~~~~~~~~...
~~~~~~~~~~~~~~~~`;

const run = (w: World, seconds: number) => {
  for (let t = 0; t < seconds; t += TICK) tick(w, TICK);
};

const setup = () => {
  const w = createWorld(parseMap(MAP));
  const W = w.map.width;
  expect(place(w, 'harbor', 1, 1)).toBeNull();
  const home = buildingAt(w, 1, 1)!;
  const ship = w.ships.find((s) => !s.trader)!;
  // Bring the ship over to the east island with materials, and settle it.
  ship.cargo.wood = 30;
  ship.cargo.tools = 10;
  [ship.x, ship.y] = [12.5, 2.5];
  expect(place(w, 'harbor', 13, 2)).toBeNull();
  const east = buildingAt(w, 13, 2)!;
  return { w, W, home, east, ship };
};

test('ships find a course round the headland, never through land', () => {
  const { w, W } = setup();
  const path = seaPath(w, 1 * W + 6, 1 * W + 8)!;
  // (7,1) is open, so it is two steps; around (7,2..3) from below it must go the long way.
  expect(path).toEqual([1 * W + 7, 1 * W + 8]);
  const round = seaPath(w, 3 * W + 6, 3 * W + 8)!;
  expect(round.every((i) => w.map.tiles[i] === 'water')).toBe(true);
  expect(round.length).toBeGreaterThan(2);
  expect(seaPath(w, 3 * W + 6, 2 * W + 7)).toBeNull();
});

test('a ship sails to a harbour, ties up, loads and unloads by hand', () => {
  const { w, home, east, ship } = setup();
  const homeStock = w.stocks.get(w.islands[1 * w.map.width + 1])!;
  expect(sailToHarbor(w, ship, home.id)).toBe(true);
  run(w, 20);
  expect(ship.docked).toBe(home.id);
  // 22 wood left aboard after paying for the east harbour; 10 more taken on.
  transfer(w, ship, 'wood', 10);
  expect(ship.cargo.wood).toBe(32);
  expect(homeStock.wood).toBe(42 - 10);
  transfer(w, ship, 'wood', -5);
  expect(homeStock.wood).toBe(37);
  // Moving off drops the berth.
  expect(moveShip(w, ship, 8, 4)).toBe(true);
  expect(ship.docked).toBe(0);
  expect(dockOf(w, east.id)).toBeGreaterThan(0);
});

test('on a trade route a ship carries goods round its stops by itself', () => {
  const { w, home, east, ship } = setup();
  const homeStock = w.stocks.get(w.islands[1 * w.map.width + 1])!;
  const eastStock = w.stocks.get(w.islands[2 * w.map.width + 13])!;
  homeStock.fish = 30;
  ship.route = [
    { harbor: home.id, unload: [], load: ['fish'] },
    { harbor: east.id, unload: ['fish'], load: [] },
  ];
  setSailing(w, ship, true);
  run(w, 60);
  expect(eastStock.fish).toBeGreaterThan(0);
  expect(homeStock.fish + eastStock.fish + ship.cargo.fish).toBe(30);
});

test('a harbour builds ships; the free trader buys surplus and sells what is short', () => {
  const { w, home } = setup();
  const stock = w.stocks.get(w.islands[1 * w.map.width + 1])!;
  const ships = w.ships.length;
  expect(buildShip(w, home.id)).toBeNull();
  expect(w.ships.length).toBe(ships + 1);
  stock.wood = 30;
  stock.fish = 0;
  w.trade.set(w.islands[1 * w.map.width + 1], { wood: 'sell', fish: 'buy' });
  const gold = w.gold;
  run(w, 90);
  expect(stock.wood).toBe(KEEP);
  expect(stock.fish).toBe(FILL);
  // Gold: the sold wood in, the bought fish out (at half as much again), and upkeep.
  const trade = (30 - KEEP) * PRICES.wood - FILL * Math.round(PRICES.fish * 1.5);
  expect(w.gold - gold).toBeLessThan(trade);
  expect(w.gold - gold).toBeGreaterThan(trade - 100);
});

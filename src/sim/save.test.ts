import { expect, test } from 'vitest';
import { tick, TICK } from './economy';
import { parseMap } from './map';
import { fromSave, toSave } from './save';
import { buildingAt, createWorld, place, roadPath } from './world';

const MAP = `
~~~~~~~~~~~~~~
~..ffffff.gg.~
~..ffffff.gg.~
~............~
~..gggggggg..~
~..gggggggg..~
~~~~~~~~~~~~~~`;

test('a saved game comes back the same, and plays on the same', () => {
  const map = parseMap(MAP);
  const pristine = [...map.tiles];
  const w = createWorld(map);
  place(w, 'harbor', 1, 1);
  for (const [x, y] of roadPath(2, 3, 12, 3)) place(w, 'road', x, y);
  place(w, 'lumberjack', 5, 1);
  place(w, 'house', 8, 4);
  for (let t = 0; t < 60; t += TICK) tick(w, TICK);
  const save = JSON.parse(JSON.stringify(toSave(w, { map: 'teszt' }, pristine)));
  // Only the forest cleared under the lumberjack is stored of the map.
  expect(save.tiles).toEqual([
    [1 * 14 + 5, 'grass'],
    [1 * 14 + 6, 'grass'],
    [2 * 14 + 5, 'grass'],
    [2 * 14 + 6, 'grass'],
  ]);
  const back = fromSave(parseMap(MAP), save);
  expect(buildingAt(back, 6, 2)?.type).toBe('lumberjack');
  expect(back.owned).toEqual(w.owned);
  expect(back.gold).toBe(w.gold);
  for (let t = 0; t < 60; t += TICK) {
    tick(w, TICK);
    tick(back, TICK);
  }
  expect([...back.stocks]).toEqual([...w.stocks]);
  expect(back.buildings.get(4)).toEqual(w.buildings.get(4));
});

import { expect, test } from 'vitest';
import { tick, TICK } from './economy';
import { parseMap } from './map';
import { QUESTS, questTick } from './quests';
import { createWorld, place, roadPath } from './world';

const MAP = `
~~~~~~~~~~~~~~
~..ffffff.gg.~
~..ffffff.gg.~
~............~
~..gggggggg..~
~..gggggggg..~
~~~~~~~~~~~~~~`;

test('quests follow one another as the town grows, paying their rewards', () => {
  const w = createWorld(parseMap(MAP));
  questTick(w);
  expect(w.quest).toBe(0);
  expect(QUESTS[0].progress(w)).toEqual([0, 1]);
  place(w, 'harbor', 1, 1);
  const gold = w.gold;
  questTick(w);
  expect(w.quest).toBe(1);
  expect(w.gold).toBe(gold + 200);
  expect(w.news.pop()).toBe('Teljesítve: Partraszállás · Jutalom: 200 arany');
  for (const [x, y] of roadPath(2, 3, 12, 3)) place(w, 'road', x, y);
  questTick(w);
  expect(w.quest).toBe(2);
  // Wood made and carted in counts; what was already in store does not.
  expect(QUESTS[2].progress(w)).toEqual([0, 5]);
  place(w, 'lumberjack', 5, 1);
  for (let t = 0; t < 200; t += TICK) {
    tick(w, TICK);
    questTick(w);
  }
  expect(w.quest).toBe(3);
  expect(QUESTS.every((q) => q.text.length > 40 && q.progress(w)[1] > 0)).toBe(true);
});

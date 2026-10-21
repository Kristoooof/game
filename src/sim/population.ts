import { BUILDINGS, type Good } from '../data/buildings';
import { CHAPEL_RADIUS, CONSUMPTION, LEVELS, NEED_NAMES, type Need } from '../data/population';
import { type Building, islandOf, warn, type World } from './world';

/** Seconds for a house to gain or lose one resident on its way to what it can hold. */
const SETTLE = 10;

/** True if a chapel stands within reach of house b. */
const faithful = (w: World, b: Building) =>
  [...w.buildings.values()].some((c) => c.type === 'chapel' && Math.hypot(c.x - b.x, c.y - b.y) <= CHAPEL_RADIUS);

/** How well house b's need is met right now: its island has the good in store, or a chapel near. */
function supplied(w: World, b: Building, need: Need) {
  if (need === 'faith') return faithful(w, b) ? 1 : 0;
  return (w.stocks.get(islandOf(w, b.x, b.y))?.[need] ?? 0) > 0 ? 1 : 0;
}

/** Needs of house b's people that are not being met. */
export const unmet = (w: World, b: Building) => LEVELS[b.level!].needs.filter((n) => (b.met![n] ?? 1) < 0.5);

/**
 * People: every house uses up goods from its island's store, grows content or not with how
 * well its needs are met, gains or loses residents, rises a level when full and content (and the
 * island has the building materials); they pay taxes, and every building costs its upkeep.
 */
export function populationTick(w: World, dt: number) {
  if (w.gold < 0) warn(w, 'gold', 'Elfogyott a pénz! Építs házakat az adóért, vagy bonts le, ami sokba kerül.', 120);
  for (const b of w.buildings.values()) {
    w.gold -= ((BUILDINGS[b.type].upkeep ?? 0) * dt) / 60;
    if (b.type !== 'house') continue;
    const lv = LEVELS[b.level!];
    const stock = w.stocks.get(islandOf(w, b.x, b.y));
    let sum = 0;
    for (const need of lv.needs) {
      // Goods are used up steadily and taken from the store a whole one at a time.
      const rate = CONSUMPTION[need as Good];
      if (rate) {
        const owed = (b.owed![need as Good] ?? 0) + (b.residents! * rate * dt) / 60;
        const g = need as Good;
        if (owed >= 1 && stock && stock[g] >= 1) {
          stock[g]--;
          b.owed![g] = owed - 1;
        } else b.owed![g] = Math.min(owed, 1);
      }
      // Contentment follows over about twenty seconds.
      const met = (b.met![need] ?? 1) + (supplied(w, b, need) - (b.met![need] ?? 1)) * Math.min(1, dt / 20);
      b.met![need] = met;
      sum += met;
    }
    b.happy = sum / lv.needs.length;
    // Tell the player what is short, once in a while, per island and good.
    const island = islandOf(w, b.x, b.y);
    for (const need of lv.needs)
      if ((b.met![need] ?? 1) < 0.5)
        warn(
          w,
          `${island}:${need}`,
          need === 'faith'
            ? `Kápolna hiányzik a házak közeléből (${island}. sziget)`
            : `Elfogyott: ${NEED_NAMES[need]} (${island}. sziget) – elégedetlenek a lakók`,
        );
    // Content houses fill up; half-content ones hold half; neglected ones empty to a quarter.
    const target = Math.round(lv.max * (b.happy >= 0.9 ? 1 : b.happy >= 0.5 ? 0.5 : 0.25));
    b.progress = (b.progress ?? 0) + dt / SETTLE;
    if (b.progress >= 1) {
      b.progress = 0;
      b.residents! += Math.sign(target - b.residents!);
    }
    // Full and content: they rebuild a level up, if the island can spare the materials.
    const up = lv.upgrade;
    if (
      up &&
      stock &&
      b.residents! >= lv.max &&
      b.happy >= 0.95 &&
      (Object.keys(up) as Good[]).every((g) => stock[g] >= up[g]!)
    ) {
      for (const g of Object.keys(up) as Good[]) stock[g] -= up[g]!;
      b.level!++;
      w.changed.push(b.id);
    }
    w.gold += (b.residents! * lv.tax * (0.5 + 0.5 * b.happy) * dt) / 60;
  }
}

/** Gold per minute coming in (taxes) and going out (upkeep), and the number of people. */
export function balance(w: World) {
  let income = 0;
  let upkeep = 0;
  let people = 0;
  for (const b of w.buildings.values()) {
    upkeep += BUILDINGS[b.type].upkeep ?? 0;
    if (b.type !== 'house') continue;
    income += b.residents! * LEVELS[b.level!].tax * (0.5 + 0.5 * b.happy!);
    people += b.residents!;
  }
  return { income, upkeep, people };
}

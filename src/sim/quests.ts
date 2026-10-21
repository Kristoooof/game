import { GOOD_NAMES, type BuildingId, type Good } from '../data/buildings';
import { CHAPEL_RADIUS } from '../data/population';
import { balance } from './population';
import type { World } from './world';

export interface Quest {
  title: string;
  /** What to do and how, in a few sentences. */
  text: string;
  /** How far along it is: [done, needed] of what the line under the text names. */
  progress: (w: World) => [number, number];
  /** What the progress counts, e.g. "Utak". */
  counts: string;
  reward: { gold?: number } & Partial<Record<Good, number>>;
}

const all = (w: World, type: BuildingId) => [...w.buildings.values()].filter((b) => b.type === type);
const people = (w: World) => balance(w).people;
const players = (w: World) => w.ships.filter((s) => !s.trader);

/** The story of the game, one task at a time: from the first landing to a merchant town. */
export const QUESTS: Quest[] = [
  {
    title: 'Partraszállás',
    text:
      'Hajód, a Hajnalcsillag a sziget partjánál vár, rakterében a település alapjaival. ' +
      'Építs kikötőt a part mentén, legfeljebb 8 mezőre a hajótól: Infrastruktúra → Kikötő. ' +
      'A hajó kirakodja az árut a kikötő raktárába.',
    counts: 'Kikötő',
    progress: (w) => [Math.min(1, all(w, 'harbor').length), 1],
    reward: { gold: 200 },
  },
  {
    title: 'Az első utak',
    text:
      'A szekerek csak úton járnak. Húzz utat a kikötőtől a sziget belseje felé: ' +
      'Infrastruktúra → Út, majd húzd az ujjad vagy az egeret. Az útnak a kikötő mellett kell kezdődnie.',
    counts: 'Útszakasz',
    progress: (w) => [Math.min(6, all(w, 'road').length), 6],
    reward: { gold: 100 },
  },
  {
    title: 'Fa kell',
    text:
      'Építkezni fa kell. Tegyél favágót erdő mellé (Termelés → Favágó), és kösd úttal a kikötőhöz. ' +
      'Minél több erdő van körülötte, annál gyorsabban dolgozik. A kikötő szekere hozza be a fát.',
    counts: 'Behozott fa',
    progress: (w) => [Math.min(5, w.made.wood), 5],
    reward: { gold: 100, tools: 2 },
  },
  {
    title: 'Otthonok',
    text:
      'Telepesek érkeznek, lakni akarnak. Építs három paraszt házat a kikötő körzetében ' +
      '(Lakás → Paraszt ház). Egy házba eleinte két ember költözik.',
    counts: 'Ház',
    progress: (w) => [Math.min(3, all(w, 'house').length), 3],
    reward: { wood: 6 },
  },
  {
    title: 'Halat az asztalra',
    text:
      'A parasztok halat esznek. Építs halászkunyhót a partra (Termelés → Halászkunyhó), ' +
      'és kösd úttal a kikötőhöz. Ha elfogy a hal, a házak elkezdenek kiürülni.',
    counts: 'Behozott hal',
    progress: (w) => [Math.min(5, w.made.fish), 5],
    reward: { gold: 150 },
  },
  {
    title: 'Hit',
    text:
      'A lakóknak templom is kell. Építs kápolnát (Közösség → Kápolna) legfeljebb ' +
      `${CHAPEL_RADIUS} mezőre a házaktól. Kell hozzá tégla is.`,
    counts: 'Kápolna a házak közelében',
    progress: (w) => [
      all(w, 'chapel').some((c) => all(w, 'house').some((h) => Math.hypot(c.x - h.x, c.y - h.y) <= CHAPEL_RADIUS))
        ? 1
        : 0,
      1,
    ],
    reward: { gold: 200 },
  },
  {
    title: 'Növekvő falu',
    text:
      'Ha van hal és kápolna, a házak megtelnek (egy paraszt házban 8-an laknak). ' +
      'Építs még házakat, amíg a falunak 30 lakója nem lesz. Házra koppintva látod, mi hiányzik nekik.',
    counts: 'Lakos',
    progress: (w) => [Math.min(30, people(w)), 30],
    reward: { gold: 300 },
  },
  {
    title: 'Polgárok',
    text:
      'A tele és elégedett paraszt ház polgárházzá bővül, ha van a raktárban 3 fa. ' +
      'A polgárok több adót fizetnek, de posztót is szeretnének.',
    counts: 'Polgárház',
    progress: (w) => [Math.min(1, all(w, 'house').filter((h) => h.level! >= 1).length), 1],
    reward: { gold: 300 },
  },
  {
    title: 'Téglaégetés',
    text:
      'A nagyobb épületekhez tégla kell. Építs téglaégetőt hegy lábához vagy sziklás partra ' +
      '(Termelés → Téglaégető), úttal a kikötőhöz kötve.',
    counts: 'Behozott tégla',
    progress: (w) => [Math.min(5, w.made.bricks), 5],
    reward: { gold: 200 },
  },
  {
    title: 'A kovács',
    text:
      'Szerszám kell a hajókhoz és a kereskedőházakhoz. A kovácsműhely (Termelés → Kovácsműhely) ' +
      'fából készít szerszámot: a szekér viszi neki a fát a raktárból.',
    counts: 'Behozott szerszám',
    progress: (w) => [Math.min(5, w.made.tools), 5],
    reward: { gold: 250 },
  },
  {
    title: 'Messzebb a parttól',
    text:
      'A kikötő csak a közelében enged építeni. Egy raktár (Infrastruktúra → Raktár) kiterjeszti a ' +
      'területet, és saját szekere is van, így a távoli termelőket is kiszolgálja.',
    counts: 'Raktár',
    progress: (w) => [Math.min(1, all(w, 'warehouse').length), 1],
    reward: { gold: 200 },
  },
  {
    title: 'Új hajó',
    text:
      'Koppints a kikötőre, és a panelen építs egy új hajót (600 arany, 10 fa, 4 szerszám). ' +
      'Hajóra koppintva kijelölöd; utána a vízre koppintva oda hajózik.',
    counts: 'Saját hajó',
    progress: (w) => [Math.min(2, players(w).length), 2],
    reward: { tools: 4 },
  },
  {
    title: 'Túl a tengeren',
    text:
      'A szövethez gyapjú kell, de a kezdő szigeten nem él meg a birka. Rakj hajóra legalább 8 fát és ' +
      '3 szerszámot (a hajó paneljén, kikötőben: „be 5”), hajózz egy másik szigethez, és építs ott kikötőt.',
    counts: 'Lakott sziget',
    progress: (w) => [Math.min(2, w.stocks.size), 2],
    reward: { gold: 400 },
  },
  {
    title: 'Birkák',
    text:
      'Az új szigeten építs birkafarmot füves területre, úttal a kikötőhöz kötve. ' +
      'Ha a sziget nem alkalmas, a hiba kiírja: akkor próbálj másik szigetet.',
    counts: 'Behozott gyapjú',
    progress: (w) => [Math.min(5, w.made.wool), 5],
    reward: { gold: 250 },
  },
  {
    title: 'Kereskedelmi útvonal',
    text:
      'Hajóra koppintva a panel alján: „+ Megálló”, majd koppints a gyapjús sziget kikötőjére, ' +
      'aztán az otthoni kikötőre. Az első megállóban a gyapjút állítsd „be”-re, a másodikban „ki”-re, ' +
      'végül „Útvonal indítása”.',
    counts: 'Útvonalon járó hajó',
    progress: (w) => [Math.min(1, players(w).filter((s) => s.sailing).length), 1],
    reward: { gold: 300 },
  },
  {
    title: 'Posztó',
    text:
      'Építs szövődét az otthoni szigeten, úttal bekötve: a szekér viszi neki a gyapjút a raktárból, ' +
      'ő posztót sző belőle. A polgárok ettől lesznek elégedettek.',
    counts: 'Behozott posztó',
    progress: (w) => [Math.min(5, w.made.cloth), 5],
    reward: { gold: 400 },
  },
  {
    title: 'Kereskedelem a szabadkereskedővel',
    text:
      'Koppints a kikötőre: a panelen áruként beállíthatod, mit adjon el (10 fölött) és mit vegyen ' +
      '(15-ig) a kikötőket járó szabadkereskedő. Adj el valamit, amiből sok van.',
    counts: 'Beállított áru',
    progress: (w) => [Math.min(1, [...w.trade.values()].filter((d) => Object.keys(d).length).length), 1],
    reward: { gold: 200 },
  },
  {
    title: 'Polgárváros',
    text: 'Növeld a várost 100 lakosig, és érd el, hogy a pénzmérleg (fent, a pénz mellett) pozitív legyen.',
    counts: 'Lakos (pozitív mérleggel)',
    progress: (w) => {
      const { income, upkeep, people } = balance(w);
      return [income >= upkeep ? Math.min(100, people) : Math.min(99, people), 100];
    },
    reward: { gold: 1000 },
  },
  {
    title: 'Kereskedők',
    text:
      'A tele és elégedett polgárház kereskedőházzá bővül 3 téglából és 2 szerszámból. ' +
      'A kereskedők halat, posztót, szerszámot és kápolnát kívánnak, cserébe a legtöbb adót fizetik.',
    counts: 'Kereskedőház',
    progress: (w) => [Math.min(1, all(w, 'house').filter((h) => h.level! >= 2).length), 1],
    reward: { gold: 1500 },
  },
];

const rewardText = (r: Quest['reward']) =>
  [
    r.gold ? `${r.gold} arany` : '',
    ...(Object.keys(GOOD_NAMES) as Good[]).map((g) => (r[g] ? `${r[g]} ${GOOD_NAMES[g].toLowerCase()}` : '')),
  ]
    .filter(Boolean)
    .join(', ');
export const rewardOf = (q: Quest) => rewardText(q.reward);

/** Checks the current quest; when done, pays its reward (into the first island's store) and moves on. */
export function questTick(w: World) {
  const q = QUESTS[w.quest];
  if (!q) return;
  const [done, needed] = q.progress(w);
  if (done < needed) return;
  w.gold += q.reward.gold ?? 0;
  const stock = w.stocks.values().next().value;
  if (stock) for (const g of Object.keys(GOOD_NAMES) as Good[]) stock[g] += q.reward[g] ?? 0;
  w.news.push({ text: `Teljesítve: ${q.title}` + (rewardOf(q) ? ` · Jutalom: ${rewardOf(q)}` : '') });
  w.quest++;
  if (!QUESTS[w.quest]) w.news.push({ text: 'Minden feladat kész: virágzó szigetvilágot építettél!' });
}

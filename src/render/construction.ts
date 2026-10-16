import { Container, Graphics } from 'pixi.js';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { drawBuilding } from './buildings';
import { groundToScreen } from './iso';

const BUILD_SECONDS = 2.8;
/** Rough height in pixels of each building, for the scaffold and the reveal. */
const HEIGHT: Partial<Record<BuildingId, number>> = { chapel: 58, harbor: 50, warehouse: 40, house: 42 };

interface Site {
  id: number;
  age: number;
  root: Container;
  mask: Graphics;
  scaffold: Graphics;
  /** Screen bounds: left/right x, the building's top and its front base. */
  left: number;
  right: number;
  top: number;
  base: number;
  nextDust: number;
  finished: boolean;
}

/**
 * Buildings going up: the finished picture revealed from the ground up behind wooden scaffolding,
 * with dust. The terrain leaves a building unbaked until `done` reports it finished.
 */
export function createConstruction(dust: (x: number, y: number) => void, done: (id: number) => void) {
  const layer = new Container();
  const sites: Site[] = [];

  const remove = (i: number) => {
    sites[i].root.destroy({ children: true });
    sites.splice(i, 1);
  };

  return {
    layer,
    start(b: { id: number; type: BuildingId; x: number; y: number }) {
      const size = BUILDINGS[b.type].size;
      const h = HEIGHT[b.type] ?? 30;
      const L = groundToScreen(b.x, b.y + size);
      const F = groundToScreen(b.x + size, b.y + size);
      const R = groundToScreen(b.x + size, b.y);
      const body = new Graphics();
      drawBuilding(body, b.type, b.x, b.y, b.id);
      const mask = new Graphics();
      body.mask = mask;
      // Front scaffold: poles at the corners and between, ledgers every 8 px, a brace per face.
      const scaffold = new Graphics();
      const poles = [L, { x: (L.x + F.x) / 2, y: (L.y + F.y) / 2 }, F, { x: (F.x + R.x) / 2, y: (F.y + R.y) / 2 }, R];
      for (const p of poles) scaffold.moveTo(p.x, p.y + 2).lineTo(p.x, p.y - h * 0.85);
      for (let k = 8; k < h * 0.85; k += 8)
        scaffold
          .moveTo(L.x, L.y - k)
          .lineTo(F.x, F.y - k)
          .lineTo(R.x, R.y - k);
      scaffold
        .moveTo(L.x, L.y)
        .lineTo(F.x, F.y - h * 0.6)
        .moveTo(R.x, R.y)
        .lineTo(F.x, F.y - h * 0.6);
      scaffold.stroke({ width: 1.1, color: 0x9a7448 });
      const root = new Container({ children: [body, mask, scaffold] });
      layer.addChild(root);
      sites.push({
        id: b.id,
        age: 0,
        root,
        mask,
        scaffold,
        left: L.x - 90,
        right: R.x + 90,
        top: groundToScreen(b.x, b.y).y - h - 20,
        base: F.y + 6,
        nextDust: 0,
        finished: false,
      });
    },
    /** Building demolished mid-construction. */
    cancel(id: number) {
      const i = sites.findIndex((s) => s.id === id);
      if (i >= 0) remove(i);
    },
    update(dt: number) {
      for (let i = sites.length - 1; i >= 0; i--) {
        const s = sites[i];
        s.age += dt;
        const k = Math.min(1, s.age / BUILD_SECONDS);
        // Ease out: quick start, settling at the top.
        const cut = s.base - (s.base - s.top) * (1 - (1 - k) ** 2);
        s.mask
          .clear()
          .rect(s.left, cut, s.right - s.left, s.base - cut + 30)
          .fill(0xffffff);
        s.scaffold.alpha = Math.min(1, (1 - k) * 5);
        s.nextDust -= dt;
        if (s.nextDust <= 0 && k < 0.9) {
          s.nextDust = 0.1;
          dust(s.left + 90 + Math.random() * (s.right - s.left - 180), s.base - 6 - Math.random() * 8);
        }
        // Kept a moment after `done`, until the terrain has baked the finished building.
        if (k >= 1 && !s.finished) {
          s.finished = true;
          done(s.id);
        }
        if (s.age > BUILD_SECONDS + 0.8) remove(i);
      }
    },
  };
}

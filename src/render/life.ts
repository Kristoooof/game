import { Container, Graphics, type Rectangle, type Renderer, Sprite, type Texture } from 'pixi.js';
import { terrainAt } from '../sim/map';
import { roadRoute, roadsBeside, type World } from '../sim/world';
import { groundToScreen } from './iso';

/** Texture of a small drawing, anchored at its local origin (feet, waterline). */
function bake(renderer: Renderer, draw: (g: Graphics) => void) {
  const g = new Graphics();
  draw(g);
  const b = g.getLocalBounds();
  const texture = renderer.generateTexture({ target: g, resolution: 3, antialias: true });
  g.destroy();
  return { texture, ax: -b.minX / b.width, ay: -b.minY / b.height };
}
type Baked = ReturnType<typeof bake>;
const spriteOf = (b: Baked) =>
  new Sprite({ texture: b.texture as Texture, anchor: { x: b.ax, y: b.ay }, eventMode: 'none' });

const TUNICS = [0x8a3a2a, 0x3f5f8a, 0x5a7a3a, 0x9a7a3a, 0x6a4a7a];
/** Two walking frames per tunic colour: legs apart, legs together. */
const walkerArt = (r: Renderer) =>
  TUNICS.map((tunic) =>
    [2, 0.6].map((stride) =>
      bake(r, (g) => {
        g.moveTo(-stride, 0).lineTo(-0.6, -4).moveTo(stride, 0).lineTo(0.6, -4).stroke({ width: 1.2, color: 0x3a2a1a });
        g.roundRect(-2.2, -9.5, 4.4, 6, 1.5).fill(tunic);
        g.circle(0, -11, 1.9).fill(0xe0b08a);
        g.circle(0, -11.8, 1.9).fill({ color: 0x4a3020, alpha: 0.9 });
      }),
    ),
  );
/** Horse-drawn cart with a load of crates, facing right. */
const cartArt = (r: Renderer) =>
  bake(r, (g) => {
    g.ellipse(-3, -1, 11, 2.5).fill({ color: 0x000000, alpha: 0.15 });
    g.roundRect(-11, -9, 13, 5, 1).fill(0x7a5230);
    g.rect(-10, -14, 5, 5).fill(0xa07a46);
    g.rect(-5, -13, 5, 4).fill(0x8f6a3c);
    g.circle(-8, -3, 3).fill(0x3a2a1a);
    g.circle(-8, -3, 1.6).fill(0x8a6a48);
    g.moveTo(2, -6).lineTo(6, -6).stroke({ width: 1, color: 0x4a3420 });
    // Horse.
    g.ellipse(9, -8, 4.5, 2.6).fill(0x6a4428);
    g.moveTo(6.5, -6).lineTo(6, 0).moveTo(11.5, -6).lineTo(12, 0).stroke({ width: 1.2, color: 0x5a3820 });
    g.poly([12, -9, 15.5, -13, 16.5, -11.5, 13.5, -8]).fill(0x6a4428);
    g.circle(-2, -10.5, 1.6).fill(0xe0b08a);
  });

/** A screen-space drawing of a vessel heading at angle `a` (tile space), origin on the waterline. */
function drawShip(g: Graphics, a: number, small: boolean) {
  const hx = Math.cos(a);
  const hy = Math.sin(a);
  const k = small ? 0.38 : 1;
  /** Point `u` tiles along the heading, `v` across it, `h` px up. */
  const S = (u: number, v: number, h = 0) => {
    const tx = (hx * u - hy * v) * k;
    const ty = (hy * u + hx * v) * k;
    return [(tx - ty) * 32, (tx + ty) * 16 - h * k];
  };
  // Hull outline from bow round to bow: tapered at the bow, broad amidships, a squared stern;
  // the sheer rises at both ends (a raised stern castle).
  const outline: [number, number, number][] = [
    [1.25, 0, 11],
    [0.85, 0.2, 8],
    [0.25, 0.33, 7],
    [-0.55, 0.3, 8],
    [-0.95, 0.2, 11],
    [-1, 0, 11],
    [-0.95, -0.2, 11],
    [-0.55, -0.3, 8],
    [0.25, -0.33, 7],
    [0.85, -0.2, 8],
  ];
  const bottom = outline.map(([u, v]) => S(u * 0.92, v * 0.75, 0));
  const top = outline.map(([u, v, h]) => S(u, v, h));
  g.clear();
  g.poly(bottom.flat()).fill(0x3e2614);
  for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length;
    g.poly([...bottom[i], ...bottom[j], ...top[j], ...top[i]]).fill(i < 5 ? 0x6e4626 : 0x553419);
  }
  g.poly(top.flat()).fill(0xa07448).stroke({ width: 1, color: 0x3a2412 });
  // Planking line along the sides.
  g.poly(outline.map(([u, v, h]) => S(u * 0.97, v * 0.9, h * 0.55)).flat()).stroke({
    width: 0.6,
    color: 0x3a2412,
    alpha: 0.6,
  });
  if (small) {
    // Rowing boat: a fisher with two oars.
    const c = S(0, 0, 6);
    g.moveTo(...(S(0, -0.9, 3) as [number, number]))
      .lineTo(...(S(0, 0.9, 3) as [number, number]))
      .stroke({ width: 0.8, color: 0x5a3820 });
    g.roundRect(c[0] - 1.6, c[1] - 6, 3.2, 5, 1).fill(0x3f5f8a);
    g.circle(c[0], c[1] - 7.3, 1.5).fill(0xe0b08a);
    return;
  }
  const bow = S(1.1, 0, 6);
  const sprit = S(1.5, 0, 12);
  g.moveTo(bow[0], bow[1]).lineTo(sprit[0], sprit[1]).stroke({ width: 1.2, color: 0x4a3018 });
  const foot = S(0.05, 0, 6);
  const head = S(0.05, 0, 54);
  g.moveTo(foot[0], foot[1]).lineTo(head[0], head[1]).stroke({ width: 2, color: 0x3a2412 });
  // Square sail bellied forward, a red band across it, and a pennant streaming aft.
  const sail = [
    S(0.05, -0.6, 18),
    S(0.2, 0, 15),
    S(0.05, 0.6, 18),
    S(0.05, 0.55, 47),
    S(0.17, 0, 48),
    S(0.05, -0.55, 47),
  ];
  g.poly(sail.flat()).fill(0xf0e6cc).stroke({ width: 0.8, color: 0xb8a888 });
  g.poly([
    ...S(0.07, -0.58, 28),
    ...S(0.2, 0, 26),
    ...S(0.07, 0.58, 28),
    ...S(0.07, 0.57, 33),
    ...S(0.2, 0, 32),
    ...S(0.07, -0.57, 33),
  ]).fill(0xb8402e);
  g.poly([...head, ...S(-0.35, 0, 51), ...S(0.05, 0, 48)]).fill(0xc0392b);
}

interface Walker {
  s: Sprite;
  frames: Baked[];
  from: number;
  to: number;
  t: number;
  step: number;
}
interface Cart {
  s: Sprite;
  route: number[];
  /** Position along the route in tiles; the cart turns round at either end after a pause. */
  pos: number;
  dir: number;
  wait: number;
  home: number[];
}
interface Vessel {
  g: Graphics;
  mirror: Graphics;
  x: number;
  y: number;
  a: number;
  drawn: number;
  tx: number;
  ty: number;
  speed: number;
  wait: number;
  small: boolean;
  /** Fishing boats keep near their hut: its tile and how far they may go. */
  home?: { x: number; y: number; r: number };
  nextWake: number;
}

const WALK_SPEED = 0.7;
const CART_SPEED = 1.1;

/**
 * Life on the map: people walking the roads, carts between warehouses and houses, fishing boats
 * off the fishers' huts and sailing ships at sea. They go in `front`, depth-sorted with the
 * buildings and trees; wakes and reflections in `water`, between the sea and the land.
 */
export function createLife(world: World, renderer: Renderer, front: Container) {
  const { map } = world;
  const W = map.width;
  const wakes = new Graphics({ eventMode: 'none' });
  const mirrors = new Container({ eventMode: 'none', alpha: 0.28 });
  const water = new Container({ children: [wakes, mirrors], eventMode: 'none' });
  const walkerFrames = walkerArt(renderer);
  const cartTex = cartArt(renderer);

  const center = (i: number) => groundToScreen((i % W) + 0.5, Math.floor(i / W) + 0.5);
  /** Tile x + y of a point a fraction t from tile i's centre to tile j's (matches the scene's zIndex). */
  const depth = (i: number, j: number, t: number) => {
    const a = (i % W) + Math.floor(i / W);
    const b = (j % W) + Math.floor(j / W);
    return a + (b - a) * t + 1;
  };
  const isRoad = (i: number) => world.buildings.get(world.occupied[i])?.type === 'road';
  const roadNeighbours = (i: number) =>
    [i + 1, i - 1, i + W, i - W].filter((j) => j >= 0 && j < map.tiles.length && isRoad(j));

  // Open water at least three tiles from any land: where ships may sail.
  const toLand = new Int32Array(W * map.height).fill(-1);
  {
    const queue: number[] = [];
    map.tiles.forEach((t, i) => {
      if (t === 'water') return;
      toLand[i] = 0;
      queue.push(i);
    });
    for (let q = 0; q < queue.length; q++)
      for (const j of [queue[q] + 1, queue[q] - 1, queue[q] + W, queue[q] - W])
        if (j >= 0 && j < toLand.length && toLand[j] < 0) {
          toLand[j] = toLand[queue[q]] + 1;
          queue.push(j);
        }
  }
  const sea = (x: number, y: number, min: number) => {
    const i = Math.floor(y) * W + Math.floor(x);
    return terrainAt(map, Math.floor(x), Math.floor(y)) === 'water' && toLand[i] >= min;
  };
  const clearLine = (ax: number, ay: number, bx: number, by: number, min: number) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let k = 1; k <= n; k++) if (!sea(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, min)) return false;
    return true;
  };

  let walkers: Walker[] = [];
  let carts: Cart[] = [];
  const ships: Vessel[] = [];
  let boats: Vessel[] = [];
  const wake: { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number }[] = [];

  const newVessel = (x: number, y: number, small: boolean, home?: Vessel['home']): Vessel => {
    const g = new Graphics();
    const mirror = new Graphics({ tint: 0x2a6a8a });
    mirror.scale.y = -1;
    front.addChild(g);
    mirrors.addChild(mirror);
    return {
      g,
      mirror,
      x,
      y,
      a: Math.random() * Math.PI * 2,
      drawn: NaN,
      tx: x,
      ty: y,
      speed: small ? 0.5 : 1.2,
      wait: 0,
      small,
      home,
      nextWake: 0,
    };
  };
  // Ships: a handful on the open sea, wherever there is room.
  for (let tries = 0; ships.length < 7 && tries < 2000; tries++) {
    const x = Math.random() * W;
    const y = Math.random() * map.height;
    if (sea(x, y, 4)) ships.push(newVessel(x, y, false));
  }

  /** Next destination: a reachable spot in open water, or near its hut for a fishing boat. */
  const retarget = (v: Vessel) => {
    for (let tries = 0; tries < 30; tries++) {
      const r = v.home ? v.home.r : 45;
      const cx = v.home ? v.home.x : v.x;
      const cy = v.home ? v.home.y : v.y;
      const tx = cx + (Math.random() - 0.5) * 2 * r;
      const ty = cy + (Math.random() - 0.5) * 2 * r;
      const min = v.small ? 1 : 3;
      if (sea(tx, ty, min) && clearLine(v.x, v.y, tx, ty, min)) {
        [v.tx, v.ty] = [tx, ty];
        return;
      }
    }
    v.wait = 2;
  };

  return {
    water,
    /** The world changed: people, carts and fishing boats follow its roads and buildings. */
    refresh() {
      const roads = [...world.buildings.values()].filter((b) => b.type === 'road').map((b) => b.y * W + b.x);
      const houses = [...world.buildings.values()].filter((b) => b.type === 'house');
      // Walkers: about three per house, as the roads allow.
      const want = Math.min(60, Math.floor(roads.length / 2), houses.length * 3);
      walkers = walkers.filter((w) => {
        const keep = isRoad(w.from) && isRoad(w.to);
        if (!keep) w.s.destroy();
        return keep;
      });
      while (walkers.length > want) walkers.pop()!.s.destroy();
      while (walkers.length < want) {
        const from = roads[Math.floor(Math.random() * roads.length)];
        const frames = walkerFrames[Math.floor(Math.random() * walkerFrames.length)];
        const s = spriteOf(frames[0]);
        front.addChild(s);
        walkers.push({ s, frames, from, to: roadNeighbours(from)[0] ?? from, t: Math.random(), step: Math.random() });
      }
      // Carts: one per warehouse or harbour, to houses it can reach by road.
      for (const c of carts) c.s.destroy();
      carts = [];
      for (const b of world.buildings.values()) {
        if (b.type !== 'warehouse' && b.type !== 'harbor') continue;
        const home = roadsBeside(world, b);
        const targets = houses.map((h) => roadsBeside(world, h)).filter((r) => r.length);
        const route =
          home.length && targets.length
            ? roadRoute(world, home, targets[Math.floor(Math.random() * targets.length)])
            : null;
        if (!route || route.length < 2) continue;
        const s = spriteOf(cartTex);
        front.addChild(s);
        carts.push({ s, route, pos: 0, dir: 1, wait: 1, home });
      }
      // Fishing boats: one per fisher hut.
      for (const v of boats) {
        v.g.destroy();
        v.mirror.destroy();
      }
      boats = [];
      for (const b of world.buildings.values()) {
        if (b.type !== 'fisher') continue;
        for (let tries = 0; tries < 40; tries++) {
          const x = b.x + 1 + (Math.random() - 0.5) * 8;
          const y = b.y + 1 + (Math.random() - 0.5) * 8;
          if (sea(x, y, 1)) {
            boats.push(newVessel(x, y, true, { x: b.x + 1, y: b.y + 1, r: 7 }));
            break;
          }
        }
      }
    },
    update(dt: number, view: Rectangle, far: boolean) {
      water.visible = !far;
      if (far) return;
      const inView = (x: number, y: number, m = 80) =>
        x > view.x - m && x < view.x + view.width + m && y > view.y - m && y < view.y + view.height + m;

      for (const w of walkers) {
        w.t += dt * WALK_SPEED;
        if (w.t >= 1) {
          // At the next tile: carry on, turning at random; back only at a dead end.
          const options = roadNeighbours(w.to).filter((j) => j !== w.from);
          const next = options.length ? options[Math.floor(Math.random() * options.length)] : w.from;
          [w.from, w.to, w.t] = [w.to, next, w.t - 1];
        }
        const a = center(w.from);
        const b = center(w.to);
        // Keep to the right of the road, so people pass each other.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const x = a.x + dx * w.t - (dy / len) * 5;
        const y = a.y + dy * w.t + (dx / len) * 2.5;
        w.s.visible = inView(x, y);
        if (!w.s.visible) continue;
        // Depth among buildings and trees: tile x + y of where it stands.
        w.s.zIndex = depth(w.from, w.to, w.t);
        w.step = (w.step + dt * 4) % 1;
        w.s.texture = w.frames[w.step < 0.5 ? 0 : 1].texture as Texture;
        w.s.position.set(x, y - Math.abs(Math.sin(w.step * Math.PI * 2)) * 0.6);
        w.s.scale.x = dx < 0 ? -1 : 1;
      }

      for (const c of carts) {
        if (c.wait > 0) {
          c.wait -= dt;
        } else {
          c.pos += c.dir * dt * CART_SPEED;
          if (c.pos >= c.route.length - 1 || c.pos <= 0) {
            c.pos = Math.max(0, Math.min(c.route.length - 1, c.pos));
            c.dir = -c.dir;
            c.wait = 2;
          }
        }
        const i = Math.min(c.route.length - 2, Math.floor(c.pos));
        const a = center(c.route[i]);
        const b = center(c.route[i + 1]);
        const t = c.pos - i;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        c.s.visible = inView(x, y);
        c.s.zIndex = depth(c.route[i], c.route[i + 1], t);
        c.s.position.set(x, y);
        c.s.scale.x = (b.x - a.x) * c.dir < 0 ? -1 : 1;
      }

      const all = [...ships, ...boats];
      // Never overlap, even while one lies still: vessels too close are eased apart.
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const [a, b] = [all[i], all[j]];
          const min = a.small && b.small ? 0.6 : a.small || b.small ? 1.2 : 2.2;
          const ox = a.x - b.x;
          const oy = a.y - b.y;
          const d = Math.hypot(ox, oy) || 0.01;
          if (d >= min) continue;
          const k = ((min - d) / d) * Math.min(1, dt * 2) * 0.5;
          if (sea(a.x + ox * k, a.y + oy * k, 1)) [a.x, a.y] = [a.x + ox * k, a.y + oy * k];
          if (sea(b.x - ox * k, b.y - oy * k, 1)) [b.x, b.y] = [b.x - ox * k, b.y - oy * k];
        }
      for (const v of all) {
        const dx = v.tx - v.x;
        const dy = v.ty - v.y;
        const dist = Math.hypot(dx, dy);
        if (v.wait > 0) v.wait -= dt;
        else if (dist < 0.5) {
          // Arrived: fishing boats stop a while to fish, ships sail on.
          v.wait = v.small ? 3 + Math.random() * 4 : 0;
          retarget(v);
        } else {
          // Steer for the destination, pushed off by every vessel close by (more the closer it
          // is), and slow down when one lies ahead: they give way instead of sailing through.
          let sx = dx / dist;
          let sy = dy / dist;
          let ahead = 0;
          const room = v.small ? 1.2 : 3.5;
          for (const u of all) {
            if (u === v) continue;
            const ox = v.x - u.x;
            const oy = v.y - u.y;
            const d = Math.hypot(ox, oy);
            if (d >= room || d === 0) continue;
            const push = ((room - d) / room) * 2.5;
            sx += (ox / d) * push;
            sy += (oy / d) * push;
            // In front of us (within ~45° of the heading)?
            if ((-ox * Math.cos(v.a) - oy * Math.sin(v.a)) / d > 0.7) ahead = Math.max(ahead, 1 - d / room);
          }
          let da = Math.atan2(sy, sx) - v.a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          v.a += Math.max(-dt * 0.8, Math.min(dt * 0.8, da));
          const sp = v.speed * (1 - Math.min(0.7, Math.abs(da))) * (1 - ahead * 0.8);
          const nx = v.x + Math.cos(v.a) * sp * dt;
          const ny = v.y + Math.sin(v.a) * sp * dt;
          if (sea(nx, ny, v.small ? 1 : 2)) [v.x, v.y] = [nx, ny];
          else retarget(v);
        }
        const p = groundToScreen(v.x, v.y);
        const vis = inView(p.x, p.y, 120);
        v.g.visible = v.mirror.visible = vis;
        if (!vis) continue;
        // Redrawn only when the heading has turned past one of 32 steps.
        const q = Math.round((v.a / (Math.PI * 2)) * 32);
        if (q !== v.drawn) {
          v.drawn = q;
          drawShip(v.g, (q / 32) * Math.PI * 2, v.small);
          drawShip(v.mirror, (q / 32) * Math.PI * 2, v.small);
        }
        const bob = Math.sin(performance.now() / 600 + v.tx) * 0.8;
        v.g.position.set(p.x, p.y + bob);
        v.g.zIndex = v.x + v.y;
        v.mirror.position.set(p.x, p.y + bob);
        // Wake: foam left at the stern, spreading out to both sides.
        const moving = v.wait <= 0 && dist >= 0.5;
        v.nextWake -= dt;
        if (moving && v.nextWake <= 0 && wake.length < 1500) {
          v.nextWake = v.small ? 0.15 : 0.05;
          const k = v.small ? 0.38 : 1;
          const sx = Math.cos(v.a);
          const sy = Math.sin(v.a);
          const stern = groundToScreen(v.x - sx * 0.9 * k, v.y - sy * 0.9 * k);
          // Sideways in screen space: the heading's perpendicular, projected.
          const px = (-sy - sx) * 32 * 0.25;
          const py = (-sy + sx) * 16 * 0.25;
          for (const side of [-1, 1])
            wake.push({
              x: stern.x,
              y: stern.y,
              vx: px * side,
              vy: py * side,
              age: 0,
              life: v.small ? 1.6 : 3.5,
              size: k,
            });
        }
      }

      wakes.clear();
      for (let i = wake.length - 1; i >= 0; i--) {
        const w = wake[i];
        w.age += dt;
        if (w.age >= w.life) {
          wake.splice(i, 1);
          continue;
        }
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        if (!inView(w.x, w.y)) continue;
        const k = w.age / w.life;
        wakes
          .ellipse(w.x, w.y, (4 + k * 10) * w.size + 1, (1.8 + k * 4.5) * w.size + 0.5)
          .fill({ color: 0xf2fafa, alpha: 0.28 * (1 - k) });
      }
      // Bow waves: a curl of white water at the bow of every moving ship.
      for (const v of ships) {
        if (!v.g.visible || v.wait > 0) continue;
        const bow = groundToScreen(v.x + Math.cos(v.a) * 1.1, v.y + Math.sin(v.a) * 1.1);
        const pulse = 1 + 0.15 * Math.sin(performance.now() / 180 + v.x);
        wakes.ellipse(bow.x, bow.y + 1, 7 * pulse, 2.6 * pulse).fill({ color: 0xffffff, alpha: 0.7 });
      }
    },
  };
}

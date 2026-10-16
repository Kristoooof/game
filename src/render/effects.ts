import { Container, Graphics, type Rectangle, Sprite, Texture } from 'pixi.js';
import type { GameMap } from '../sim/map';
import { terrainAt } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { groundToScreen, screenToGround, tileToScreen } from './iso';

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(235,232,225,0.9)');
  g.addColorStop(0.6, 'rgba(210,205,198,0.45)');
  g.addColorStop(1, 'rgba(200,195,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return Texture.from(c);
}

interface Puff {
  s: Sprite;
  age: number;
  life: number;
  vx: number;
  /** Rise speed, px/s. */
  vy: number;
  /** Final scale and opacity. */
  size: number;
  alpha: number;
}

const MAX_PUFFS = 300;

/** Chimney smoke, seagulls, flocks of birds and leaping fish. Work is skipped for anything outside `view`. */
export function createEffects(map: GameMap) {
  const layer = new Container();
  const puffTex = puffTexture();
  const puffs: Puff[] = [];
  let chimneys: { x: number; y: number; next: number }[] = [];

  // Gulls circle above the water just off a few random coasts.
  const r = mulberry32(77);
  const coasts: { x: number; y: number }[] = [];
  for (let tries = 0; coasts.length < 14 && tries < 20000; tries++) {
    const x = Math.floor(r() * map.width);
    const y = Math.floor(r() * map.height);
    if (
      terrainAt(map, x, y) === 'water' &&
      [terrainAt(map, x + 2, y), terrainAt(map, x, y + 2)].some((t) => t && t !== 'water')
    )
      coasts.push(tileToScreen(x, y));
  }
  const gulls = coasts.map((c) => {
    const body = new Graphics();
    body
      .moveTo(-7, -2)
      .quadraticCurveTo(-3, -5, 0, 0)
      .quadraticCurveTo(3, -5, 7, -2)
      .stroke({ width: 1.8, color: 0xffffff, cap: 'round' });
    body.moveTo(-7, -2).lineTo(-5.5, -2.6).moveTo(7, -2).lineTo(5.5, -2.6).stroke({ width: 1.8, color: 0x333333 });
    const shadow = new Graphics();
    shadow
      .moveTo(-7, -2)
      .quadraticCurveTo(-3, -5, 0, 0)
      .quadraticCurveTo(3, -5, 7, -2)
      .stroke({ width: 1.8, color: 0x000000, alpha: 0.18 });
    layer.addChild(shadow, body);
    return {
      body,
      shadow,
      cx: c.x,
      cy: c.y,
      rad: 60 + r() * 120,
      speed: (0.25 + r() * 0.3) * (r() < 0.5 ? -1 : 1),
      phase: r() * 10,
    };
  });

  // Spray rising at the foot of each waterfall (the falling water itself is in the sea shader).
  const falls = (map.waterfalls ?? []).map((f) => ({
    ...groundToScreen(f.x + 0.5 - f.dx * 0.4, f.y + 0.5 - f.dy * 0.4),
    next: 0,
  }));

  // A flock now and then, crossing the view: small dark birds in a loose wedge, their shadows on the land.
  type Bird = { body: Graphics; shadow: Graphics; dx: number; dy: number; phase: number };
  let flock: { x: number; y: number; vx: number; vy: number; birds: Bird[] } | null = null;
  let nextFlock = 8;
  const bird = (color: number, alpha: number) =>
    new Graphics()
      .moveTo(-6, -2.2)
      .quadraticCurveTo(-2.6, -5, 0, 0)
      .quadraticCurveTo(2.6, -5, 6, -2.2)
      .stroke({ width: 1.8, color, alpha, cap: 'round' });

  // Fish leaping clear of the water: an arc, then rings where it went back in.
  type Leap = { fish: Graphics; ring: Graphics; x: number; y: number; dir: number; age: number };
  const leaps: Leap[] = [];
  let nextLeap = 2;

  let time = 0;
  return {
    layer,
    /** A puff of brown building dust at world point (x, y): construction and demolition. */
    dust(x: number, y: number) {
      if (puffs.length >= MAX_PUFFS) return;
      const s = new Sprite({ texture: puffTex, anchor: 0.5, tint: 0xc8b08a });
      s.position.set(x, y);
      layer.addChild(s);
      const life = 0.9 + Math.random() * 0.8;
      puffs.push({
        s,
        age: 0,
        life,
        vx: (Math.random() - 0.5) * 30,
        vy: 6 + Math.random() * 8,
        size: 0.4 + Math.random() * 0.3,
        alpha: 0.7,
      });
    },
    setChimneys(points: { x: number; y: number }[]) {
      chimneys = points.map((p) => ({ ...p, next: Math.random() }));
    },
    update(dt: number, view: Rectangle, far: boolean) {
      time += dt;
      layer.visible = !far;
      if (far) return;
      const inView = (x: number, y: number, m = 200) =>
        x > view.x - m && x < view.x + view.width + m && y > view.y - m && y < view.y + view.height + m;

      for (const c of chimneys) {
        c.next -= dt;
        if (c.next > 0 || !inView(c.x, c.y) || puffs.length >= MAX_PUFFS) continue;
        c.next = 0.35 + Math.random() * 0.3;
        const s = new Sprite(puffTex);
        s.anchor.set(0.5);
        s.position.set(c.x, c.y);
        layer.addChild(s);
        puffs.push({
          s,
          age: 0,
          life: 2.6 + Math.random(),
          vx: 6 + Math.random() * 6,
          vy: 14,
          size: 0.35,
          alpha: 0.55,
        });
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          p.s.destroy();
          puffs.splice(i, 1);
          continue;
        }
        p.s.x += p.vx * dt;
        p.s.y -= p.vy * dt;
        p.s.scale.set(0.12 + k * p.size);
        p.s.alpha = p.alpha * Math.min(1, k * 5) * (1 - k);
      }

      for (const f of falls) {
        f.next -= dt;
        if (f.next > 0 || !inView(f.x, f.y) || puffs.length >= MAX_PUFFS) continue;
        f.next = 0.2;
        const s = new Sprite({ texture: puffTex, anchor: 0.5, alpha: 0 });
        s.position.set(f.x + (Math.random() - 0.5) * 18, f.y + (Math.random() - 0.5) * 6);
        layer.addChild(s);
        puffs.push({ s, age: 0, life: 1.6, vx: (Math.random() - 0.5) * 10, vy: 9, size: 0.35, alpha: 0.35 });
      }

      nextFlock -= dt;
      if (!flock && nextFlock <= 0) {
        const fromLeft = Math.random() < 0.5;
        const n = 5 + Math.floor(Math.random() * 5);
        const birds = Array.from({ length: n }, (_, i) => {
          const side = i % 2 ? 1 : -1;
          const rank = Math.ceil(i / 2);
          const b = { body: bird(0x2a2a32, 0.9), shadow: bird(0x000000, 0.15), phase: Math.random() * 6 };
          layer.addChild(b.shadow, b.body);
          return { ...b, dx: -rank * 13 + Math.random() * 4, dy: side * rank * 8 + Math.random() * 4 };
        });
        flock = {
          x: fromLeft ? view.x - 60 : view.x + view.width + 60,
          y: view.y + view.height * (0.15 + Math.random() * 0.5),
          vx: (fromLeft ? 1 : -1) * (55 + Math.random() * 25),
          vy: (Math.random() - 0.3) * 18,
          birds,
        };
        if (!fromLeft) for (const b of birds) b.dx = -b.dx;
      }
      if (flock) {
        const f = flock;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        for (const b of f.birds) {
          const flap = 0.5 + 0.5 * Math.sin(time * 11 + b.phase);
          b.body.position.set(f.x + b.dx, f.y + b.dy);
          b.body.scale.set(1, 0.4 + flap * 0.8);
          b.shadow.position.set(f.x + b.dx + 40, f.y + b.dy + 140);
          b.shadow.scale.set(1, 0.4 + flap * 0.6);
        }
        if (!inView(f.x, f.y, 400)) {
          for (const b of f.birds) {
            b.body.destroy();
            b.shadow.destroy();
          }
          flock = null;
          nextFlock = 20 + Math.random() * 25;
        }
      }

      nextLeap -= dt;
      if (nextLeap <= 0) {
        nextLeap = 1.2 + Math.random() * 2.5;
        const x = view.x + Math.random() * view.width;
        const y = view.y + Math.random() * view.height;
        const t = screenToGround(x, y);
        const wet = (u: number, v: number) => ['water', 'river'].includes(terrainAt(map, u, v) ?? 'water');
        const around = [wet(t.x + 1, t.y), wet(t.x, t.y + 1), wet(t.x - 1, t.y), wet(t.x, t.y - 1)].filter(Boolean);
        if (wet(t.x, t.y) && around.length >= 3) {
          const fish = new Graphics().ellipse(0, 0, 3.2, 1.2).fill(0x8a9aa8).circle(-3.4, 0, 0.9).fill(0x6a7a88);
          const ring = new Graphics();
          layer.addChild(ring, fish);
          leaps.push({ fish, ring, x, y, dir: Math.random() < 0.5 ? -1 : 1, age: 0 });
        }
      }
      for (let i = leaps.length - 1; i >= 0; i--) {
        const l = leaps[i];
        l.age += dt;
        // 0.6 s in the air, then rings spreading for a second.
        const k = Math.min(1, l.age / 0.6);
        l.fish.visible = k < 1;
        l.fish.position.set(l.x + l.dir * k * 14, l.y - Math.sin(k * Math.PI) * 12);
        l.fish.rotation = l.dir * (k - 0.5) * 2;
        l.fish.scale.x = l.dir;
        const r = l.age - 0.55;
        l.ring.clear();
        for (const [x, d] of [
          [l.x, l.age],
          [l.x + l.dir * 14, r],
        ])
          if (d > 0 && d < 1.2)
            l.ring
              .ellipse(x, l.y, 2 + d * 10, 1 + d * 4)
              .stroke({ width: 1, color: 0xe8f2f2, alpha: 0.7 * (1 - d / 1.2) });
        if (l.age > 1.8) {
          l.fish.destroy();
          l.ring.destroy();
          leaps.splice(i, 1);
        }
      }

      for (const g of gulls) {
        const a = g.phase + time * g.speed;
        const x = g.cx + Math.cos(a) * g.rad;
        const y = g.cy + Math.sin(a) * g.rad * 0.5 - 90;
        g.body.visible = g.shadow.visible = inView(x, y);
        if (!g.body.visible) continue;
        const flap = 0.55 + 0.45 * Math.sin(time * 9 + g.phase * 3);
        g.body.position.set(x, y);
        g.body.scale.set(Math.sign(-Math.sin(a) * g.speed) || 1, flap);
        g.shadow.position.set(x + 30, y + 110);
        g.shadow.scale.set(g.body.scale.x, flap * 0.8);
      }
    },
  };
}

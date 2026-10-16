import { Container, Graphics, type Rectangle, Sprite, Texture } from 'pixi.js';
import type { GameMap } from '../sim/map';
import { terrainAt } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { tileToScreen } from './iso';

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

/** Chimney smoke and seagulls. Work is skipped for anything outside `view`. */
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

  // Waterfalls where rivers leave the highlands: a rock step, falling water, foam and spray.
  const falls = (map.waterfalls ?? []).map((f) => {
    const edge = tileToScreen(f.x + 0.5 - f.dx * 0.5, f.y + 0.5 - f.dy * 0.5);
    const rock = new Graphics();
    rock
      .poly([edge.x - 16, edge.y + 2, edge.x - 13, edge.y - 18, edge.x + 13, edge.y - 18, edge.x + 16, edge.y + 2])
      .fill(0x6a645a);
    rock
      .poly([edge.x - 16, edge.y + 2, edge.x - 13, edge.y - 18, edge.x - 9, edge.y - 18, edge.x - 11, edge.y + 2])
      .fill(0x8a8478);
    rock
      .poly([edge.x + 11, edge.y + 2, edge.x + 9, edge.y - 18, edge.x + 13, edge.y - 18, edge.x + 16, edge.y + 2])
      .fill(0x4e4a42);
    const water = new Graphics();
    layer.addChild(rock, water);
    return { x: edge.x, y: edge.y, water, rock, next: 0 };
  });

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
        f.water.visible = f.rock.visible = inView(f.x, f.y);
        if (!f.water.visible) continue;
        // Sheet of water with bright streaks sliding down it, and a pulsing pool of foam below.
        f.water.clear();
        f.water.rect(f.x - 9, f.y - 19, 18, 20).fill({ color: 0x8ccad0, alpha: 0.9 });
        for (let k = 0; k < 6; k++) {
          const lx = f.x - 8 + k * 3.2;
          for (let s = 0; s < 3; s++) {
            const sy = f.y - 19 + ((time * 34 + k * 5.3 + s * 7) % 21);
            f.water.moveTo(lx, sy).lineTo(lx, Math.min(f.y, sy + 4));
          }
        }
        f.water.stroke({ width: 1, color: 0xffffff, alpha: 0.75 });
        const pulse = 1 + 0.12 * Math.sin(time * 6);
        f.water.ellipse(f.x, f.y + 1, 14 * pulse, 4.5 * pulse).fill({ color: 0xf2fafa, alpha: 0.85 });
        f.water.ellipse(f.x, f.y + 3, 20, 6).fill({ color: 0xe8f6f6, alpha: 0.3 });
        f.next -= dt;
        if (f.next <= 0 && puffs.length < MAX_PUFFS) {
          f.next = 0.25;
          const s = new Sprite({ texture: puffTex, anchor: 0.5, alpha: 0 });
          s.position.set(f.x + (Math.random() - 0.5) * 16, f.y);
          layer.addChild(s);
          puffs.push({ s, age: 0, life: 1.4, vx: (Math.random() - 0.5) * 10, vy: 10, size: 0.3, alpha: 0.4 });
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

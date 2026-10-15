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

  let time = 0;
  return {
    layer,
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
        puffs.push({ s, age: 0, life: 2.6 + Math.random(), vx: 6 + Math.random() * 6 });
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
        p.s.y -= 14 * dt;
        p.s.scale.set(0.12 + k * 0.35);
        p.s.alpha = 0.55 * Math.min(1, k * 5) * (1 - k);
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

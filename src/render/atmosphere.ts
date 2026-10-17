import { Container, Graphics, type Rectangle, Texture, TilingSprite } from 'pixi.js';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'fog';
/** How much of each the sky holds right now, 0..1, eased towards the current weather. */
export interface Sky {
  cloud: number;
  rain: number;
  fog: number;
}

const TARGETS: Record<Weather, Sky> = {
  clear: { cloud: 0.15, rain: 0, fog: 0 },
  cloudy: { cloud: 0.75, rain: 0, fog: 0 },
  rain: { cloud: 1, rain: 1, fog: 0.2 },
  fog: { cloud: 0.4, rain: 0, fog: 1 },
};
const NEXT: [Weather, number][] = [
  ['clear', 0.4],
  ['cloudy', 0.3],
  ['rain', 0.15],
  ['fog', 0.15],
];
/** Wind across the world, px/s: clouds drift and rain slants with it. */
const WIND = { x: 14, y: 5 };

const canvasTexture = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(canvas.getContext('2d')!);
  return Texture.from(canvas);
};

/** Soft cloud shadows on a tileable 512² canvas: each blob drawn again across the wrap. */
const cloudTexture = () =>
  canvasTexture(512, 512, (c) => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      const [x, y, r] = [rnd() * 512, rnd() * 512, 40 + rnd() * 90];
      for (const ox of [-512, 0, 512])
        for (const oy of [-512, 0, 512]) {
          const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, 'rgba(10,20,35,0.75)');
          g.addColorStop(1, 'rgba(10,20,35,0)');
          c.fillStyle = g;
          c.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
        }
    }
  });

/** Weather: cloud shadows over the world (`world`, in the world container) and rain (`screen`, over the scene). */
export function createAtmosphere(fixed?: Weather) {
  const shadows = new TilingSprite({ texture: cloudTexture(), width: 1, height: 1, eventMode: 'none' });
  shadows.tileScale.set(2);
  const world = new Container({ children: [shadows], eventMode: 'none' });

  const rain = new Graphics({ eventMode: 'none' });
  const screen = new Container({ children: [rain], eventMode: 'none' });

  const drops = Array.from({ length: 400 }, () => ({
    x: Math.random(),
    y: Math.random(),
    v: 0.8 + Math.random() * 0.4,
  }));
  let weather: Weather = fixed ?? 'clear';
  let next = 60 + Math.random() * 90;
  const sky: Sky = { ...TARGETS[weather] };
  let time = 0;

  return {
    world,
    screen,
    sky,
    update(dt: number, view: Rectangle, size: { width: number; height: number }, sun: number, changing: boolean) {
      time += dt;
      // Weather changes every one to three minutes; the sky eases into it over ~20 s.
      if (!fixed && changing && (next -= dt) <= 0) {
        next = 60 + Math.random() * 120;
        let pick = Math.random();
        weather = NEXT.find(([, w]) => (pick -= w) < 0)?.[0] ?? 'clear';
      }
      const target = changing || fixed ? TARGETS[weather] : TARGETS.clear;
      for (const k of ['cloud', 'rain', 'fog'] as const) sky[k] += (target[k] - sky[k]) * Math.min(1, dt / 6);

      // Cloud shadows stay put on the ground and drift with the wind.
      shadows.position.set(view.x, view.y);
      shadows.setSize(view.width, view.height);
      shadows.tilePosition.set(-view.x + time * WIND.x, -view.y + time * WIND.y);
      shadows.alpha = (0.25 + sky.cloud * 0.55) * (0.3 + 0.7 * sun);

      const { width, height } = size;
      // Rain: slanting streaks, as many as the shower is heavy.
      rain.clear();
      const n = Math.round(drops.length * sky.rain);
      if (n > 0) {
        // Two depths: far drops short, faint and slow, near ones long, bright and fast.
        for (const near of [false, true]) {
          for (let i = 0; i < n; i++) {
            const d = drops[i];
            if (d.v > 1 !== near) continue;
            d.y += dt * d.v * 1.3;
            d.x += dt * d.v * 0.25;
            if (d.y > 1) [d.y, d.x] = [0, Math.random()];
            d.x %= 1;
            const [x, y] = [d.x * width, d.y * height];
            const len = near ? 22 : 11;
            rain.moveTo(x, y).lineTo(x - len * 0.25, y - len);
          }
          rain.stroke({ width: near ? 1.2 : 0.8, color: 0xc8d8e8, alpha: (near ? 0.4 : 0.22) * sky.rain });
        }
      }
    },
  };
}

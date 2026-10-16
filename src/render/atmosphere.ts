import { Container, Graphics, type Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';

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

/** Distance haze at the top of the screen, fading out towards the middle. */
const hazeTexture = () =>
  canvasTexture(4, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(185,208,232,0.55)');
    g.addColorStop(0.55, 'rgba(185,208,232,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  });
/** Warmth rising from the bottom of the screen (added light). */
const warmTexture = () =>
  canvasTexture(4, 256, (c) => {
    const g = c.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, 'rgba(255,170,90,0.22)');
    g.addColorStop(0.5, 'rgba(255,170,90,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  });
/** Shafts of sunlight slanting down from the upper left. */
const raysTexture = () =>
  canvasTexture(512, 512, (c) => {
    // Blurred: hard-edged beams read as stripes painted across the screen.
    c.filter = 'blur(18px)';
    c.translate(-40, -60);
    c.rotate(-0.55);
    for (const [x, w, a] of [
      [60, 30, 0.35],
      [130, 55, 0.25],
      [230, 22, 0.4],
      [300, 70, 0.2],
      [420, 35, 0.3],
    ]) {
      const g = c.createLinearGradient(0, 0, 0, 760);
      g.addColorStop(0, `rgba(255,240,200,${a})`);
      g.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = g;
      c.fillRect(x, 0, w, 760);
    }
    // Fade out away from the sunny corner, so no beam is cut off at the texture's edge.
    c.resetTransform();
    c.filter = 'none';
    c.globalCompositeOperation = 'destination-in';
    const fade = c.createRadialGradient(0, 0, 0, 0, 0, 500);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fade;
    c.fillRect(0, 0, 512, 512);
  });
const moteTexture = () =>
  canvasTexture(16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,248,220,1)');
    g.addColorStop(1, 'rgba(255,248,220,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 16);
  });

/**
 * Weather and air: cloud shadows over the world, rain, distance haze and warmth, sunbeams and
 * floating dust. `world` goes in the world container (cloud shadows), `screen` over the scene.
 */
export function createAtmosphere(fixed?: Weather) {
  const shadows = new TilingSprite({ texture: cloudTexture(), width: 1, height: 1, eventMode: 'none' });
  shadows.tileScale.set(2);
  const world = new Container({ children: [shadows], eventMode: 'none' });

  const haze = new Sprite({ texture: hazeTexture(), eventMode: 'none' });
  const warm = new Sprite({ texture: warmTexture(), eventMode: 'none', blendMode: 'add' });
  const rays = new Sprite({ texture: raysTexture(), eventMode: 'none', blendMode: 'add' });
  const rain = new Graphics({ eventMode: 'none' });
  const moteTex = moteTexture();
  const motes = Array.from({ length: 70 }, () => {
    const s = new Sprite({ texture: moteTex, anchor: 0.5, blendMode: 'add', eventMode: 'none' });
    return { s, x: Math.random(), y: Math.random(), phase: Math.random() * 10, speed: 0.004 + Math.random() * 0.01 };
  });
  const moteLayer = new Container({ children: motes.map((m) => m.s), eventMode: 'none' });
  const screen = new Container({ children: [haze, warm, rays, moteLayer, rain], eventMode: 'none' });

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
    /** Tinted with the light of the hour, so the haze darkens at night. */
    haze,
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
      haze.setSize(width, height * 0.9);
      haze.alpha = Math.min(1, 0.45 + sky.fog * 0.9 + sky.rain * 0.3);
      warm.setSize(width, height);
      warm.y = 0;
      warm.alpha = sun * (1 - sky.cloud * 0.6);
      rays.setSize(width * 0.9, height * 0.9);
      // Strongest through broken cloud; faint on a clear day, gone in rain.
      rays.alpha =
        sun * (0.1 + 0.9 * sky.cloud * (1 - sky.cloud)) * (1 - sky.rain) * (0.75 + 0.25 * Math.sin(time * 0.4));
      rays.visible = rays.alpha > 0.01;

      // Dust motes catching the light, drifting with the wind, mostly on the sunny side.
      moteLayer.visible = sun > 0.1 && sky.rain < 0.5;
      if (moteLayer.visible)
        for (const m of motes) {
          m.x = (m.x + m.speed * dt * 0.6) % 1;
          m.y = (m.y + Math.sin(time * 0.3 + m.phase) * 0.0006) % 1;
          m.s.position.set(m.x * width * 0.7, m.y * height * 0.7);
          m.s.scale.set(0.12 + 0.08 * Math.sin(m.phase * 3));
          m.s.alpha =
            sun * (1 - sky.rain) * (0.3 + 0.7 * Math.max(0, Math.sin(time * 1.7 + m.phase * 5))) * (1 - m.x * m.y);
        }

      // Rain: slanting streaks, as many as the shower is heavy.
      rain.clear();
      const n = Math.round(drops.length * sky.rain);
      if (n > 0) {
        for (let i = 0; i < n; i++) {
          const d = drops[i];
          d.y += dt * d.v * 1.3;
          d.x += dt * d.v * 0.25;
          if (d.y > 1) [d.y, d.x] = [0, Math.random()];
          d.x %= 1;
          const [x, y] = [d.x * width, d.y * height];
          rain.moveTo(x, y).lineTo(x - 4, y - 16);
        }
        rain.stroke({ width: 1, color: 0xc8d8e8, alpha: 0.35 * sky.rain });
      }
    },
  };
}

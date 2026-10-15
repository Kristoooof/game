import { Sprite, Texture } from 'pixi.js';
import { mulberry32 } from '../sim/rng';

/** Textures are painted at 2× so they stay crisp when zoomed in. */
const S = 2;

export interface Art {
  texture: Texture;
  ax: number;
  ay: number;
}

type Ctx = CanvasRenderingContext2D;

/** Paint a w×h world-pixel texture whose anchor (origin in the world) is at (ax, ay). */
function paint(w: number, h: number, ax: number, ay: number, draw: (c: Ctx) => void): Art {
  const canvas = document.createElement('canvas');
  canvas.width = w * S;
  canvas.height = h * S;
  const c = canvas.getContext('2d')!;
  c.scale(S, S);
  draw(c);
  return { texture: Texture.from(canvas), ax: ax / w, ay: ay / h };
}

export function sprite(art: Art, x: number, y: number, scale = 1) {
  const s = new Sprite(art.texture);
  s.anchor.set(art.ax, art.ay);
  s.scale.set(scale / S);
  s.position.set(x, y);
  return s;
}

const poly = (c: Ctx, color: string, ...pts: number[][]) => {
  c.fillStyle = color;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
};

const ellipse = (c: Ctx, color: string, x: number, y: number, rx: number, ry: number) => {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
};

/** Ground tile: a 64×32 diamond (1px overdraw against seams) with speckles, tufts or flowers. */
function ground(seed: number, base: string, specks: [string, number, number][], tufts = '', flowers = 0) {
  const r = mulberry32(seed);
  const at = () => {
    const u = r();
    const v = r();
    return [33 + (u - v) * 32, 1 + (u + v) * 16];
  };
  return paint(66, 34, 33, 1, (c) => {
    poly(c, base, [33, 0], [66, 17], [33, 34], [0, 17]);
    c.clip();
    for (const [color, n, size] of specks) {
      c.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const [x, y] = at();
        c.fillRect(x, y, size, size * 0.6);
      }
    }
    if (tufts) {
      c.strokeStyle = tufts;
      c.lineWidth = 0.7;
      for (let i = 0; i < 10; i++) {
        const [x, y] = at();
        c.beginPath();
        c.moveTo(x - 1.4, y - 2);
        c.lineTo(x, y);
        c.lineTo(x + 1.2, y - 2.4);
        c.stroke();
      }
    }
    for (let i = 0; i < flowers; i++) {
      const [x, y] = at();
      ellipse(c, ['#fff6d5', '#f7d34a', '#e88fb4', '#b9a8f0'][i % 4], x, y, 0.9, 0.7);
    }
  });
}

const GRASS_SPECKS: [string, number, number][] = [
  ['rgba(70,110,40,0.35)', 40, 1.6],
  ['rgba(170,210,110,0.35)', 30, 1.4],
];

const conifer = (dark: string, light: string, tiers: number) =>
  paint(30, 52, 15, 47, (c) => {
    ellipse(c, 'rgba(0,0,0,0.22)', 19, 47, 10, 3.5);
    c.fillStyle = '#5d4027';
    c.fillRect(13.8, 38, 2.6, 10);
    for (let i = 0; i < tiers; i++) {
      const by = 42 - i * 8.5;
      const hw = 12.5 - i * 2.8;
      const ty = by - 15;
      poly(c, light, [15, ty], [15 - hw, by], [15, by - 1.5]);
      poly(c, dark, [15, ty], [15, by - 1.5], [15 + hw, by]);
    }
  });

const broadleaf = (dark: string, light: string, seed: number) => {
  const r = mulberry32(seed);
  return paint(38, 48, 19, 43, (c) => {
    ellipse(c, 'rgba(0,0,0,0.22)', 23, 43, 12, 4);
    c.fillStyle = '#6b4a2b';
    c.fillRect(17.6, 26, 2.8, 17);
    const blobs = [
      [19, 15, 10],
      [11, 22, 8],
      [27, 22, 8],
      [19, 26, 8.5],
    ].map(([x, y, rad]) => [x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, rad]);
    for (const [x, y, rad] of blobs) ellipse(c, dark, x, y, rad, rad * 0.95);
    c.globalAlpha = 0.85;
    for (const [x, y, rad] of blobs) ellipse(c, light, x - rad * 0.3, y - rad * 0.3, rad * 0.6, rad * 0.55);
    c.globalAlpha = 1;
  });
};

const bush = paint(22, 16, 11, 12, (c) => {
  ellipse(c, 'rgba(0,0,0,0.2)', 13, 12, 9, 3);
  for (const [x, y, rad] of [
    [7, 9, 5],
    [14, 8, 5.5],
    [11, 5, 5],
  ])
    ellipse(c, '#3f7a34', x, y, rad, rad * 0.85);
  for (const [x, y] of [
    [6, 7],
    [12, 4],
  ])
    ellipse(c, '#6aa84f', x, y, 2.6, 2.2);
});

const mountain = (seed: number) => {
  const r = mulberry32(seed);
  const h = 38 + r() * 18;
  const px = 44 + r() * 10;
  return paint(100, 90, 50, 74, (c) => {
    ellipse(c, 'rgba(0,0,0,0.2)', 56, 74, 42, 12);
    const P = [px, 74 - h - 10];
    const P2 = [22 + r() * 8, 74 - h * 0.5 - 6];
    poly(c, '#b6ad9b', [4, 78], P2, [36, 80]);
    poly(c, '#857c6e', P2, [44, 78], [36, 80]);
    poly(c, '#aaa190', [10, 78], P, [px + 4, 82]);
    poly(c, '#736b5f', P, [94, 76], [px + 4, 82]);
    const sh = h * 0.33;
    poly(
      c,
      '#f4f6f8',
      P,
      [P[0] - sh * 0.6, P[1] + sh],
      [P[0] - sh * 0.25, P[1] + sh * 0.75],
      [P[0] + 1, P[1] + sh * 1.05],
    );
    poly(
      c,
      '#c9d1da',
      P,
      [P[0] + 1, P[1] + sh * 1.05],
      [P[0] + sh * 0.25, P[1] + sh * 0.8],
      [P[0] + sh * 0.5, P[1] + sh * 0.95],
    );
    c.strokeStyle = 'rgba(50,42,35,0.18)';
    c.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const x = 20 + r() * 60;
      c.beginPath();
      c.moveTo(x, 50 + r() * 15);
      c.lineTo(x + (r() - 0.5) * 8, 70 + r() * 6);
      c.stroke();
    }
  });
};

/** All terrain art, built once (needs a DOM canvas). */
export function makeArt() {
  return {
    grass: [1, 2, 3, 4].map((s) => ground(s, '#7cb04c', GRASS_SPECKS, 'rgba(60,100,35,0.6)', s === 4 ? 3 : 0)),
    forest: [5, 6].map((s) =>
      ground(s, '#5f8f3e', [
        ['rgba(40,70,25,0.45)', 50, 1.8],
        ['rgba(120,90,50,0.35)', 15, 1.5],
      ]),
    ),
    beach: [7, 8, 9].map((s) =>
      ground(s, '#e9d59d', [
        ['rgba(190,160,100,0.45)', 45, 1.3],
        ['rgba(255,245,215,0.6)', 30, 1.2],
      ]),
    ),
    rock: [10, 11].map((s) =>
      ground(s, '#9d937f', [
        ['rgba(70,62,52,0.45)', 40, 2],
        ['rgba(200,195,180,0.4)', 25, 1.6],
      ]),
    ),
    trees: [
      conifer('#255a30', '#357a3f', 4),
      conifer('#2a5e45', '#3d7f5c', 3),
      broadleaf('#3f7a2d', '#78b04a', 3),
      broadleaf('#5e7a26', '#a8b84a', 4),
    ],
    bush,
    mountains: [21, 22, 23].map(mountain),
    sea: paint(256, 128, 0, 0, (c) => {
      c.fillStyle = '#1d5e89';
      c.fillRect(0, 0, 256, 128);
      const r = mulberry32(31);
      c.lineWidth = 1.1;
      for (let i = 0; i < 46; i++) {
        const x = r() * 256;
        const y = r() * 128;
        const l = 8 + r() * 16;
        c.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255,0.08' : '10,40,70,0.18'})`;
        for (const dx of [-256, 0, 256])
          for (const dy of [-128, 0, 128]) {
            c.beginPath();
            c.moveTo(x + dx, y + dy);
            c.quadraticCurveTo(x + dx + l / 2, y + dy - 2.5, x + dx + l, y + dy);
            c.stroke();
          }
      }
    }),
    sparkle: paint(192, 96, 0, 0, (c) => {
      const r = mulberry32(41);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      for (let i = 0; i < 26; i++) c.fillRect(r() * 188, r() * 94, 3 + r() * 4, 0.8);
    }),
    halo: paint(256, 128, 128, 64, (c) => {
      c.scale(1, 0.5);
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(120,225,210,0.5)');
      g.addColorStop(0.55, 'rgba(80,190,200,0.2)');
      g.addColorStop(1, 'rgba(60,150,190,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    }),
    cloud: paint(256, 256, 128, 128, (c) => {
      const r = mulberry32(51);
      for (let i = 0; i < 6; i++) {
        const x = 70 + r() * 116;
        const y = 70 + r() * 116;
        const rad = 40 + r() * 50;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(10,20,45,0.12)');
        g.addColorStop(1, 'rgba(10,20,45,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 256, 256);
      }
    }),
  };
}

export type TerrainArt = ReturnType<typeof makeArt>;

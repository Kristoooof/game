import { Sprite, Texture } from 'pixi.js';
import { mulberry32 } from '../sim/rng';
import { fbm2, hexRGB, litConifer, litCrown, litField, mix, noise2, smooth } from './sculpt';

/** Textures are painted at 2× so they stay crisp when zoomed in. */
const S = 4;

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

/** Soft contact shadow, cast towards the lower right (the sun is upper left, as in buildings.ts). */
const shadow = (c: Ctx, x: number, y: number, rx: number, ry: number) => {
  const cx = x + rx * 0.3;
  for (const [k, alpha] of [
    [1, 0.07],
    [0.8, 0.09],
    [0.6, 0.12],
    [0.4, 0.14],
  ] as const) {
    c.fillStyle = `rgba(10,25,12,${alpha})`;
    c.beginPath();
    c.ellipse(cx, y, rx * k, ry * k, 0, 0, Math.PI * 2);
    c.fill();
  }
};

/** A ball of foliage: sunlit upper-left rim, a shaded crescent lower right, and leaf specks. */

const conifer = (seed: number, palette: string[], tiers: number) => {
  return paint(34, 60, 17, 55, (c) => {
    shadow(c, 22, 54, 14, 4.5);
    // Trunk with bark lines and a little root flare.
    c.fillStyle = '#4e3520';
    c.beginPath();
    c.moveTo(14.4, 56);
    c.lineTo(15.8, 44);
    c.lineTo(18.2, 44);
    c.lineTo(19.6, 56);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(140,100,60,0.5)';
    c.fillRect(15.9, 46, 0.6, 9);
    const layers = Array.from({ length: tiers }, (_, i) => {
      const by = 49 - i * (32 / tiers);
      return { by, ty: by - 17, hw: 14 - i * (10 / tiers) };
    });
    litConifer(c, S, layers, 17, palette, seed);
  });
};

const broadleaf = (seed: number, palette: string[], size = 1) => {
  const r = mulberry32(seed);
  return paint(44, 56, 22, 51, (c) => {
    shadow(c, 26, 50, 15, 5);
    // Trunk flaring into roots at the foot, bark streaks, and two boughs forking into the crown.
    const trunk = c.createLinearGradient(19, 0, 25, 0);
    trunk.addColorStop(0, '#8a6440');
    trunk.addColorStop(1, '#4e3520');
    c.fillStyle = trunk;
    c.beginPath();
    c.moveTo(17.5, 51.5);
    c.quadraticCurveTo(20, 49, 20.6, 44);
    c.lineTo(21, 30);
    c.lineTo(23, 30);
    c.lineTo(23.4, 44);
    c.quadraticCurveTo(24, 49, 26.5, 51.5);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(40,26,14,0.55)';
    c.lineWidth = 0.35;
    for (let k = 0; k < 5; k++) {
      const x = 21 + r() * 2;
      c.beginPath();
      c.moveTo(x, 50 - r() * 3);
      c.lineTo(x + (r() - 0.5) * 0.6, 34 + r() * 6);
      c.stroke();
    }
    c.strokeStyle = '#5e4028';
    c.lineCap = 'round';
    for (const [dx, h] of [
      [-7, 22],
      [6, 20],
    ]) {
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(22, 34);
      c.quadraticCurveTo(22 + dx * 0.3, 28, 22 + dx, h);
      c.stroke();
    }
    // Crown in three layers: dark balls at the back, mid, then lit ones in front; a few gaps
    // let the boughs show through.
    const balls: number[][] = [];
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 11.5 * size;
      balls.push([22 + Math.cos(a) * d, 21 + Math.sin(a) * d * 0.8, (3.8 + r() * 3.4) * size]);
    }
    // Depth for each ball: the crown is round towards the viewer too; a few left out are gaps.
    const crown = balls
      .filter((_, k) => k % 7 !== 3)
      .map(([x, y, rad]) => [x, y, rad, (1 - Math.hypot(x - 22, y - 21) / 14) * 9]);
    litCrown(c, S, crown, palette, seed);
  });
};
const bush = (seed: number, palette: string[]) => {
  const r = mulberry32(seed);
  // Some bushes bear berries or blossom.
  const fruit = ['#c0392b', '#f4f0e8', '#3a3a8a', ''][seed % 4];
  return paint(26, 20, 13, 16, (c) => {
    shadow(c, 15, 16, 10, 3.5);
    const base = c.createRadialGradient(13, 16, 1, 13, 16, 10);
    base.addColorStop(0, 'rgba(20,40,15,0.5)');
    base.addColorStop(1, 'rgba(20,40,15,0)');
    c.fillStyle = base;
    c.fillRect(2, 11, 22, 8);
    const balls = Array.from({ length: 9 }, () => [6 + r() * 14, 7 + r() * 7, 2.6 + r() * 2.2, r() * 3]);
    litCrown(c, S, balls, palette, seed);
    if (fruit)
      for (let k = 0; k < 9; k++) {
        c.fillStyle = fruit;
        c.beginPath();
        c.arc(6 + r() * 14, 6 + r() * 8, 0.55, 0, Math.PI * 2);
        c.fill();
      }
  });
};

const boulder = paint(20, 14, 10, 11, (c) => {
  shadow(c, 11, 11, 9, 3);
  const stone = [hexRGB('#7a7366'), hexRGB('#cfc8b9')];
  const moss = hexRGB('#6a8040');
  litField(c, S, {
    cx: 10,
    cy: 11,
    scale: 15,
    grid: 70,
    height: (u, v) => {
      const d = Math.hypot(u * 1.05, v * 1.2);
      return d >= 1 ? 0 : 8 * (1 - d * d) * (0.75 + 0.4 * fbm2(u * 2.2, v * 2.2, 31)) - 0.3;
    },
    color: ({ u, v, h, up, light, occl }) => {
      let base = mix(stone[0], stone[1], fbm2(u * 6, v * 6, 32));
      if (up > 0.85 && h > 4 && noise2(u * 4, v * 4, 33) > 0.5) base = mix(base, moss, 0.7);
      const lit = (0.48 + 0.75 * light) * (0.75 + 0.25 * occl);
      return [base[0] * lit, base[1] * lit, base[2] * lit];
    },
  });
});

/**
 * A peak with a lit west face and shaded east face, each split into facets, a lower
 * shoulder, crack lines and ledges, and (on high peaks only) snow with gullies.
 */
const mountain = (seed: number, snowy: boolean) => {
  const r = mulberry32(seed);
  const H = (snowy ? 56 : 30) + r() * 16;
  // Main peak and a lower shoulder beside it, slightly off centre.
  const [pu, pv] = [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3];
  const [su, sv] = [(r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.2), (r() - 0.5) * 0.6];
  const rockDark = hexRGB('#857a68');
  const rockLight = hexRGB('#cdbfa4');
  const grass = hexRGB('#6f8a44');
  const snow = hexRGB('#f2f5fa');
  return paint(120, 100, 60, 84, (c) => {
    shadow(c, 66, 84, 50, 12);
    litField(c, S, {
      cx: 60,
      cy: 84,
      scale: 54,
      grid: 220,
      height: (u, v) => {
        const d = Math.hypot(u, v);
        if (d >= 1) return 0;
        const peak = Math.max(0, 1 - Math.hypot(u - pu, v - pv) * 1.2);
        const shoulder = Math.max(0, 1 - Math.hypot(u - su, v - sv) * 1.8) * 0.6;
        // Ridged noise: sharp crests and gullies running down the faces.
        const ridge = 1 - Math.abs(fbm2(u * 3.2, v * 3.2, seed) * 2 - 1);
        // Domed rather than conical: broad shoulders, the crest broken up by ridges.
        const body = Math.max(peak ** 1.05 * (1.15 - 0.15 * peak), shoulder ** 1.1);
        return H * body * (0.7 + 0.42 * ridge) * smooth(0, 0.3, 1 - d) - 0.5;
      },
      color: ({ u, v, h, up, light, occl }) => {
        let base = mix(rockDark, rockLight, fbm2(u * 7, v * 7, seed + 4));
        if (h < H * 0.16 && up > 0.72) base = mix(base, grass, smooth(0.72, 0.9, up) * 0.85);
        const line = H * (0.58 + 0.14 * noise2(u * 5, v * 5, seed + 9));
        const snowy_ = snowy && h > line && up > 0.25;
        if (snowy_) base = snow;
        const lit = (0.5 + 0.75 * light) * (0.75 + 0.25 * occl);
        // Shadowed faces lean blue, lit ones warm.
        return [
          Math.min(255, base[0] * lit * (light > 0.4 ? 1.04 : 0.92)),
          Math.min(255, base[1] * lit),
          Math.min(255, base[2] * lit * (light > 0.4 ? 0.96 : 1.1)),
        ];
      },
    });
  });
};

/** Palm: a leaning trunk with rings and a crown of arched fronds, lit from the upper left. */
const palm = (seed: number) => {
  const r = mulberry32(seed);
  const lean = (r() - 0.5) * 6;
  return paint(60, 70, 30, 66, (c) => {
    shadow(c, 34, 66, 16, 4.5);
    const top = [30 + lean * 2, 26];
    c.strokeStyle = '#8a6a42';
    c.lineWidth = 3.4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(27, 66);
    c.quadraticCurveTo(26 + lean, 44, top[0], top[1]);
    c.stroke();
    c.strokeStyle = 'rgba(60,40,20,0.45)';
    c.lineWidth = 0.7;
    for (let k = 0; k < 6; k++) {
      const t = 0.2 + k * 0.12;
      const y = 66 - t * 40;
      c.beginPath();
      c.moveTo(26 + lean * t * t + 1, y);
      c.lineTo(28.5 + lean * t * t, y - 1.2);
      c.stroke();
    }
    // Fronds: each a dark arch with a lighter rib on top.
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.5 + (r() - 0.5) * 0.2;
      const len = 19 + r() * 6;
      const tip = [top[0] + Math.cos(a) * len, top[1] + Math.sin(a) * len * 0.55 + 6];
      const ctrl = [top[0] + Math.cos(a) * len * 0.5, top[1] + Math.sin(a) * len * 0.5 - 6];
      c.lineCap = 'round';
      c.strokeStyle = k % 2 ? '#2f6a2a' : '#3f7d34';
      c.lineWidth = 5.5;
      c.beginPath();
      c.moveTo(top[0], top[1]);
      c.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]);
      c.stroke();
      c.strokeStyle = '#7fb85a';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(top[0], top[1] - 0.8);
      c.quadraticCurveTo(ctrl[0], ctrl[1] - 1, tip[0], tip[1] - 1);
      c.stroke();
    }
    c.fillStyle = '#6a4a24';
    c.beginPath();
    c.arc(top[0] - 1.5, top[1] + 2.5, 1.8, 0, Math.PI * 2);
    c.arc(top[0] + 1.5, top[1] + 3, 1.8, 0, Math.PI * 2);
    c.fill();
  });
};

/** Driftwood: a sun-bleached log with a pale cut end. */
const driftwood = (seed: number) => {
  const r = mulberry32(seed);
  const tilt = (r() - 0.5) * 3;
  return paint(26, 14, 13, 11, (c) => {
    shadow(c, 13, 11, 11, 3);
    const g = c.createLinearGradient(0, 4, 0, 11);
    g.addColorStop(0, '#c8b08a');
    g.addColorStop(1, '#7a6246');
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(3, 6, 19, 5, 2.5);
    c.fill();
    c.fillStyle = '#e8d8b8';
    c.beginPath();
    c.ellipse(21.5 + tilt * 0.2, 8.5, 1.8, 2.4, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(70,50,30,0.5)';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(6, 8.5);
    c.lineTo(17, 9);
    c.stroke();
  });
};

/** A few beach pebbles, lit on top. */
const pebbles = (seed: number) => {
  const r = mulberry32(seed);
  return paint(18, 12, 9, 8, (c) => {
    shadow(c, 9, 9.5, 7, 2);
    for (let i = 0; i < 4; i++) {
      const x = 4 + r() * 10;
      const y = 6 + r() * 3;
      const rad = 1.4 + r() * 1.2;
      const g = c.createRadialGradient(x - rad * 0.4, y - rad * 0.4, 0, x, y, rad);
      g.addColorStop(0, '#e6e0d2');
      g.addColorStop(1, '#7d766a');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, rad * 1.2, rad, 0, 0, Math.PI * 2);
      c.fill();
    }
  });
};

const DARK_GREEN = ['#1f4a24', '#2f6a33', '#5f9a4a'];
const LEAF_GREEN = ['#2f5e1f', '#4f8a2e', '#9cc65a'];
const OLIVE = ['#4a5a1c', '#7a8a2a', '#c4c45a'];
const AUTUMN = ['#6a4a1a', '#a8742a', '#e0b048'];

/** Rock standing in the sea: lit and shaded faces, a dark wet band with weed at the waterline. */
/** Rock standing in the sea: lit stone, a dark wet band with weed at the waterline, gull marks on tall ones. */
const seaRock = (seed: number, tall: boolean) => {
  const r = mulberry32(seed);
  const H = tall ? 34 + r() * 12 : 15 + r() * 8;
  const stone = [hexRGB('#4e4a42'), hexRGB('#a8a092')];
  const wet = hexRGB('#2e3a2c');
  const guano = hexRGB('#ece8dc');
  return paint(64, 60, 32, 50, (c) => {
    litField(c, S, {
      cx: 32,
      cy: 50,
      scale: 44,
      grid: 140,
      height: (u, v) => {
        const d = Math.hypot(u, v * 1.1);
        if (d >= 1) return 0;
        const ridge = 1 - Math.abs(fbm2(u * 2.6, v * 2.6, seed) * 2 - 1);
        const shape = tall ? (1 - d) ** 0.7 : (1 - d * d) * 0.9;
        return H * shape * (0.7 + 0.45 * ridge) - 0.5;
      },
      color: ({ u, v, h, up, light, occl }) => {
        let base = mix(stone[0], stone[1], fbm2(u * 6, v * 6, seed + 1));
        base = mix(base, wet, smooth(4, 1, h));
        if (tall && h > H * 0.75 && up > 0.6 && noise2(u * 9, v * 9, seed + 2) > 0.55) base = guano;
        const lit = (0.48 + 0.75 * light) * (0.75 + 0.25 * occl);
        return [base[0] * lit, base[1] * lit, base[2] * lit];
      },
    });
    // Foam lip where the sea meets the rock.
    c.strokeStyle = 'rgba(236,246,246,0.75)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(32, 49.5, 23, 3.2, 0, 0, Math.PI);
    c.stroke();
  });
};

/** All object art, built once (needs a DOM canvas). */
export function makeArt() {
  return {
    conifers: [
      conifer(1, ['#163c22', '#245a32', '#3f7d48'], 4),
      conifer(2, ['#1b4232', '#2a634a', '#4a8a66'], 5),
      conifer(3, ['#1d3f1f', '#2e5f2c', '#55864a'], 3),
    ],
    broadleaves: [
      broadleaf(4, LEAF_GREEN),
      broadleaf(5, DARK_GREEN, 1.1),
      broadleaf(6, OLIVE, 0.9),
      broadleaf(7, AUTUMN),
    ],
    bushes: [bush(8, LEAF_GREEN), bush(9, DARK_GREEN)],
    palms: [palm(41), palm(42), palm(43)],
    driftwood: [driftwood(51), driftwood(52)],
    pebbles: [pebbles(61), pebbles(62)],
    boulder,
    /** Sea rocks: three low ones, then three tall stacks. */
    seaRocks: [71, 72, 73].map((k) => seaRock(k, false)).concat([74, 75, 76].map((k) => seaRock(k, true))),
    peaks: [21, 22, 23].map((k) => mountain(k, true)),
    hills: [24, 25, 26, 27].map((k) => mountain(k, false)),
  };
}

export type TerrainArt = ReturnType<typeof makeArt>;

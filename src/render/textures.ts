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

const poly = (c: Ctx, fill: string | CanvasGradient, pts: number[][]) => {
  c.fillStyle = fill;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
};

const shadow = (c: Ctx, x: number, y: number, rx: number, ry: number) => {
  const g = c.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, 'rgba(10,25,10,0.35)');
  g.addColorStop(1, 'rgba(10,25,10,0)');
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  c.translate(-x, -y);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
};

/** A ball of foliage lit from the upper left. */
const leafBall = (c: Ctx, x: number, y: number, r: number, [dark, mid, light]: string[]) => {
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};

const conifer = (seed: number, palette: string[], tiers: number) => {
  const r = mulberry32(seed);
  return paint(34, 60, 17, 55, (c) => {
    shadow(c, 22, 54, 14, 4.5);
    c.fillStyle = '#4e3520';
    c.fillRect(15.6, 44, 2.8, 12);
    for (let i = 0; i < tiers; i++) {
      const by = 49 - i * (32 / tiers);
      const hw = 14 - i * (10 / tiers);
      const ty = by - 17;
      // Jagged lower edge, lit left half, shaded right half.
      const edge: number[][] = [];
      for (let k = 0; k <= 6; k++) edge.push([17 - hw + (k * hw * 2) / 6, by - (k % 2) * (2 + r() * 1.5)]);
      const g = c.createLinearGradient(17 - hw, 0, 17 + hw, 0);
      g.addColorStop(0, palette[2]);
      g.addColorStop(0.45, palette[1]);
      g.addColorStop(1, palette[0]);
      poly(c, g, [[17, ty], ...edge.reverse()]);
      c.strokeStyle = 'rgba(0,20,0,0.25)';
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(17, ty + 1);
      c.lineTo(17 + hw * 0.15, by - 1);
      c.stroke();
    }
  });
};

const broadleaf = (seed: number, palette: string[], size = 1) => {
  const r = mulberry32(seed);
  return paint(44, 56, 22, 51, (c) => {
    shadow(c, 26, 50, 15, 5);
    const trunk = c.createLinearGradient(19, 0, 25, 0);
    trunk.addColorStop(0, '#8a6440');
    trunk.addColorStop(1, '#4e3520');
    c.fillStyle = trunk;
    c.beginPath();
    c.moveTo(19.5, 51);
    c.lineTo(20.8, 30);
    c.lineTo(23.2, 30);
    c.lineTo(24.5, 51);
    c.fill();
    const balls: number[][] = [];
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 11 * size;
      balls.push([22 + Math.cos(a) * d, 22 + Math.sin(a) * d * 0.8, (4.5 + r() * 3.5) * size]);
    }
    balls.sort((a, b) => a[1] - b[1]);
    for (const [x, y, rad] of balls) leafBall(c, x, y, rad, palette);
  });
};

const bush = (seed: number, palette: string[]) => {
  const r = mulberry32(seed);
  return paint(26, 20, 13, 16, (c) => {
    shadow(c, 15, 16, 10, 3.5);
    for (let i = 0; i < 6; i++) leafBall(c, 7 + r() * 12, 8 + r() * 5, 3.2 + r() * 2.2, palette);
  });
};

const boulder = paint(20, 14, 10, 11, (c) => {
  shadow(c, 11, 11, 9, 3);
  const g = c.createLinearGradient(3, 2, 16, 12);
  g.addColorStop(0, '#c9c3b6');
  g.addColorStop(1, '#6f685d');
  poly(c, g, [
    [3, 11],
    [5, 5],
    [10, 2.5],
    [15, 5],
    [17, 11],
  ]);
});

const mountain = (seed: number) => {
  const r = mulberry32(seed);
  const h = 46 + r() * 22;
  const px = 46 + r() * 10;
  return paint(110, 100, 55, 84, (c) => {
    shadow(c, 60, 84, 48, 13);
    const base = 86;
    const peak = [px, base - h];
    // Jagged silhouette from left foot over the peak to the right foot.
    const ridge = (x0: number, x1: number, y0: number, y1: number, n: number) =>
      Array.from({ length: n + 1 }, (_, k) => {
        const t = k / n;
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (k && k < n ? (r() - 0.5) * 6 : 0)];
      });
    const leftRidge = ridge(6, peak[0], base, peak[1], 5);
    const rightRidge = ridge(peak[0], 104, peak[1], base - 2, 5);
    const spine = [peak, [peak[0] + 6, base - h * 0.45], [peak[0] + 2, base + 2]];
    const lit = c.createLinearGradient(0, peak[1], 0, base);
    lit.addColorStop(0, '#c4bcab');
    lit.addColorStop(1, '#8f8676');
    const dark = c.createLinearGradient(0, peak[1], 0, base);
    dark.addColorStop(0, '#7d7568');
    dark.addColorStop(1, '#575047');
    poly(c, lit, [...leftRidge, ...spine.slice(1).reverse(), [6, base]]);
    poly(c, dark, [...rightRidge, [104, base], [peak[0] + 2, base + 2], spine[1], peak]);
    // Snow: a band hugging the peak with a ragged lower edge.
    const sh = h * 0.32;
    const snow = [peak];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      snow.push([peak[0] - sh * 0.9 + t * sh * 1.9, peak[1] + sh * (0.75 + (k % 2) * 0.35 + r() * 0.15)]);
    }
    poly(c, '#f5f7fa', snow.slice(0, 5).concat([[peak[0] + 3, peak[1] + sh * 0.6]]));
    poly(c, '#c3ccd8', [peak, [peak[0] + 3, peak[1] + sh * 0.6], ...snow.slice(4)]);
    c.strokeStyle = 'rgba(40,34,28,0.28)';
    c.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const x = 18 + r() * 74;
      const y = base - 6 - r() * h * 0.5;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.3) * 10, y + 8 + r() * 8);
      c.stroke();
    }
  });
};

const DARK_GREEN = ['#1f4a24', '#2f6a33', '#5f9a4a'];
const LEAF_GREEN = ['#2f5e1f', '#4f8a2e', '#9cc65a'];
const OLIVE = ['#4a5a1c', '#7a8a2a', '#c4c45a'];
const AUTUMN = ['#6a4a1a', '#a8742a', '#e0b048'];

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
    boulder,
    mountains: [21, 22, 23, 24].map(mountain),
  };
}

export type TerrainArt = ReturnType<typeof makeArt>;

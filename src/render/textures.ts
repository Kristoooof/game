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

/**
 * A peak with a lit west face and shaded east face, each split into facets, a lower
 * shoulder, crack lines and ledges, and (on high peaks only) snow with gullies.
 */
const mountain = (seed: number, snowy: boolean) => {
  const r = mulberry32(seed);
  const h = (snowy ? 52 : 34) + r() * 18;
  const px = 48 + r() * 12;
  return paint(120, 100, 60, 84, (c) => {
    shadow(c, 66, 84, 50, 12);
    const base = 86;
    const peak = [px, base - h];
    const jag = (x0: number, y0: number, x1: number, y1: number, n: number, amp: number) =>
      Array.from({ length: n + 1 }, (_, k) => {
        const t = k / n;
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (k && k < n ? (r() - 0.5) * amp : 0)];
      });
    const grad = (top: string, bottom: string) => {
      const g = c.createLinearGradient(0, peak[1], 0, base);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      return g;
    };
    // Shoulder peak behind and to the side.
    const sx = px + (r() < 0.5 ? -26 : 24);
    const sp = [sx, base - h * 0.55];
    poly(c, grad('#a99c86', '#7f7360'), [[sx - 30, base], sp, [sx + 4, base]]);
    poly(c, grad('#6f6555', '#4f483d'), [sp, [sx + 30, base], [sx + 4, base]]);
    // Main peak: west face in two facets, east face in two facets.
    const mid = [px + 4 + r() * 4, base - h * 0.42];
    const west = jag(8, base, peak[0], peak[1], 5, 7);
    const east = jag(peak[0], peak[1], 112, base, 5, 7);
    poly(c, grad('#c2b49b', '#8d7f69'), [...west, mid, [px - 6, base]]);
    poly(c, grad('#ab9d84', '#7b6e5a'), [peak, mid, [px - 6, base], [px + 10, base]]);
    poly(c, grad('#7b6f5d', '#544b3f'), [...east, [px + 10, base], mid]);
    poly(c, grad('#685d4e', '#463f35'), [peak, mid, [px + 10, base]]);
    // Cracks on the faces and pale ledges catching light.
    c.lineWidth = 0.7;
    for (let i = 0; i < 9; i++) {
      const x = 20 + r() * 84;
      const y = base - 4 - r() * h * 0.55;
      c.strokeStyle = 'rgba(40,32,24,0.35)';
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 6, y + 6 + r() * 8);
      c.stroke();
      c.strokeStyle = 'rgba(235,225,205,0.35)';
      c.beginPath();
      c.moveTo(x - 4, y - 2);
      c.lineTo(x + 3, y - 3.5);
      c.stroke();
    }
    if (snowy) {
      // Clip to the peak's silhouette so the snow can never hang over its outline.
      c.save();
      c.beginPath();
      [...west, ...east.slice(1)].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.clip();
      // Snow cap with a ragged lower edge and gullies running down the lit face.
      const sh = h * 0.3;
      const edge = Array.from({ length: 7 }, (_, k) => [
        peak[0] - sh * 0.95 + (k / 6) * sh * 2,
        peak[1] + sh * (0.7 + (k % 2) * 0.4 + r() * 0.2),
      ]);
      poly(c, '#f4f6f9', [peak, ...edge.slice(0, 4), [peak[0] + 2, peak[1] + sh * 0.7]]);
      poly(c, '#bcc6d3', [peak, [peak[0] + 2, peak[1] + sh * 0.7], ...edge.slice(3)]);
      c.strokeStyle = 'rgba(244,246,249,0.85)';
      c.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const [x, y] = edge[i];
        c.beginPath();
        c.moveTo(x, y - 1);
        c.lineTo(x - 2 - r() * 3, y + 5 + r() * 6);
        c.stroke();
      }
      c.restore();
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
    peaks: [21, 22, 23].map((k) => mountain(k, true)),
    hills: [24, 25, 26, 27].map((k) => mountain(k, false)),
  };
}

export type TerrainArt = ReturnType<typeof makeArt>;

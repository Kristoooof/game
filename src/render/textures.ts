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
const leafBall = (c: Ctx, x: number, y: number, r: number, [dark, mid, light]: string[], rnd = Math.random) => {
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  // Leaf clusters: lit specks on the sun side, dark gaps on the shadow side.
  for (let i = 0; i < Math.max(3, r * 1.6); i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.85;
    const lit = Math.cos(a - 3.9) > 0;
    c.fillStyle = lit ? light : dark;
    c.globalAlpha = lit ? 0.75 : 0.55;
    c.beginPath();
    c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.5 + rnd() * 0.5, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
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
      // Needle tips: short strokes outward from the lower edge, lit on the left.
      for (let k = 0; k < 14; k++) {
        const u = r();
        const x0 = 17 - hw + u * hw * 2;
        const y0 = by - 1 - (1 - Math.abs(u - 0.5) * 2) * 1.5;
        c.strokeStyle = u < 0.5 ? `${palette[2]}` : 'rgba(5,25,10,0.5)';
        c.globalAlpha = 0.6;
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x0 + (u - 0.5) * 2, y0 + 1.6);
        c.stroke();
      }
      c.globalAlpha = 1;
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
    for (const [x, y, rad] of balls) leafBall(c, x, y, rad, palette, r);
  });
};

const bush = (seed: number, palette: string[]) => {
  const r = mulberry32(seed);
  return paint(26, 20, 13, 16, (c) => {
    shadow(c, 15, 16, 10, 3.5);
    for (let i = 0; i < 6; i++) leafBall(c, 7 + r() * 12, 8 + r() * 5, 3.2 + r() * 2.2, palette, r);
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
const seaRock = (seed: number, tall: boolean) => {
  const r = mulberry32(seed);
  const h = tall ? 32 + r() * 14 : 17 + r() * 10;
  return paint(64, 60, 32, 50, (c) => {
    const base = 50;
    const n = 7;
    const top = Array.from({ length: n + 1 }, (_, k) => {
      const t = k / n;
      const env = Math.sin(Math.PI * t) ** (tall ? 0.6 : 1.2);
      return [10 + 44 * t + (k && k < n ? (r() - 0.5) * 3 : 0), base - h * env * (0.75 + r() * 0.35)];
    });
    const peak = top.reduce((m, p, i) => (p[1] < top[m][1] ? i : m), 0);
    const px = top[peak][0];
    const grad = (a: string, b: string) => {
      const g = c.createLinearGradient(0, base - h, 0, base);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      return g;
    };
    poly(c, grad('#bdb6a8', '#7d766a'), [[10, base], ...top.slice(0, peak + 1), [px + 2, base]]);
    poly(c, grad('#6e685d', '#3f3b35'), [[px + 2, base], ...top.slice(peak), [54, base]]);
    // Everything below is clipped to the rock's outline.
    c.save();
    c.beginPath();
    [[10, base], ...top, [54, base]].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.clip();
    c.lineWidth = 0.7;
    for (let i = 0; i < 6; i++) {
      const x = 14 + r() * 36;
      const y = base - 3 - r() * h * 0.7;
      c.strokeStyle = 'rgba(35,30,25,0.4)';
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 5, y + 4 + r() * 6);
      c.stroke();
    }
    c.fillStyle = 'rgba(38,50,36,0.8)';
    c.fillRect(0, base - 5, 64, 5);
    for (let i = 0; i < 14; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(60,82,46,0.8)' : 'rgba(28,36,28,0.8)';
      c.fillRect(10 + r() * 44, base - 6 - r() * 3, 1.5, 1.5);
    }
    // Pale specks on top of tall stacks, where the gulls sit.
    if (tall)
      for (let i = 0; i < 10; i++) {
        c.fillStyle = 'rgba(238,236,228,0.85)';
        c.fillRect(px - 8 + r() * 14, top[peak][1] + r() * 8, 1.2, 1.2);
      }
    c.restore();
    // Foam lip where the sea meets the rock.
    c.strokeStyle = 'rgba(236,246,246,0.75)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(32, base - 0.5, 23, 3.2, 0, 0, Math.PI);
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

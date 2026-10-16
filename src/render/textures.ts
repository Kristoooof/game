import { Sprite, Texture } from 'pixi.js';
import { mulberry32 } from '../sim/rng';
import { litCrown } from './sculpt';

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
    // Painted tiers, bottom first: each a skirt of drooping boughs with a scalloped hem, lit
    // from the left, the top of every lower tier in the shade of the one above.
    const r = mulberry32(seed);
    for (let i = 0; i < tiers; i++) {
      const by = 49 - i * (32 / tiers);
      const hw = 14 - i * (10 / tiers);
      const ty = by - 17;
      const cx = 17;
      const n = 4 + Math.round(hw / 4);
      c.beginPath();
      c.moveTo(cx, ty);
      // Left flank curving out, scalloped hem, right flank back to the tip.
      c.quadraticCurveTo(cx - hw * 0.35, ty + (by - ty) * 0.55, cx - hw, by - 1.5);
      for (let k = 0; k < n; k++) {
        const x0 = cx - hw + (k * 2 * hw) / n;
        const x1 = cx - hw + ((k + 1) * 2 * hw) / n;
        c.quadraticCurveTo((x0 + x1) / 2, by + 1.6 + r() * 1.2, x1, by - 1.2 - r() * 0.8);
      }
      c.quadraticCurveTo(cx + hw * 0.35, ty + (by - ty) * 0.55, cx, ty);
      c.closePath();
      const g = c.createLinearGradient(cx - hw, ty, cx + hw, by);
      g.addColorStop(0, palette[2]);
      g.addColorStop(0.45, palette[1]);
      g.addColorStop(1, palette[0]);
      c.fillStyle = g;
      c.fill();
      // Shade cast by the tier above onto the top of this one.
      if (i < tiers - 1) {
        c.save();
        c.clip();
        const sh = c.createLinearGradient(0, ty, 0, ty + (by - ty) * 0.6);
        sh.addColorStop(0, 'rgba(4,22,10,0.45)');
        sh.addColorStop(1, 'rgba(4,22,10,0)');
        c.fillStyle = sh;
        c.fillRect(cx - hw - 2, ty, hw * 2 + 4, by - ty);
        c.restore();
      }
    }
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
  // Some bushes bear berries.
  const fruit = ['#c0392b', '', '#3a3a8a', ''][seed % 4];
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

type P = [number, number];

/** Jagged line from a to b by midpoint displacement, `n` levels deep, each bend up to `amp` of the length. */
const jag = (r: () => number, a: P, b: P, n: number, amp: number): P[] => {
  if (n === 0) return [a, b];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const k = (r() - 0.5) * 2 * amp;
  const t = 0.35 + r() * 0.3;
  const m: P = [a[0] + dx * t - dy * k, a[1] + dy * t + dx * k];
  return [...jag(r, a, m, n - 1, amp * 0.6), ...jag(r, m, b, n - 1, amp * 0.6).slice(1)];
};

const trace = (c: Ctx, pts: P[]) => {
  c.beginPath();
  c.moveTo(...pts[0]);
  for (const q of pts.slice(1)) c.lineTo(...q);
  c.closePath();
};

interface Rock {
  /** Silhouette key points, left foot to right foot. */
  ridge: P[];
  /** The key point the spine between the lit and shaded face drops from. */
  peak: number;
  /** How far the foot sags in front, below the feet. */
  depth: number;
  lit: [string, string];
  shade: [string, string];
  /** Facets per face, subdivision levels and jaggedness of the edges. */
  facets: number;
  detail: number;
  amp: number;
  snow?: number;
  grass?: { color: string; height: number };
  wet?: number;
}

/**
 * A painted, faceted rock: a jagged silhouette split by a spine into a warm lit face (west)
 * and a cool shaded one (east), each cut into facets of slightly different tone along
 * gullies running down the slope. Flat 2D paint that still reads as a solid.
 */
const rock = (c: Ctx, r: () => number, o: Rock) => {
  const sil: P[] = [];
  let pk = 0;
  o.ridge.slice(1).forEach((q, i) => {
    if (i === o.peak) pk = sil.length - 1;
    sil.push(...jag(r, o.ridge[i], q, o.detail, o.amp).slice(i ? 1 : 0));
  });
  if (o.peak === o.ridge.length - 1) pk = sil.length - 1;
  const [L, R] = [o.ridge[0], o.ridge[o.ridge.length - 1]];
  const foot = Math.max(L[1], R[1]) + 2 * o.depth;
  const N = 16;
  // The front foot, right to left.
  const bottom: P[] = Array.from({ length: N }, (_, i) => {
    const t = (i + 1) / N;
    const m = 2 * t * (1 - t);
    return [
      R[0] * (1 - t) ** 2 + ((L[0] + R[0]) / 2) * m + L[0] * t * t,
      R[1] * (1 - t) ** 2 + foot * m + L[1] * t * t,
    ];
  });
  const top = sil[pk];
  const fi = bottom.reduce(
    (best, q, i) => (Math.abs(q[0] - top[0] - 3) < Math.abs(bottom[best][0] - top[0] - 3) ? i : best),
    0,
  );
  const spine = jag(r, top, bottom[fi], o.detail, o.amp * 0.6);
  const outline = [...sil, ...bottom];
  const litFace = [...sil.slice(0, pk + 1), ...spine.slice(1, -1), ...bottom.slice(fi)];
  const end = N - 1;

  const shade = c.createLinearGradient(top[0], top[1], R[0], foot);
  shade.addColorStop(0, o.shade[0]);
  shade.addColorStop(1, o.shade[1]);
  c.fillStyle = shade;
  trace(c, outline);
  c.fill();
  const lit = c.createLinearGradient(L[0], top[1], bottom[fi][0], foot);
  lit.addColorStop(0, o.lit[0]);
  lit.addColorStop(1, o.lit[1]);
  c.fillStyle = lit;
  trace(c, litFace);
  c.fill();

  c.save();
  trace(c, outline);
  c.clip();
  // Facets: each face fanned into strips between gullies from the skyline to the foot.
  const face = (r0: number, r1: number, b0: number, b1: number, first: P[], last: P[], sunny: boolean) => {
    const fs = [0, ...Array.from({ length: o.facets - 1 }, (_, j) => (j + 0.6 + r() * 0.8) / o.facets), 1];
    const at = (f: number) => [Math.round(r0 + (r1 - r0) * f), Math.round(b0 + (b1 - b0) * f)] as const;
    const lines = fs.map((f, j) => {
      if (j === 0) return first;
      if (j === fs.length - 1) return last;
      const [ri, bi] = at(f);
      return jag(r, sil[ri], bottom[bi], o.detail, o.amp * 0.8);
    });
    for (let j = 0; j < lines.length - 1; j++) {
      const [ra, ba] = at(fs[j]);
      const [rb, bb] = at(fs[j + 1]);
      const strip = [
        ...sil.slice(ra, rb + 1),
        ...lines[j + 1].slice(1),
        ...bottom.slice(bb + 1, ba),
        ...lines[j].slice().reverse(),
      ];
      const t = (r() - 0.5) * 0.3;
      c.fillStyle = t > 0 ? `rgba(255,248,230,${t})` : `rgba(20,18,34,${-t})`;
      trace(c, strip);
      c.fill();
    }
    // Gullies: a dark crease with a sunlit lip on its west side.
    for (const line of lines.slice(1, -1)) {
      c.beginPath();
      c.moveTo(...line[0]);
      for (const q of line) c.lineTo(...q);
      c.strokeStyle = 'rgba(24,20,30,0.35)';
      c.lineWidth = 0.7;
      c.stroke();
      if (sunny) {
        c.beginPath();
        c.moveTo(line[0][0] - 0.6, line[0][1]);
        for (const q of line) c.lineTo(q[0] - 0.6, q[1]);
        c.strokeStyle = 'rgba(255,250,235,0.22)';
        c.lineWidth = 0.5;
        c.stroke();
      }
    }
  };
  face(0, pk, end, fi, [sil[0], bottom[end]], spine, true);
  face(pk, sil.length - 1, fi, 0, spine, [sil[sil.length - 1], bottom[0]], false);

  if (o.snow !== undefined) {
    // Snow cap: a ragged lower edge with tongues reaching down the gullies.
    const xs = outline.map((q) => q[0]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const cap: P[] = [[x0, -10]];
    for (let x = x0; x <= x1; x += 2.5)
      cap.push([x, o.snow + r() * 3 + (r() < 0.3 ? 3 + r() * 7 : 0) + (x - top[0]) * 0.08]);
    cap.push([x1, -10]);
    trace(c, cap);
    c.clip();
    c.fillStyle = '#c4cee2';
    c.fillRect(x0, -10, x1 - x0, 200);
    trace(c, litFace);
    c.fillStyle = '#f5f6f8';
    c.fill();
  }
  c.restore();

  if (o.grass || o.wet) {
    c.save();
    trace(c, outline);
    c.clip();
    if (o.grass) {
      const g = c.createLinearGradient(0, foot - o.grass.height, 0, foot - o.depth);
      g.addColorStop(0, `${o.grass.color}00`);
      g.addColorStop(1, `${o.grass.color}e0`);
      c.fillStyle = g;
      c.fillRect(L[0] - 2, foot - o.grass.height, R[0] - L[0] + 4, o.grass.height + 2);
    }
    if (o.wet) {
      const g = c.createLinearGradient(0, foot - o.depth - o.wet, 0, foot - o.depth);
      g.addColorStop(0, 'rgba(36,48,34,0)');
      g.addColorStop(1, 'rgba(36,48,34,0.9)');
      c.fillStyle = g;
      c.fillRect(L[0] - 2, foot - o.depth - o.wet, R[0] - L[0] + 4, o.wet + o.depth + 2);
    }
    c.restore();
  }
  // Sunlit west rim and a soft dark outline to sit with the painted trees.
  c.beginPath();
  c.moveTo(...sil[0]);
  for (const q of sil.slice(1, pk + 1)) c.lineTo(...q);
  c.strokeStyle = 'rgba(255,248,228,0.4)';
  c.lineWidth = 0.7;
  c.stroke();
  trace(c, outline);
  c.strokeStyle = 'rgba(34,30,36,0.4)';
  c.lineWidth = 0.6;
  c.stroke();
};

const boulder = paint(20, 14, 10, 11, (c) => {
  shadow(c, 11, 11, 9, 3);
  rock(c, mulberry32(31), {
    ridge: [
      [1.5, 10],
      [3.5, 5.5],
      [8.5, 2.5],
      [14.5, 3.5],
      [18.5, 9.5],
    ],
    peak: 2,
    depth: 1.4,
    lit: ['#d2cbbb', '#a39b8a'],
    shade: ['#77746e', '#56534e'],
    facets: 2,
    detail: 1,
    amp: 0.12,
    grass: { color: '#6a8040', height: 3 },
  });
});

/** A peak with a lower shoulder beside it, painted in faceted faces, snow-capped when high. */
const mountain = (seed: number, snowy: boolean) => {
  const r = mulberry32(seed);
  const H = (snowy ? 56 : 30) + r() * 16;
  const colours = {
    lit: ['#dccfb3', '#a49478'] as [string, string],
    shade: ['#858592', '#5c5b66'] as [string, string],
    detail: 3,
    amp: 0.14,
    grass: { color: '#6f8a44', height: snowy ? 18 : 22 },
  };
  return paint(120, 100, 60, 84, (c) => {
    shadow(c, 66, 84, 50, 12);
    const side = r() < 0.5 ? -1 : 1;
    const sx = 60 + side * 26;
    const sH = H * (0.42 + r() * 0.15);
    rock(c, r, {
      ...colours,
      ridge: [
        [sx - 26, 80],
        [sx + (r() - 0.5) * 10, 82 - sH],
        [sx + 26, 80],
      ],
      peak: 1,
      depth: 5,
      facets: 3,
      snow: snowy && sH > 34 ? 82 - sH * 0.7 : undefined,
    });
    const px = 60 + (r() - 0.5) * 16;
    rock(c, r, {
      ...colours,
      ridge: [
        [8, 82],
        [px - 18 - r() * 8, 84 - H * (0.45 + r() * 0.15)],
        [px, 84 - H],
        [px + 14 + r() * 8, 84 - H * (0.5 + r() * 0.15)],
        [112, 82],
      ],
      peak: 2,
      depth: 6,
      facets: 4,
      snow: snowy ? 84 - H * 0.62 : undefined,
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

/** Rock standing in the sea: faceted stone with a dark wet band at the waterline and a foam lip. */
const seaRock = (seed: number, tall: boolean) => {
  const r = mulberry32(seed);
  const H = tall ? 34 + r() * 12 : 15 + r() * 8;
  const j = () => (r() - 0.5) * 4;
  return paint(64, 60, 32, 50, (c) => {
    rock(c, r, {
      ridge: tall
        ? [
            [13, 48],
            [18 + j(), 50 - H * 0.7],
            [28 + j(), 50 - H],
            [36 + j(), 50 - H * 0.9],
            [46 + j(), 50 - H * 0.45],
            [51, 48],
          ]
        : [
            [9, 48],
            [17 + j(), 50 - H * 0.8],
            [30 + j(), 50 - H],
            [44 + j(), 50 - H * 0.65],
            [55, 48],
          ],
      peak: 2,
      depth: 2.5,
      lit: ['#aea597', '#7a7366'],
      shade: ['#5c5c63', '#3d3d44'],
      facets: tall ? 3 : 2,
      detail: 2,
      amp: 0.13,
      wet: 5,
    });
    // Foam lip where the sea meets the rock.
    c.strokeStyle = 'rgba(236,246,246,0.75)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(32, 49.5, tall ? 20 : 24, 3.2, 0, 0, Math.PI);
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

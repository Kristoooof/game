import { Container, Graphics, type Rectangle, type Renderer, Sprite, type Texture } from 'pixi.js';
import { terrainAt } from '../sim/map';
import { roadRoute, roadsBeside, type World } from '../sim/world';
import { BUILDINGS } from '../data/buildings';
import { pierBox } from './buildings';
import { groundToScreen } from './iso';

/** Texture of a small drawing, anchored at its local origin (feet, waterline). */
function bake(renderer: Renderer, draw: (g: Graphics) => void) {
  const g = new Graphics();
  draw(g);
  const b = g.getLocalBounds();
  const texture = renderer.generateTexture({ target: g, resolution: 6, antialias: true });
  g.destroy();
  return { texture, ax: -b.minX / b.width, ay: -b.minY / b.height };
}
type Baked = ReturnType<typeof bake>;
const spriteOf = (b: Baked) =>
  new Sprite({ texture: b.texture as Texture, anchor: { x: b.ax, y: b.ay }, eventMode: 'none' });

const TUNICS = [0x8a3a2a, 0x3f5f8a, 0x5a7a3a, 0x9a7a3a, 0x6a4a7a, 0x7a6a5a];
const SKIN = [0xe8c09a, 0xd8a880, 0xc08a64];
/** Frames in a walk cycle: legs and arms swing through a full stride. */
const STRIDE = 6;
const HAIR = [0x3a2616, 0x6a4422, 0x2a2420, 0x8a6a3a];
const BREECHES = [0x4a3a28, 0x3a3e4a, 0x5a4a32];
const shade = (c: number, k: number) =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

/**
 * Villagers seen from the side, walking right, in six frames: legs bend at the knee and swing
 * opposite the arms, the far limbs in shade, the body rising as a leg passes under it. Men wear
 * a tunic and breeches with a straw hat, a cap or bare hair; women a bodice, a long skirt with an
 * apron and a kerchief. Some carry their trade: an axe on the shoulder, a sack on the back, a
 * basket on the hip, a bucket in the hand.
 */
const walkerArt = (r: Renderer) =>
  TUNICS.flatMap((tunic, n) =>
    [false, true].map((woman) => {
      const skin = SKIN[n % SKIN.length];
      const hair = HAIR[n % HAIR.length];
      const legs = BREECHES[n % BREECHES.length];
      const job = n % 3;
      const axe = !woman && job === 0;
      const sack = !woman && job === 1;
      /** One frame: `swing` of the stride, `up` of the body; `act` a phase of work (axe) or of talk. */
      const frame = (swing: number, up: number, act?: number) =>
        bake(r, (g) => {
          const dark = 0x2a2018;
          g.ellipse(0.3, 0, 3.6, 1.2).fill({ color: 0x000000, alpha: 0.24 });
          const hipY = -6 + up;
          // A leg from the hip: thigh and shin, the knee bent as it swings through, a boot.
          const leg = (s: number, far: boolean) => {
            const footX = s * 2.4;
            const kneeX = footX * 0.5 + 0.7 * (1 - Math.abs(s));
            const kneeY = hipY + 3.1;
            const c = far ? shade(legs, 0.7) : legs;
            g.moveTo(0, hipY)
              .lineTo(kneeX, kneeY)
              .lineTo(footX, -0.9)
              .stroke({ width: 1.5, color: c, cap: 'round', join: 'round' });
            g.roundRect(footX - 0.8, -1.3, 2.2, 1.3, 0.5).fill(far ? 0x241a12 : 0x3a2a1a);
          };
          // An arm from the shoulder: sleeve to the elbow, forearm, a hand.
          const arm = (handX: number, handY: number, far: boolean) => {
            const sx = 0;
            const sy = -11.2 + up;
            const ex = (sx + handX) / 2 - 0.4;
            const ey = (sy + handY) / 2 + 0.3;
            const c = far ? shade(tunic, 0.7) : tunic;
            g.moveTo(sx, sy)
              .lineTo(ex, ey)
              .lineTo(handX, handY)
              .stroke({ width: 1.3, color: c, cap: 'round', join: 'round' });
            g.circle(handX, handY, 0.65).fill(far ? shade(skin, 0.8) : skin);
          };
          const swingHand = (s: number) => [s * 2.6, -6.6 + up + Math.abs(s) * 0.3] as const;
          // Far side first: the far leg, the far arm (up to the sack on the back if there is one).
          if (sack)
            g.ellipse(-2.4, -10.2 + up, 2.6, 3.1)
              .fill(0xcfbf98)
              .stroke({ width: 0.35, color: 0x8a7a5a });
          if (woman) {
            // Feet stepping under the hem.
            g.roundRect(swing * 2 - 0.8, -1.2, 2, 1.2, 0.5).fill(0x241a12);
          } else leg(-swing, true);
          if (sack) arm(-1.4, -12.6 + up, true);
          else if (act === undefined || !axe) arm(...swingHand(swing), true);
          if (woman) {
            g.roundRect(-swing * 2 - 0.8, -1.2, 2, 1.2, 0.5).fill(0x3a2a1a);
            // Long skirt swaying with the stride, an apron over it.
            const sw = swing * 0.5;
            const skirt = n % 2 ? 0x5a4a6a : 0x6a5038;
            g.poly([-2.1, hipY - 0.4, 2.1, hipY - 0.4, 3 + sw, -0.9, -3 + sw, -0.9]).fill(skirt);
            g.poly([0.3, hipY - 0.4, 2.1, hipY - 0.4, 3 + sw, -0.9, 0.6 + sw, -0.9]).fill({
              color: 0x000000,
              alpha: 0.15,
            });
            g.poly([-0.8, hipY - 0.2, 1.6, hipY - 0.2, 2.2 + sw, -2, -0.6 + sw, -2]).fill(0xcfc3a8);
          } else leg(swing, false);
          // Body: shoulders broader than the waist, shaded away from the sun, a belt.
          const top = -11.8 + up;
          g.poly([-2.2, top, 2.2, top, 1.8, hipY + 0.6, -1.8, hipY + 0.6]).fill(woman ? shade(tunic, 0.9) : tunic);
          g.poly([0.5, top, 2.2, top, 1.8, hipY + 0.6, 0.4, hipY + 0.6]).fill({ color: 0x000000, alpha: 0.18 });
          if (!woman) g.rect(-1.8, hipY - 0.3, 3.6, 0.8).fill(dark);
          // Neck and head: face to the front, nose, ear, hair at the back.
          g.rect(-0.5, top - 1, 1, 1.2).fill(shade(skin, 0.85));
          const hx = 0.3;
          const hy = top - 2.6;
          g.circle(hx, hy, 2).fill(skin);
          g.circle(hx + 2, hy + 0.3, 0.5).fill(skin);
          g.circle(hx + 1, hy - 0.4, 0.28).fill(dark);
          g.circle(hx - 0.3, hy + 0.2, 0.45).fill(shade(skin, 0.8));
          if (woman) {
            // Kerchief over the hair, knotted at the back.
            const kc = n % 2 ? 0xe8e0c8 : 0xb84a3a;
            g.poly([
              hx - 2.2,
              hy + 0.6,
              hx - 1.6,
              hy - 1.9,
              hx + 1.4,
              hy - 2.2,
              hx + 1.6,
              hy - 0.8,
              hx - 0.6,
              hy - 0.6,
              hx - 1.6,
              hy + 1.4,
            ]).fill(kc);
            g.poly([hx - 2.1, hy + 0.5, hx - 3.3, hy + 1.8, hx - 2.2, hy + 1.6]).fill(kc);
          } else {
            g.poly([
              hx - 2.1,
              hy + 0.9,
              hx - 1.8,
              hy - 1.6,
              hx + 0.6,
              hy - 2.1,
              hx + 1.6,
              hy - 1.2,
              hx - 0.8,
              hy - 0.8,
              hx - 1.4,
              hy + 1.2,
            ]).fill(hair);
            if (n % 2) {
              g.ellipse(hx, hy - 1.5, 3.6, 0.9).fill(0xd8c080);
              g.ellipse(hx, hy - 2.1, 1.9, 1.1).fill(0xc8b070);
              g.rect(hx - 1.9, hy - 1.8, 3.8, 0.4).fill(0x8a5a2a);
            } else if (n % 3 === 0) g.ellipse(hx - 0.2, hy - 1.6, 2.2, 1.1).fill(0x4a3020);
          }
          // Near arm last, with whatever it carries.
          if (act !== undefined && axe) {
            // Chopping: both hands on the haft, swung from over the shoulder down to the cut.
            const a = [-2.1, -1.4, -0.3, 0.55][Math.floor(act * 4)];
            const [dx, dy] = [Math.cos(a), Math.sin(a)];
            const [px, py] = [-dy, dx];
            const [hx, hy] = [dx * 3.4, -11.2 + up + dy * 3.4];
            arm(hx - dx * 0.8, hy - dy * 0.8, false);
            arm(hx, hy, false);
            const [ex, ey] = [hx + dx * 6, hy + dy * 6];
            g.moveTo(hx - dx * 1.2, hy - dy * 1.2)
              .lineTo(ex, ey)
              .stroke({ width: 0.7, color: 0x8a6038, cap: 'round' });
            g.poly([
              ex - dx * 1.4,
              ey - dy * 1.4,
              ex + dx * 0.4,
              ey + dy * 0.4,
              ex + dx * 0.7 + px * 2.3,
              ey + dy * 0.7 + py * 2.3,
              ex - dx * 1.7 + px * 2.3,
              ey - dy * 1.7 + py * 2.3,
            ])
              .fill(0x8c8c88)
              .stroke({ width: 0.3, color: 0x4a4f57 });
          } else if (act !== undefined) {
            // Talking: the near hand comes up and goes down again as they speak.
            arm(2.2, -8.2 + up - Math.sin(act * Math.PI * 2) * 1.6, false);
          } else if (axe) {
            arm(1.6, -10.4 + up, false);
            g.moveTo(-1.2, -6.6 + up)
              .lineTo(3.6, -14.6 + up)
              .stroke({ width: 0.7, color: 0x8a6038, cap: 'round' });
            g.poly([2.9, -15 + up, 5.6, -15.9 + up, 5.4, -13.2 + up, 3.6, -13.4 + up])
              .fill(0x8c8c88)
              .stroke({ width: 0.3, color: 0x4a4f57 });
          } else if (woman && job === 0) {
            arm(1.6, -6.4 + up, false);
            g.ellipse(2.6, -6 + up, 2, 1.4)
              .fill(0xa0783e)
              .stroke({ width: 0.3, color: 0x5a3e22 });
            g.moveTo(1.1, -6.6 + up)
              .quadraticCurveTo(2.6, -9 + up, 4.1, -6.6 + up)
              .stroke({ width: 0.35, color: 0x5a3e22 });
          } else if (woman && job === 1) {
            const [bx, by] = swingHand(-swing);
            arm(bx, by, false);
            g.moveTo(bx - 1.2, by + 0.6)
              .quadraticCurveTo(bx, by - 0.8, bx + 1.2, by + 0.6)
              .stroke({ width: 0.3, color: 0x3a3a3a });
            g.poly([bx - 1.3, by + 0.6, bx + 1.3, by + 0.6, bx + 1, by + 3, bx - 1, by + 3]).fill(0x8a6038);
          } else arm(...swingHand(-swing), false);
        });
      return {
        axe,
        walk: Array.from({ length: STRIDE }, (_, k) => {
          const ph = (k / STRIDE) * Math.PI * 2;
          return frame(Math.sin(ph), -0.6 * Math.abs(Math.cos(ph)));
        }),
        // Standing: still, breathing.
        stand: [frame(0, 0), frame(0, -0.25)],
        work: [0, 0.25, 0.5, 0.75].map((k) => frame(0, 0, k)),
      };
    }),
  );
type Figure = ReturnType<typeof walkerArt>[number];
type Load = 'crates' | 'sacks' | 'logs' | 'barrels';
/**
 * A horse in profile facing right, at trot frame `f` of ROLL: legs jointed at the knee and hock,
 * moving in diagonal pairs; barrel body, arched neck, a head with muzzle and ear, mane and tail.
 */
function horse(g: Graphics, f: number) {
  const ph = (f / ROLL) * Math.PI * 2;
  const coat = 0x6a4428;
  const far = 0x4e3018;
  const bob = -0.4 * Math.abs(Math.sin(ph));
  // A leg from the shoulder or hip: upper part, knee, cannon to the hoof.
  const leg = (x: number, s: number, c: number, hind: boolean) => {
    const footX = x + s * 2;
    const lift = Math.max(0, s) * 1.1;
    const kneeX = (x + footX) / 2 + (hind ? -0.6 : 0.5);
    g.moveTo(x, -7.5 + bob)
      .lineTo(kneeX, -3.6 - lift * 0.6)
      .lineTo(footX, -0.6 - lift)
      .stroke({ width: 1.3, color: c, cap: 'round', join: 'round' });
    g.rect(footX - 0.6, -0.9 - lift, 1.3, 0.8).fill(0x2a1a10);
  };
  const s = Math.sin(ph);
  // Far pair first, in shade.
  leg(8.4, -s, far, true);
  leg(14.2, s, far, false);
  // Tail, body, belly in shade, the near legs.
  g.moveTo(6.4, -10 + bob)
    .quadraticCurveTo(4.6, -8.5 + bob, 5.2, -4.8 + bob)
    .stroke({ width: 1.3, color: 0x2e1c10, cap: 'round' });
  g.ellipse(11, -9.2 + bob, 5.4, 2.9).fill(coat);
  g.ellipse(11.3, -7.6 + bob, 4.4, 1.2).fill({ color: 0x000000, alpha: 0.18 });
  g.ellipse(10.2, -10.6 + bob, 3.8, 1).fill({ color: 0xffffff, alpha: 0.12 });
  leg(9.2, s, coat, true);
  leg(13.6, -s, coat, false);
  // Neck rising in an arch to the head; ear, eye, nostril; the mane along the crest.
  const nod = Math.abs(s) * 0.7;
  g.poly([14, -11.2 + bob, 16.6, -16 + nod, 18.4, -15.6 + nod, 16.4, -9 + bob]).fill(coat);
  g.poly([16.6, -16.4 + nod, 18.8, -16.2 + nod, 21.6, -13 + nod, 20.6, -12 + nod, 17.6, -13.6 + nod]).fill(coat);
  g.ellipse(21, -12.7 + nod, 1, 0.8).fill(shade(coat, 0.8));
  g.poly([17.2, -16.2 + nod, 17.6, -18 + nod, 18.3, -16.3 + nod]).fill(shade(coat, 0.85));
  g.circle(18.6, -15 + nod, 0.3).fill(0x1a120a);
  g.moveTo(14.2, -11.8 + bob)
    .quadraticCurveTo(15, -15 + nod, 16.9, -16.6 + nod)
    .stroke({ width: 1.1, color: 0x2e1c10, cap: 'round' });
  // Bridle.
  g.moveTo(17.8, -14 + nod)
    .lineTo(20.4, -12.4 + nod)
    .stroke({ width: 0.35, color: 0x2a1a10 });
}

/** Frames of a cart on the move: wheel turning, the horse stepping and nodding. */
const ROLL = 4;
/** Horse-drawn cart with a load and a driver, facing right; frame `f` of ROLL. */
const cartArt = (r: Renderer, load: Load, f: number) =>
  bake(r, (g) => {
    g.ellipse(-2, -0.5, 14, 2.6).fill({ color: 0x000000, alpha: 0.15 });
    // Cart bed, load and driver.
    g.roundRect(-13, -10, 15, 5.5, 1).fill(0x7a5230);
    g.rect(-13, -10, 15, 1.2).fill(0x9a7048);
    if (load === 'crates') {
      g.rect(-12, -15.5, 5.5, 5.5).fill(0xa07a46).stroke({ width: 0.5, color: 0x5a3e22 });
      g.rect(-6.2, -14.5, 5, 4.5).fill(0x8f6a3c).stroke({ width: 0.5, color: 0x5a3e22 });
      g.moveTo(-12, -15.5)
        .lineTo(-6.5, -10)
        .moveTo(-6.2, -14.5)
        .lineTo(-1.2, -10)
        .stroke({ width: 0.4, color: 0x5a3e22 });
    } else if (load === 'sacks')
      for (const [x, y] of [
        [-10.5, -11.6],
        [-6.5, -11.8],
        [-8.5, -14.6],
      ]) {
        g.ellipse(x, y, 2.6, 2).fill(0xd8c8a0).stroke({ width: 0.4, color: 0x8a7a5a });
        g.rect(x - 0.6, y - 2.6, 1.2, 0.8).fill(0x8a7a5a);
      }
    else if (load === 'logs')
      for (const [x, y] of [
        [-11, -11.4],
        [-7.6, -11.4],
        [-4.2, -11.4],
        [-9.3, -14],
        [-5.9, -14],
      ]) {
        g.moveTo(x - 0.5, y)
          .lineTo(x + 0.5, y)
          .stroke({ width: 2.6, color: 0x7a5028, cap: 'round' });
        g.circle(x + 1.2, y, 1.25)
          .fill(0xdcb980)
          .stroke({ width: 0.3, color: 0x7a4f25 });
      }
    else
      for (const x of [-10.5, -6]) {
        g.roundRect(x - 2.2, -16, 4.4, 6, 1.4).fill(0x7a5230);
        g.moveTo(x - 2.2, -14)
          .lineTo(x + 2.2, -14)
          .moveTo(x - 2.2, -11.8)
          .lineTo(x + 2.2, -11.8)
          .stroke({ width: 0.4, color: 0x333333 });
        g.ellipse(x, -16, 2.2, 0.8).fill(0x9a6e40);
      }
    // The driver on his bench at the front of the cart, legs down, reins to the horse.
    g.rect(-3.4, -11.2, 5.4, 1.2).fill(0x5a3e22);
    g.moveTo(-0.6, -10.4).lineTo(0.6, -7.4).stroke({ width: 1.1, color: 0x4a3a28, cap: 'round' });
    g.roundRect(-2.6, -15.4, 3.4, 4.6, 1).fill(0x3f5f8a);
    g.moveTo(0.4, -13).lineTo(1.6, -11.6).stroke({ width: 0.9, color: 0x3f5f8a, cap: 'round' });
    g.moveTo(1.6, -11.6).quadraticCurveTo(9, -12, 15.6, -13.2).stroke({ width: 0.35, color: 0x2a1a10 });
    g.circle(-0.9, -17, 1.6).fill(0xe0b08a);
    g.ellipse(-0.9, -18.2, 2.6, 0.8).fill(0xd8c080);
    // Wheel with spokes.
    g.circle(-8, -3.4, 3.4).stroke({ width: 1, color: 0x3a2a1a });
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4 + (f / ROLL) * (Math.PI / 4);
      g.moveTo(-8 - Math.cos(a) * 3, -3.4 - Math.sin(a) * 3).lineTo(-8 + Math.cos(a) * 3, -3.4 + Math.sin(a) * 3);
    }
    g.stroke({ width: 0.5, color: 0x5a4028 });
    g.circle(-8, -3.4, 0.8).fill(0x3a2a1a);
    // Shafts and harness to the horse.
    g.moveTo(2, -7).lineTo(9, -9).stroke({ width: 0.9, color: 0x4a3420 });
    horse(g, f);
  });

/** A screen-space drawing of a vessel heading at angle `a` (tile space), origin on the waterline. */
function drawShip(g: Graphics, a: number, small: boolean, mirrored = false) {
  const hx = Math.cos(a);
  const hy = Math.sin(a);
  const k = small ? 0.38 : 1;
  /** Point `u` tiles along the heading, `v` across it, `h` px up. */
  const S = (u: number, v: number, h = 0) => {
    const tx = (hx * u - hy * v) * k;
    const ty = (hy * u + hx * v) * k;
    // Mirrored: every point hangs below its own waterline point, so the reflection heads the same way.
    return [(tx - ty) * 32, (tx + ty) * 16 + (mirrored ? h : -h) * k];
  };
  // Hull outline from bow round to bow: tapered at the bow, broad amidships, a squared stern;
  // the sheer rises at both ends (a raised stern castle).
  const outline: [number, number, number][] = [
    [1.25, 0, 11],
    [0.85, 0.2, 8],
    [0.25, 0.33, 7],
    [-0.55, 0.3, 8],
    [-0.95, 0.2, 11],
    [-1, 0, 11],
    [-0.95, -0.2, 11],
    [-0.55, -0.3, 8],
    [0.25, -0.33, 7],
    [0.85, -0.2, 8],
  ];
  const bottom = outline.map(([u, v]) => S(u * 0.92, v * 0.75, 0));
  const top = outline.map(([u, v, h]) => S(u, v, h));
  g.clear();
  g.poly(bottom.flat()).fill(0x3e2614);
  for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length;
    g.poly([...bottom[i], ...bottom[j], ...top[j], ...top[i]]).fill(i < 5 ? 0x6e4626 : 0x553419);
  }
  g.poly(top.flat()).fill(0xa07448).stroke({ width: 1, color: 0x3a2412 });
  // Planking line along the sides.
  g.poly(outline.map(([u, v, h]) => S(u * 0.97, v * 0.9, h * 0.55)).flat()).stroke({
    width: 0.6,
    color: 0x3a2412,
    alpha: 0.6,
  });
  if (small) {
    // Rowing boat: a fisher with two oars.
    const c = S(0, 0, 6);
    g.moveTo(...(S(0, -0.9, 3) as [number, number]))
      .lineTo(...(S(0, 0.9, 3) as [number, number]))
      .stroke({ width: 0.8, color: 0x5a3820 });
    g.roundRect(c[0] - 1.6, c[1] - 6, 3.2, 5, 1).fill(0x3f5f8a);
    g.circle(c[0], c[1] - 7.3, 1.5).fill(0xe0b08a);
    return;
  }
  const bow = S(1.1, 0, 6);
  const sprit = S(1.5, 0, 12);
  g.moveTo(bow[0], bow[1]).lineTo(sprit[0], sprit[1]).stroke({ width: 1.2, color: 0x4a3018 });
  const foot = S(0.05, 0, 6);
  const head = S(0.05, 0, 54);
  g.moveTo(foot[0], foot[1]).lineTo(head[0], head[1]).stroke({ width: 2, color: 0x3a2412 });
  // In the water only hull and mast show: a sail's broad flat mirror image reads as a ghostly box.
  if (mirrored) return;
  // Square sail bellied forward, a red band across it, and a pennant streaming aft.
  const sail = [
    S(0.05, -0.6, 18),
    S(0.2, 0, 15),
    S(0.05, 0.6, 18),
    S(0.05, 0.55, 47),
    S(0.17, 0, 48),
    S(0.05, -0.55, 47),
  ];
  g.poly(sail.flat()).fill(0xf0e6cc).stroke({ width: 0.8, color: 0xb8a888 });
  g.poly([
    ...S(0.07, -0.58, 28),
    ...S(0.2, 0, 26),
    ...S(0.07, 0.58, 28),
    ...S(0.07, 0.57, 33),
    ...S(0.2, 0, 32),
    ...S(0.07, -0.57, 33),
  ]).fill(0xb8402e);
  // The half of the sail turned from the sun is in shade; seams run down the cloth.
  g.poly([...S(0.05, 0.6, 18), ...S(0.2, 0, 15), ...S(0.17, 0, 48), ...S(0.05, 0.55, 47)]).fill({
    color: 0x5a4a30,
    alpha: 0.18,
  });
  for (const v of [-0.3, 0.3]) {
    const a = S(0.11, v, 17);
    const b = S(0.11, v, 47.5);
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
  }
  g.stroke({ width: 0.4, color: 0xb8a888, alpha: 0.8 });
  // Rigging: stays to bow and stern, shrouds to either side, a crow's nest near the top.
  const stays = [S(1.5, 0, 12), S(-0.95, 0, 12), S(0.05, 0.3, 7), S(0.05, -0.3, 7)];
  for (const [x, y] of stays) g.moveTo(head[0], head[1] + 2).lineTo(x, y);
  g.stroke({ width: 0.45, color: 0x2a1c10, alpha: 0.75 });
  const nest = S(0.05, 0, 50);
  g.rect(nest[0] - 2, nest[1] - 1.5, 4, 2.4).fill(0x5a3a1e);
  g.poly([...head, ...S(-0.35, 0, 51), ...S(0.05, 0, 48)]).fill(0xc0392b);
  // Stern windows catching the light, when the stern faces us.
  const st = S(-0.97, 0, 8.5);
  if (st[1] > S(0, 0, 8.5)[1])
    g.rect(st[0] - 2.5, st[1] - 1, 1.6, 1.4)
      .fill(0xe8c870)
      .rect(st[0] + 0.9, st[1] - 1, 1.6, 1.4)
      .fill(0xe8c870);
}

interface Walker {
  s: Sprite;
  fig: Figure;
  /** Seconds left standing still (to rest, talk or work), and at what; which way they face. */
  idle: number;
  work: boolean;
  face: number;
  /** Build: taller or shorter, broader or slighter than the drawing. */
  tall: number;
  broad: number;
  from: number;
  to: number;
  t: number;
  step: number;
  /** Own pace and own distance from the road's middle, so a crowd spreads out. */
  pace: number;
  lane: number;
}
interface Cart {
  s: Sprite;
  frames: Baked[];
  route: number[];
  /** Position along the route in tiles; the cart turns round at either end after a pause. */
  pos: number;
  dir: number;
  wait: number;
  home: number[];
}
interface Vessel {
  g: Graphics;
  mirror: Graphics;
  x: number;
  y: number;
  a: number;
  drawn: number;
  tx: number;
  ty: number;
  speed: number;
  wait: number;
  small: boolean;
  /** Fishing boats keep near their hut: its tile and how far they may go. */
  home?: { x: number; y: number; r: number };
  nextWake: number;
}

const WALK_SPEED = 0.7;
const CART_SPEED = 1.1;

/**
 * Life on the map: people walking the roads, carts between warehouses and houses, fishing boats
 * off the fishers' huts and sailing ships at sea. They go in `front`, depth-sorted with the
 * buildings and trees; wakes and reflections in `water`, between the sea and the land.
 */
export function createLife(
  world: World,
  renderer: Renderer,
  front: Container,
  rockAt: (x: number, y: number) => readonly number[] | null,
) {
  const { map } = world;
  const W = map.width;
  const wakes = new Graphics({ eventMode: 'none' });
  const mirrors = new Container({ eventMode: 'none', alpha: 0.28 });
  const water = new Container({ children: [wakes, mirrors], eventMode: 'none' });
  const walkerFrames = walkerArt(renderer);
  const cartArts = (['crates', 'sacks', 'logs', 'barrels'] as const).map((l) =>
    Array.from({ length: ROLL }, (_, f) => cartArt(renderer, l, f)),
  );

  const center = (i: number) => groundToScreen((i % W) + 0.5, Math.floor(i / W) + 0.5);
  /** Tile x + y of a point a fraction t from tile i's centre to tile j's (matches the scene's zIndex). */
  const depth = (i: number, j: number, t: number) => {
    const a = (i % W) + Math.floor(i / W);
    const b = (j % W) + Math.floor(j / W);
    // A hair past the tile's front: level with a building, someone beside it stands before it.
    return a + (b - a) * t + 1.01;
  };
  const isRoad = (i: number) => world.buildings.get(world.occupied[i])?.type === 'road';
  const roadNeighbours = (i: number) =>
    [i + 1, i - 1, i + W, i - W].filter((j) => j >= 0 && j < map.tiles.length && isRoad(j));

  // Open water at least three tiles from any land: where ships may sail.
  const toLand = new Int32Array(W * map.height).fill(-1);
  {
    const queue: number[] = [];
    map.tiles.forEach((t, i) => {
      if (t === 'water') return;
      toLand[i] = 0;
      queue.push(i);
    });
    for (let q = 0; q < queue.length; q++)
      for (const j of [queue[q] + 1, queue[q] - 1, queue[q] + W, queue[q] - W])
        if (j >= 0 && j < toLand.length && toLand[j] < 0) {
          toLand[j] = toLand[queue[q]] + 1;
          queue.push(j);
        }
  }
  /** Piers stand in the water: vessels keep a little way off them. */
  let piers: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const onPier = (x: number, y: number) =>
    piers.some((p) => x > p.x0 - 0.45 && x < p.x1 + 0.45 && y > p.y0 - 0.45 && y < p.y1 + 0.45);
  /** Inside an offshore rock (its size is about its width in tiles), with a little room around it. */
  const onRock = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const [tx, ty] = [Math.floor(x) + dx, Math.floor(y) + dy];
        const r = rockAt(tx, ty);
        if (r && Math.hypot(x - tx - r[0], y - ty - r[1]) < r[2] * 0.75 + 0.3) return true;
      }
    return false;
  };
  const sea = (x: number, y: number, min: number) => {
    if (onPier(x, y) || onRock(x, y)) return false;
    const i = Math.floor(y) * W + Math.floor(x);
    return terrainAt(map, Math.floor(x), Math.floor(y)) === 'water' && toLand[i] >= min;
  };
  const clearLine = (ax: number, ay: number, bx: number, by: number, min: number) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let k = 1; k <= n; k++) if (!sea(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, min)) return false;
    return true;
  };

  let walkers: Walker[] = [];
  let carts: Cart[] = [];
  const ships: Vessel[] = [];
  let boats: Vessel[] = [];
  /** Wake foam left at the stern; `trail` joins the points of one side of one vessel into a line. */
  const wake: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
    size: number;
    trail: Vessel;
  }[] = [];

  const newVessel = (x: number, y: number, small: boolean, home?: Vessel['home']): Vessel => {
    const g = new Graphics();
    const mirror = new Graphics({ tint: 0x2a6a8a });
    front.addChild(g);
    mirrors.addChild(mirror);
    return {
      g,
      mirror,
      x,
      y,
      a: Math.random() * Math.PI * 2,
      drawn: NaN,
      tx: x,
      ty: y,
      speed: small ? 0.5 : 1.2,
      wait: 0,
      small,
      home,
      nextWake: 0,
    };
  };
  // Ships: a handful on the open sea, wherever there is room.
  for (let tries = 0; ships.length < 7 && tries < 2000; tries++) {
    const x = Math.random() * W;
    const y = Math.random() * map.height;
    if (sea(x, y, 4)) ships.push(newVessel(x, y, false));
  }

  /** Next destination: a reachable spot in open water, or near its hut for a fishing boat. */
  const retarget = (v: Vessel) => {
    for (let tries = 0; tries < 30; tries++) {
      const r = v.home ? v.home.r : 45;
      const cx = v.home ? v.home.x : v.x;
      const cy = v.home ? v.home.y : v.y;
      const tx = cx + (Math.random() - 0.5) * 2 * r;
      const ty = cy + (Math.random() - 0.5) * 2 * r;
      const min = v.small ? 1 : 3;
      if (sea(tx, ty, min) && clearLine(v.x, v.y, tx, ty, min)) {
        [v.tx, v.ty] = [tx, ty];
        return;
      }
    }
    v.wait = 2;
  };

  return {
    water,
    /** The world changed: people, carts and fishing boats follow its roads and buildings. */
    refresh() {
      const roads = [...world.buildings.values()].filter((b) => b.type === 'road').map((b) => b.y * W + b.x);
      const houses = [...world.buildings.values()].filter((b) => b.type === 'house');
      // Walkers: about three per house, as the roads allow.
      const want = Math.min(60, Math.floor(roads.length / 2), houses.length * 3);
      walkers = walkers.filter((w) => {
        const keep = isRoad(w.from) && isRoad(w.to);
        if (!keep) w.s.destroy();
        return keep;
      });
      while (walkers.length > want) walkers.pop()!.s.destroy();
      while (walkers.length < want) {
        const from = roads[Math.floor(Math.random() * roads.length)];
        const fig = walkerFrames[Math.floor(Math.random() * walkerFrames.length)];
        const s = spriteOf(fig.walk[0]);
        front.addChild(s);
        walkers.push({
          s,
          fig,
          idle: 0,
          work: false,
          face: 1,
          tall: 1.2 + Math.random() * 0.2,
          broad: 1.15 + Math.random() * 0.25,
          from,
          to: roadNeighbours(from)[0] ?? from,
          t: Math.random(),
          step: Math.random(),
          pace: 0.8 + Math.random() * 0.45,
          lane: 3 + Math.random() * 4.5,
        });
      }
      // Carts: one per warehouse or harbour, to houses it can reach by road.
      for (const c of carts) c.s.destroy();
      carts = [];
      for (const b of world.buildings.values()) {
        if (b.type !== 'warehouse' && b.type !== 'harbor') continue;
        const home = roadsBeside(world, b);
        const targets = houses.map((h) => roadsBeside(world, h)).filter((r) => r.length);
        const route =
          home.length && targets.length
            ? roadRoute(world, home, targets[Math.floor(Math.random() * targets.length)])
            : null;
        if (!route || route.length < 2) continue;
        const frames = cartArts[b.id % cartArts.length];
        const s = spriteOf(frames[0]);
        front.addChild(s);
        carts.push({ s, frames, route, pos: 0, dir: 1, wait: 1, home });
      }
      piers = [...world.buildings.values()].flatMap((b) =>
        b.type === 'harbor' || b.type === 'fisher' ? (pierBox(map, b.x, b.y, BUILDINGS[b.type].size) ?? []) : [],
      );
      // Fishing boats: one per fisher hut.
      for (const v of boats) {
        v.g.destroy();
        v.mirror.destroy();
      }
      boats = [];
      for (const b of world.buildings.values()) {
        if (b.type !== 'fisher') continue;
        for (let tries = 0; tries < 40; tries++) {
          const x = b.x + 1 + (Math.random() - 0.5) * 8;
          const y = b.y + 1 + (Math.random() - 0.5) * 8;
          if (sea(x, y, 1)) {
            boats.push(newVessel(x, y, true, { x: b.x + 1, y: b.y + 1, r: 7 }));
            break;
          }
        }
      }
    },
    update(dt: number, view: Rectangle, far: boolean) {
      water.visible = !far;
      if (far) return;
      const inView = (x: number, y: number, m = 80) =>
        x > view.x - m && x < view.x + view.width + m && y > view.y - m && y < view.y + view.height + m;

      for (const w of walkers) {
        if (w.idle > 0) w.idle -= dt;
        else {
          // Someone just ahead going the same way in the same lane: step aside and pass them,
          // slowing a little, rather than walk through them or queue up behind.
          const ahead = walkers.find(
            (o) =>
              o !== w &&
              o.from === w.from &&
              o.to === w.to &&
              o.t > w.t &&
              o.t - w.t < 0.3 &&
              Math.abs(o.lane - w.lane) < 2,
          );
          if (ahead) w.lane = Math.max(2.5, Math.min(8, w.lane + (ahead.lane > 5.2 ? -1 : 1) * dt * 8));
          w.t += dt * WALK_SPEED * w.pace * (ahead ? 0.6 : 1);
          if (w.t >= 1) {
            // At the next tile: carry on, turning at random; back only at a dead end.
            const options = roadNeighbours(w.to).filter((j) => j !== w.from);
            const next = options.length ? options[Math.floor(Math.random() * options.length)] : w.from;
            [w.from, w.to, w.t] = [w.to, next, w.t - 1];
            // Now and then they stop: a woodcutter beside the forest to fell a tree, others to
            // rest or have a word with whoever else is standing about.
            const here = center(w.from);
            const wood = w.fig.axe
              ? [w.from + 1, w.from - 1, w.from + W, w.from - W].find(
                  (j) => !world.occupied[j] && terrainAt(map, j % W, Math.floor(j / W)) === 'forest',
                )
              : undefined;
            if (wood !== undefined && Math.random() < 0.6) {
              [w.idle, w.work, w.t] = [4 + Math.random() * 5, true, 0];
              w.face = Math.sign(center(wood).x - here.x) || 1;
            } else if (Math.random() < 0.12) {
              [w.idle, w.work, w.t] = [2 + Math.random() * 4, false, 0];
              const near = walkers.find(
                (o) => o !== w && o.idle > 0 && Math.abs(o.s.x - here.x) < 30 && Math.abs(o.s.y - here.y) < 16,
              );
              w.face = near ? Math.sign(near.s.x - here.x) || 1 : Math.random() < 0.5 ? -1 : 1;
              // Whoever they stop beside turns to them, and they talk.
              if (near && !near.work) near.face = -w.face;
            }
          }
        }
        const a = center(w.from);
        const b = center(w.to);
        // Keep to the right of the road, so people pass each other.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const x = a.x + dx * w.t - (dy / len) * w.lane;
        const y = a.y + dy * w.t + (dx / len) * w.lane * 0.5;
        w.s.visible = inView(x, y);
        if (!w.s.visible) continue;
        // Depth among buildings and trees: tile x + y of where it stands.
        w.s.zIndex = depth(w.from, w.to, w.t);
        let fr: Baked;
        let face = dx < 0 ? -1 : 1;
        if (w.idle > 0) {
          // Working or talking (when someone is close by), otherwise just standing.
          const talk =
            !w.work &&
            walkers.some((o) => o !== w && o.idle > 0 && Math.abs(o.s.x - x) < 30 && Math.abs(o.s.y - y) < 16);
          w.step = (w.step + dt * (w.work ? 1.4 : talk ? 0.9 : 0.4)) % 1;
          fr =
            w.work || (talk && !w.fig.axe) ? w.fig.work[Math.floor(w.step * 4)] : w.fig.stand[Math.floor(w.step * 2)];
          face = w.face;
        } else {
          w.step = (w.step + dt * 1.6 * w.pace) % 1;
          fr = w.fig.walk[Math.floor(w.step * STRIDE)];
        }
        w.s.texture = fr.texture as Texture;
        w.s.anchor.set(fr.ax, fr.ay);
        w.s.position.set(x, y);
        w.s.scale.set(face * w.broad, w.tall);
      }

      for (const c of carts) {
        if (c.wait > 0) {
          c.wait -= dt;
        } else {
          c.pos += c.dir * dt * CART_SPEED;
          if (c.pos >= c.route.length - 1 || c.pos <= 0) {
            c.pos = Math.max(0, Math.min(c.route.length - 1, c.pos));
            c.dir = -c.dir;
            c.wait = 2;
          }
        }
        const i = Math.min(c.route.length - 2, Math.floor(c.pos));
        const a = center(c.route[i]);
        const b = center(c.route[i + 1]);
        const t = c.pos - i;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        c.s.visible = inView(x, y);
        c.s.zIndex = depth(c.route[i], c.route[i + 1], t);
        c.s.position.set(x, y);
        // Drawn to the villagers' scale: the horse a horse beside them, not a pony.
        c.s.scale.set((b.x - a.x) * c.dir < 0 ? -1.3 : 1.3, 1.3);
        // Wheel and hooves keep pace with the ground covered; still while it waits.
        const fr = c.frames[Math.floor(c.pos * ROLL * 3) % ROLL];
        c.s.texture = fr.texture as Texture;
        c.s.anchor.set(fr.ax, fr.ay);
      }

      const all = [...ships, ...boats];
      // Never overlap, even while one lies still: vessels too close are eased apart.
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const [a, b] = [all[i], all[j]];
          const min = a.small && b.small ? 0.6 : a.small || b.small ? 1.2 : 2.2;
          const ox = a.x - b.x;
          const oy = a.y - b.y;
          const d = Math.hypot(ox, oy) || 0.01;
          if (d >= min) continue;
          const k = ((min - d) / d) * Math.min(1, dt * 2) * 0.5;
          if (sea(a.x + ox * k, a.y + oy * k, 1)) [a.x, a.y] = [a.x + ox * k, a.y + oy * k];
          if (sea(b.x - ox * k, b.y - oy * k, 1)) [b.x, b.y] = [b.x - ox * k, b.y - oy * k];
        }
      for (const v of all) {
        const dx = v.tx - v.x;
        const dy = v.ty - v.y;
        const dist = Math.hypot(dx, dy);
        if (v.wait > 0) v.wait -= dt;
        else if (dist < 0.5) {
          // Arrived: fishing boats stop a while to fish, ships sail on.
          v.wait = v.small ? 3 + Math.random() * 4 : 0;
          retarget(v);
        } else {
          // Steer for the destination, pushed off by every vessel close by (more the closer it
          // is), and slow down when one lies ahead: they give way instead of sailing through.
          let sx = dx / dist;
          let sy = dy / dist;
          let ahead = 0;
          const room = v.small ? 1.2 : 3.5;
          for (const u of all) {
            if (u === v) continue;
            const ox = v.x - u.x;
            const oy = v.y - u.y;
            const d = Math.hypot(ox, oy);
            if (d >= room || d === 0) continue;
            const push = ((room - d) / room) * 2.5;
            sx += (ox / d) * push;
            sy += (oy / d) * push;
            // In front of us (within ~45° of the heading)?
            if ((-ox * Math.cos(v.a) - oy * Math.sin(v.a)) / d > 0.7) ahead = Math.max(ahead, 1 - d / room);
          }
          let da = Math.atan2(sy, sx) - v.a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          v.a += Math.max(-dt * 0.8, Math.min(dt * 0.8, da));
          const sp = v.speed * (1 - Math.min(0.7, Math.abs(da))) * (1 - ahead * 0.8);
          const nx = v.x + Math.cos(v.a) * sp * dt;
          const ny = v.y + Math.sin(v.a) * sp * dt;
          if (sea(nx, ny, v.small ? 1 : 2)) [v.x, v.y] = [nx, ny];
          else retarget(v);
        }
        const p = groundToScreen(v.x, v.y);
        const vis = inView(p.x, p.y, 120);
        v.g.visible = v.mirror.visible = vis;
        if (!vis) continue;
        // Redrawn only when the heading has turned past one of 32 steps.
        const q = Math.round((v.a / (Math.PI * 2)) * 32);
        if (q !== v.drawn) {
          v.drawn = q;
          drawShip(v.g, (q / 32) * Math.PI * 2, v.small);
          drawShip(v.mirror, (q / 32) * Math.PI * 2, v.small, true);
        }
        const bob = Math.sin(performance.now() / 600 + v.tx) * 0.8;
        v.g.position.set(p.x, p.y + bob);
        v.g.zIndex = v.x + v.y;
        v.mirror.position.set(p.x, p.y + bob);
        // Wake: foam left at the stern, spreading out to both sides.
        const moving = v.wait <= 0 && dist >= 0.5;
        v.nextWake -= dt;
        if (moving && v.nextWake <= 0 && wake.length < 1500) {
          v.nextWake = v.small ? 0.15 : 0.05;
          const k = v.small ? 0.38 : 1;
          const sx = Math.cos(v.a);
          const sy = Math.sin(v.a);
          const stern = groundToScreen(v.x - sx * 0.9 * k, v.y - sy * 0.9 * k);
          // Sideways in screen space: the heading's perpendicular, projected.
          const px = (-sy - sx) * 32 * 0.25;
          const py = (-sy + sx) * 16 * 0.25;
          for (const side of [-1, 1])
            wake.push({
              x: stern.x,
              y: stern.y,
              vx: px * side,
              vy: py * side,
              age: 0,
              life: v.small ? 1.1 : 2.8,
              size: k * side,
              trail: v,
            });
        }
      }

      wakes.clear();
      for (let i = wake.length - 1; i >= 0; i--) {
        const w = wake[i];
        w.age += dt;
        if (w.age >= w.life) {
          wake.splice(i, 1);
          continue;
        }
        w.x += w.vx * dt;
        w.y += w.vy * dt;
      }
      // Two arms of foam from each stern, widening and fading as they spread: one line per arm,
      // joined point to point, so no stacked blobs band the water.
      const last = new Map<string, (typeof wake)[0]>();
      for (const w of wake) {
        const key = `${all.indexOf(w.trail)}:${Math.sign(w.size)}`;
        const prev = last.get(key);
        last.set(key, w);
        if (!prev || !inView(w.x, w.y) || Math.hypot(w.x - prev.x, w.y - prev.y) > 30) continue;
        const k = w.age / w.life;
        wakes
          .moveTo(prev.x, prev.y)
          .lineTo(w.x, w.y)
          .stroke({
            width: (1 + k * 2.5) * Math.abs(w.size) + 0.4,
            color: 0xf2fafa,
            alpha: 0.3 * (1 - k) ** 1.5,
            cap: 'butt',
          });
      }
      // Bow waves: a curl of white water at the bow of every moving ship.
      for (const v of ships) {
        if (!v.g.visible || v.wait > 0) continue;
        const bow = groundToScreen(v.x + Math.cos(v.a) * 1.1, v.y + Math.sin(v.a) * 1.1);
        const pulse = 1 + 0.15 * Math.sin(performance.now() / 180 + v.x);
        wakes.ellipse(bow.x, bow.y + 1, 7 * pulse, 2.6 * pulse).fill({ color: 0xffffff, alpha: 0.7 });
      }
    },
  };
}

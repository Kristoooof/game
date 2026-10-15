import { Container, Rectangle, type Sprite } from 'pixi.js';
import { type GameMap, terrainAt } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { createGround } from './ground';
import { TILE_H, TILE_W, tileToScreen } from './iso';
import { type Art, makeArt, sprite } from './textures';

export const diamond = (x: number, y: number) => {
  const s = tileToScreen(x, y);
  return [s.x, s.y, s.x + TILE_W / 2, s.y + TILE_H / 2, s.x, s.y + TILE_H, s.x - TILE_W / 2, s.y + TILE_H / 2];
};

const CHUNK = 16;

/** Below this zoom, trees and peaks are hidden and the ground shader paints canopy instead. */
const FAR_SCALE = 0.3;

/**
 * Shader-drawn ground and sea, plus trees, bushes and peaks as sprites in culled
 * CHUNK×CHUNK containers. Buildings join the same containers so everything standing
 * on the map is depth-sorted together (zIndex = x + y of the object's front).
 */
export function createTerrain(map: GameMap) {
  const art = makeArt();
  leafArt = art.broadleaves;
  const ground = createGround(map);
  const { width: W, height: H } = map;
  const at = (x: number, y: number) => terrainAt(map, x, y) ?? 'water';
  const objects = new Container({ sortableChildren: true });
  const cols = Math.ceil(W / CHUNK);
  const chunks: Container[] = [];
  const nature = new Map<number, Sprite[]>();
  const allNature: Sprite[] = [];

  // Mountain tiles deep inside a range get taller peaks.
  const rockDepth = new Uint8Array(W * H);
  for (let pass = 1; pass <= 3; pass++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (at(x, y) !== 'mountain' || rockDepth[i] !== pass - 1) continue;
        const n = [rockDepth[i - 1], rockDepth[i + 1], rockDepth[i - W], rockDepth[i + W]];
        if (
          n.every((v) => v >= pass - 1) &&
          [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].every((t) => t === 'mountain')
        )
          rockDepth[i] = pass;
      }

  for (let cy = 0; cy < Math.ceil(H / CHUNK); cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      const x1 = Math.min(W, x0 + CHUNK);
      const y1 = Math.min(H, y0 + CHUNK);
      const left = tileToScreen(x0, y1).x - 2 * TILE_W;
      const right = tileToScreen(x1, y0).x + 2 * TILE_W;
      const top = tileToScreen(x0, y0).y - 160;
      const bottom = tileToScreen(x1, y1).y + 2 * TILE_H;
      const c = new Container({ cullable: true, sortableChildren: true, zIndex: cx + cy });
      c.cullArea = new Rectangle(left, top, right - left, bottom - top);
      chunks.push(c);
      objects.addChild(c);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const t = at(x, y);
          const r = mulberry32(x * 92821 + y * 68917 + 7);
          const list: Sprite[] = [];
          const put = (a: Art, u: number, v: number, scale: number) => {
            const s = sprite(a, ...xy(x + u, y + v), scale);
            s.zIndex = x + y + u + v;
            list.push(s);
            c.addChild(s);
          };
          if (t === 'forest') {
            const n = 2 + Math.floor(r() * 3);
            for (let i = 0; i < n; i++) {
              const u = 0.1 + r() * 0.8;
              const v = 0.1 + r() * 0.8;
              const k = r();
              if (k < 0.6) put(art.conifers[Math.floor(r() * 3)], u, v, 0.75 + r() * 0.45);
              else if (k < 0.93) put(leaf(r()), u, v, 0.7 + r() * 0.4);
              else put(art.bushes[Math.floor(r() * 2)], u, v, 0.8 + r() * 0.4);
            }
          } else if (t === 'mountain') {
            const d = rockDepth[y * W + x];
            // Sparse peaks; the ground shader paints the rock between them.
            const p = r();
            if (p < 0.3 + d * 0.12)
              put(art.mountains[Math.floor(r() * 4)], 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.6 + d * 0.25 + r() * 0.25);
            else if (p < 0.55) put(art.boulder, 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.8 + r() * 0.8);
          } else if (t === 'grass') {
            const p = r();
            if (p < 0.035) put(leaf(r()), 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.75 + r() * 0.35);
            else if (p < 0.09) put(art.bushes[Math.floor(r() * 2)], 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.7 + r() * 0.5);
            else if (p < 0.105) put(art.boulder, 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.6 + r() * 0.5);
          }
          if (list.length) {
            nature.set(y * W + x, list);
            allNature.push(...list);
          }
        }
      }
    }
  }

  let far = false;
  return {
    ground: ground.mesh,
    objects,
    /** Object container for tile (x, y): add buildings here, depth-sorted by zIndex. */
    objectsAt: (x: number, y: number) => chunks[Math.floor(y / CHUNK) * cols + Math.floor(x / CHUNK)],
    /** Remove trees and decoration from a tile (forest cleared for building). */
    clearTile(x: number, y: number) {
      const i = y * W + x;
      nature.get(i)?.forEach((s) => {
        s.destroy();
        allNature.splice(allNature.indexOf(s), 1);
      });
      nature.delete(i);
      ground.setForest(x, y, false);
    },
    update(dt: number, scale: number) {
      const nowFar = scale < FAR_SCALE;
      if (nowFar !== far) {
        far = nowFar;
        for (const s of allNature) s.visible = !far;
      }
      ground.update(dt, Math.min(1, Math.max(0, (FAR_SCALE + 0.08 - scale) / 0.08)));
    },
  };
}

/** Mostly green broadleaves, the odd autumn one. */
let leafArt: Art[] = [];
const leaf = (k: number) => leafArt[k < 0.08 ? 3 : Math.floor(k * 3) % 3];

const xy = (x: number, y: number): [number, number] => {
  const s = tileToScreen(x, y);
  return [s.x, s.y];
};

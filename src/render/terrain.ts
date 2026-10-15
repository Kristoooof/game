import { Container, Graphics, Rectangle, Sprite, TilingSprite } from 'pixi.js';
import { type GameMap, terrainAt } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { TILE_H, TILE_W, tileToScreen } from './iso';
import { type Art, makeArt, sprite } from './textures';

/** Land is raised this many pixels above the sea, showing a cliff along the shore. */
export const LIFT = 6;
export const liftAt = (map: GameMap, x: number, y: number) =>
  (terrainAt(map, x, y) ?? 'water') === 'water' ? 0 : LIFT;

export const diamond = (x: number, y: number, lift = 0) => {
  const s = tileToScreen(x, y);
  const top = s.y - lift;
  return [s.x, top, s.x + TILE_W / 2, top + TILE_H / 2, s.x, top + TILE_H, s.x - TILE_W / 2, top + TILE_H / 2];
};

const CHUNK = 16;

/** Deterministic per-tile random in [0, 1). */
const hash = (x: number, y: number, k = 0) => mulberry32(x * 73856093 + y * 19349663 + k * 83492791)();

/** Gentle brightness patches so large meadows don't look tiled. */
const tintAt = (x: number, y: number) => {
  const b = 0.9 + 0.1 * Math.sin(x * 0.19 + Math.sin(y * 0.15) * 2) * Math.cos(y * 0.11 + x * 0.04);
  const v = Math.round(255 * Math.min(1, b));
  return (v << 16) | (v << 8) | v;
};

/**
 * Terrain in CHUNK×CHUNK pieces across stacked layers: an animated sea, shallow-water
 * halos, raised ground with cliffs, shore foam, and depth-sorted objects (trees, peaks,
 * buildings). Every chunk has a fixed cull area so off-screen chunks cost nothing.
 */
export function createTerrain(map: GameMap) {
  const art = makeArt();
  const { width: W, height: H } = map;
  const at = (x: number, y: number) => terrainAt(map, x, y) ?? 'water';
  const land = (x: number, y: number) => at(x, y) !== 'water';

  const minX = -H * (TILE_W / 2);
  const maxX = W * (TILE_W / 2);
  const maxY = (W + H) * (TILE_H / 2);
  const M = 4000;
  const seaOpts = { width: maxX - minX + 2 * M, height: maxY + 2 * M, x: minX - M, y: -M };
  const sea = new TilingSprite({ texture: art.sea.texture, ...seaOpts });
  const sparkle = new TilingSprite({ texture: art.sparkle.texture, ...seaOpts });
  sea.tileScale.set(0.5);
  sparkle.tileScale.set(0.5);

  const layers = {
    sea: new Container({ children: [sea, sparkle] }),
    halos: new Container(),
    ground: new Container(),
    foam: new Container(),
    objects: new Container(),
    clouds: new Container(),
  };
  layers.objects.sortableChildren = true;

  const groundArt = (x: number, y: number): Art | undefined => {
    const t = at(x, y);
    const h = hash(x, y);
    if (t === 'grass') return art.grass[Math.floor(h * h * h * 4)];
    if (t === 'forest') return art.forest[Math.floor(h * 2)];
    if (t === 'beach') return art.beach[Math.floor(h * 3)];
    if (t === 'mountain') return art.rock[Math.floor(h * 2)];
  };

  const groundSprites = new Map<number, Sprite>();
  const objectSprites = new Map<number, Sprite[]>();
  const chunkObjects: Container[] = [];
  const cols = Math.ceil(W / CHUNK);

  /** Trees, bushes and peaks standing on one tile. */
  const addTileObjects = (x: number, y: number, into: Container) => {
    const t = at(x, y);
    const top = tileToScreen(x, y);
    const list: Sprite[] = [];
    const put = (a: Art, u: number, v: number, scale: number) => {
      const s = sprite(a, top.x + (u - v) * (TILE_W / 2), top.y + (u + v) * (TILE_H / 2) - LIFT, scale);
      s.zIndex = x + y + u + v;
      list.push(s);
      into.addChild(s);
    };
    const r = mulberry32(x * 92821 + y * 68917 + 7);
    if (t === 'forest') {
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const kind = r() < 0.7 ? Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
        put(art.trees[kind], 0.15 + r() * 0.7, 0.15 + r() * 0.7, 0.8 + r() * 0.4);
      }
    } else if (t === 'mountain') {
      put(art.mountains[Math.floor(r() * 3)], 0.5, 0.5, 0.85 + r() * 0.3);
    } else if (t === 'grass') {
      const p = r();
      if (p < 0.04) put(art.trees[2 + Math.floor(r() * 2)], 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.8 + r() * 0.3);
      else if (p < 0.1) put(art.bush, 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.8 + r() * 0.4);
    }
    if (list.length) objectSprites.set(y * W + x, list);
  };

  for (let cy = 0; cy < Math.ceil(H / CHUNK); cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      const x1 = Math.min(W, x0 + CHUNK);
      const y1 = Math.min(H, y0 + CHUNK);
      const left = tileToScreen(x0, y1).x - TILE_W;
      const right = tileToScreen(x1, y0).x + TILE_W;
      const top = tileToScreen(x0, y0).y - 120;
      const bottom = tileToScreen(x1, y1).y + TILE_H;
      const chunk = () => {
        const c = new Container({ cullable: true });
        c.cullArea = new Rectangle(left - 160, top, right - left + 320, bottom - top + 100);
        return c;
      };
      const halos = chunk();
      const groundC = chunk();
      const foam = chunk();
      const objects = chunk();
      objects.sortableChildren = true;
      // Back-to-front chunk order keeps objects overlapping correctly across chunk edges.
      objects.zIndex = cx + cy;
      const cliffs = new Graphics();
      const surf = new Graphics();
      groundC.addChild(cliffs);
      foam.addChild(surf);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (!land(x, y)) continue;
          const d = diamond(x, y, LIFT);
          const [tx, ty, rx, ry, bx, by, lx, ly] = d;
          const t = at(x, y);
          const sx = !land(x + 1, y);
          const sy = !land(x, y + 1);
          const coast = sx || sy || !land(x - 1, y) || !land(x, y - 1);
          // Halos overlap heavily; every other coast tile is enough for a smooth band.
          if (coast && (x + y) % 2 === 0) {
            const s = sprite(art.halo, bx, by - TILE_H / 2 + LIFT, 1.4);
            halos.addChild(s);
          }
          const sideColor = t === 'beach' ? 0xc4a46a : 0x8a6440;
          if (sy) cliffs.poly([lx, ly, bx, by, bx, by + LIFT, lx, ly + LIFT]).fill(sideColor);
          if (sx)
            cliffs
              .poly([bx, by, rx, ry, rx, ry + LIFT, bx, by + LIFT])
              .fill(sideColor === 0xc4a46a ? 0xa8895a : 0x6e4e31);
          const g = groundArt(x, y)!;
          const s = sprite(g, tx, ty);
          s.tint = tintAt(x, y);
          groundSprites.set(y * W + x, s);
          groundC.addChild(s);
          // Surf: on the water line in front, along the raised edge behind.
          const line = (a: number[], b: number[]) => surf.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
          if (sy) line([lx, ly + LIFT + 1], [bx, by + LIFT + 1]);
          if (sx) line([bx, by + LIFT + 1], [rx, ry + LIFT + 1]);
          if (!land(x - 1, y)) line([lx - 1, ly], [tx - 1, ty - 0.5]);
          if (!land(x, y - 1)) line([tx + 1, ty - 0.5], [rx + 1, ry]);
          addTileObjects(x, y, objects);
        }
      }
      surf.stroke({ width: 1.6, color: 0xffffff, alpha: 0.75 });
      layers.halos.addChild(halos);
      layers.ground.addChild(groundC);
      layers.foam.addChild(foam);
      layers.objects.addChild(objects);
      chunkObjects.push(objects);
    }
  }

  const r = mulberry32(99);
  // Few and modest: large translucent sprites are costly fill on weak GPUs.
  const clouds = Array.from({ length: 4 }, () => {
    const s = sprite(art.cloud, minX + r() * (maxX - minX), r() * maxY, 3 + r() * 2);
    s.scale.y *= 0.6;
    layers.clouds.addChild(s);
    return s;
  });

  let time = 0;
  return {
    layers,
    /** Object container for tile (x, y): add buildings here, depth-sorted by zIndex. */
    objectsAt: (x: number, y: number) => chunkObjects[Math.floor(y / CHUNK) * cols + Math.floor(x / CHUNK)],
    /** Remove trees and decoration on a tile and redraw its ground (forest cleared). */
    clearTile(x: number, y: number) {
      const i = y * W + x;
      objectSprites.get(i)?.forEach((s) => s.destroy());
      objectSprites.delete(i);
      const g = groundSprites.get(i);
      const a = groundArt(x, y);
      if (g && a) g.texture = a.texture;
    },
    update(dt: number) {
      time += dt;
      sea.tilePosition.x += dt * 6;
      sea.tilePosition.y = Math.sin(time * 0.3) * 6;
      sparkle.tilePosition.x -= dt * 9;
      sparkle.alpha = 0.6 + 0.4 * Math.sin(time * 1.7);
      layers.foam.alpha = 0.55 + 0.3 * Math.sin(time * 1.3);
      for (const c of clouds) {
        c.x += dt * 14;
        if (c.x > maxX + 1500) c.x = minX - 1500;
      }
    },
  };
}

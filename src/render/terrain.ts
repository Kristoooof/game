import {
  Container,
  Graphics,
  Matrix,
  Mesh,
  MeshGeometry,
  Rectangle,
  type Renderer,
  RenderTexture,
  Sprite,
  Texture,
} from 'pixi.js';
import { BUILDINGS } from '../data/buildings';
import { terrainAt } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import type { World } from '../sim/world';
import { drawBuilding, drawRoads } from './buildings';
import { createGround } from './ground';
import { tileToScreen } from './iso';
import { type Art, makeArt, sprite } from './textures';

const CHUNK = 16;

/** Below this zoom, trees are left out and the land shader paints forest canopy instead. */
export const FAR_SCALE = 0.3;
/**
 * Chunks baked per frame. A count, not a time budget: the bake's real cost is GPU work
 * that JS timing does not see, and a big window can need dozens of chunks at once.
 */
const BAKES_PER_FRAME = 2;
/** Highest chunk texture resolution; phones get less to stay within their memory. */
const MAX_TIER = matchMedia('(pointer: coarse)').matches ? 1 : 2;
/** Chunks unseen for this many frames give their textures back. */
const EVICT_FRAMES = 240;

interface Chunk {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** World-pixel bounds of the land diamond, and of everything standing on it. */
  ground: Rectangle;
  objects: Rectangle;
  /** Land drawn as the chunk's diamond, not its bounding box: no overdraw between chunks. */
  groundMesh: Mesh<MeshGeometry>;
  objectSprite: Sprite;
  /** Bake key ("tier/far") of the textures shown, or '' when nothing is baked. */
  baked: string;
  dirty: boolean;
  lastSeen: number;
}

/**
 * The static world (land, roads, trees, peaks, buildings) is rendered once per
 * CHUNK×CHUNK piece into textures, at a resolution matching the zoom. A frame then
 * draws only the live water shader and a few dozen chunk sprites. Changes rebake the
 * chunks they touch; textures of chunks long off screen are released.
 */
export function createTerrain(world: World, renderer: Renderer) {
  const { map } = world;
  const art = makeArt();
  const leaf = (k: number) => art.broadleaves[k < 0.08 ? 3 : Math.floor(k * 3) % 3];
  const ground = createGround(map);
  const { width: W, height: H } = map;
  const at = (x: number, y: number) => terrainAt(map, x, y) ?? 'water';
  const groundLayer = new Container();
  const objectLayer = new Container({ sortableChildren: true });

  // Mountain tiles deep inside a range get taller peaks.
  const rockDepth = new Uint8Array(W * H);
  for (let pass = 1; pass <= 3; pass++)
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (at(x, y) !== 'mountain' || rockDepth[i] !== pass - 1) continue;
        if ([i - 1, i + 1, i - W, i + W].every((j) => map.tiles[j] === 'mountain' && rockDepth[j] >= pass - 1))
          rockDepth[i] = pass;
      }

  /** Within two tiles of the sea: its reflections are drawn. */
  const nearWater = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, y + dy) === 'water') return true;
    return false;
  };
  /** Trees, bushes, boulders and peaks standing on free tiles of a chunk. */
  function addNature(c: Chunk, into: Container, far: boolean) {
    for (let y = c.y0; y < c.y1; y++)
      for (let x = c.x0; x < c.x1; x++) {
        if (world.occupied[y * W + x]) continue;
        const t = at(x, y);
        const r = mulberry32(x * 92821 + y * 68917 + 7);
        const put = (a: Art, u: number, v: number, scale: number) => {
          const s = tileToScreen(x + u, y + v);
          const sp = sprite(a, s.x, s.y, scale);
          sp.zIndex = x + y + u + v;
          into.addChild(sp);
          // Coastal things mirror into the sea: the same sprite flipped about its base, bluish and faint.
          if (!far && nearWater(x, y)) {
            const mirror = sprite(a, s.x, s.y, scale);
            mirror.scale.y = -mirror.scale.y;
            mirror.tint = 0x2a6a8a;
            mirror.alpha = 0.2;
            mirror.zIndex = sp.zIndex - 0.01;
            into.addChild(mirror);
          }
        };
        if (t === 'forest' && !far) {
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
          // Sparse peaks on a checkerboard so they do not stack into rows; snow only deep inside a range.
          const d = rockDepth[y * W + x];
          const p = r();
          const k = r();
          if ((x + y) % 2 === 0 && p < 0.45 + d * 0.15) {
            const kinds = d >= 2 ? art.peaks : art.hills;
            put(kinds[Math.floor(k * kinds.length)], 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.7 + d * 0.22 + r() * 0.3);
          } else if (p < 0.5 && !far) put(art.boulder, 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.8 + r() * 0.8);
        } else if (t === 'beach' && !far) {
          // Coast: palms just back from the water, driftwood and pebbles along the tideline.
          const coastal = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].includes('water');
          const p = r();
          if (coastal && p < 0.07)
            put(art.palms[Math.floor(r() * 3)], 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.85 + r() * 0.3);
          else if (coastal && p < 0.2)
            put(art.driftwood[Math.floor(r() * 2)], 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.9 + r() * 0.4);
          else if (p < 0.12) put(art.pebbles[Math.floor(r() * 2)], 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.8 + r() * 0.5);
        } else if (t === 'grass' && !far) {
          const p = r();
          if (p < 0.035) put(leaf(r()), 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.75 + r() * 0.35);
          else if (p < 0.09) put(art.bushes[Math.floor(r() * 2)], 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.7 + r() * 0.5);
          else if (p < 0.105) put(art.boulder, 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.6 + r() * 0.5);
        }
      }
  }

  /** Diamond over tiles [x0, x1) × [y0, y1), its UVs mapping into a texture of bounds `r`. */
  const diamondMesh = (x0: number, y0: number, x1: number, y1: number, r: Rectangle) => {
    const pts = [tileToScreen(x0, y0), tileToScreen(x1, y0), tileToScreen(x1, y1), tileToScreen(x0, y1)];
    const geometry = new MeshGeometry({
      positions: new Float32Array(pts.flatMap((p) => [p.x, p.y])),
      uvs: new Float32Array(pts.flatMap((p) => [(p.x - r.x) / r.width, (p.y - r.y) / r.height])),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    return new Mesh({ geometry, texture: Texture.EMPTY, visible: false });
  };

  const chunks: Chunk[] = [];
  const cols = Math.ceil(W / CHUNK);
  for (let cy = 0; cy < Math.ceil(H / CHUNK); cy++)
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      const x1 = Math.min(W, x0 + CHUNK);
      const y1 = Math.min(H, y0 + CHUNK);
      // Open sea: nothing to bake.
      let hasLand = false;
      for (let y = y0; y < y1 && !hasLand; y++) for (let x = x0; x < x1; x++) if (at(x, y) !== 'water') hasLand = true;
      if (!hasLand) continue;
      const left = tileToScreen(x0, y1).x;
      const right = tileToScreen(x1, y0).x;
      const top = tileToScreen(x0, y0).y;
      const bottom = tileToScreen(x1, y1).y;
      const c: Chunk = {
        x0,
        y0,
        x1,
        y1,
        ground: new Rectangle(left - 16, top - 16, right - left + 32, bottom - top + 32),
        objects: new Rectangle(left - 80, top - 180, right - left + 160, bottom - top + 204),
        groundMesh: diamondMesh(
          x0,
          y0,
          x1,
          y1,
          new Rectangle(left - 16, top - 16, right - left + 32, bottom - top + 32),
        ),
        objectSprite: new Sprite({ visible: false, zIndex: cx + cy }),
        baked: '',
        dirty: false,
        lastSeen: -1e9,
      };
      groundLayer.addChild(c.groundMesh);
      objectLayer.addChild(c.objectSprite);
      chunks.push(c);
    }

  /** Pixel look: chunk textures are sampled nearest, so every texel stays a hard square. */
  let pixel = false;
  const render = (container: Container, r: Rectangle, tier: number) => {
    const target = RenderTexture.create({ width: Math.ceil(r.width), height: Math.ceil(r.height), resolution: tier });
    if (pixel) target.source.style.scaleMode = 'nearest';
    renderer.render({ container, target, clear: true, transform: new Matrix().translate(-r.x, -r.y) });
    return target;
  };
  /** Show `texture` (or nothing) on a chunk sprite or mesh and free the texture it replaces. */
  const swap = (s: Sprite | Mesh<MeshGeometry>, texture: RenderTexture | null, r?: Rectangle) => {
    const old = s.texture;
    s.texture = texture ?? Texture.EMPTY;
    if (r) s.position.set(r.x, r.y);
    if (old instanceof RenderTexture && old !== texture) old.destroy(true);
  };

  function bake(c: Chunk, tier: number, far: boolean) {
    const g = new Container();
    // Bake a little past the diamond so its edge texels are fully covered: no seams.
    const land = ground.landMesh(c.x0 - 0.25, c.y0 - 0.25, c.x1 + 0.25, c.y1 + 0.25, far ? 1 : 0);
    const roads = new Graphics();
    drawRoads(roads, world, c.x0, c.y0, c.x1, c.y1);
    g.addChild(land, roads);
    const groundTex = render(g, c.ground, tier);
    land.geometry.destroy();
    g.destroy({ children: true });

    const o = new Container({ sortableChildren: true });
    addNature(c, o, far);
    for (const b of world.buildings.values()) {
      if (b.type === 'road' || b.x < c.x0 || b.x >= c.x1 || b.y < c.y0 || b.y >= c.y1) continue;
      const bg = new Graphics({ zIndex: b.x + b.y + BUILDINGS[b.type].size });
      drawBuilding(bg, b.type, b.x, b.y, b.id);
      o.addChild(bg);
    }
    // Trim the object texture to what is actually there: less transparent overdraw.
    let objTex: RenderTexture | null = null;
    let objRect: Rectangle | undefined;
    if (o.children.length) {
      const b = o.getLocalBounds();
      objRect = new Rectangle(
        Math.floor(b.minX) - 2,
        Math.floor(b.minY) - 2,
        Math.ceil(b.width) + 4,
        Math.ceil(b.height) + 4,
      );
      objTex = render(o, objRect, tier);
    }
    o.destroy({ children: true });

    swap(c.groundMesh, groundTex);
    swap(c.objectSprite, objTex, objRect);
    c.baked = `${tier}/${far}`;
    c.dirty = false;
  }

  let frame = 0;
  /** For the FPS overlay: chunks on screen and chunks waiting to be (re)baked. */
  const stats = { visible: 0, pending: 0 };
  return {
    stats,
    water: ground.water,
    ground: groundLayer,
    objects: objectLayer,
    /** Rebake the chunks covering these tiles, including neighbours their objects overhang. */
    invalidate(tiles: [number, number][]) {
      for (const [x, y] of tiles)
        for (const c of chunks) if (x >= c.x0 - 1 && x <= c.x1 && y >= c.y0 - 1 && y <= c.y1) c.dirty = true;
    },
    /** Switch the look; chunks rebake on their next view because their key changes. */
    setPixel(on: boolean) {
      pixel = on;
    },
    /** Tiles changed by building or demolishing: clear their forest and rebake around them. */
    changed(tiles: [number, number][]) {
      ground.clearForest(tiles);
      this.invalidate(tiles);
    },
    update(dt: number, view: Rectangle, scale: number) {
      frame++;
      const far = scale < FAR_SCALE;
      ground.update(dt, Math.min(1, Math.max(0, (FAR_SCALE + 0.08 - scale) / 0.08)));
      // Power-of-two texture resolution per zoom level, so zooming does not rebake constantly.
      const tier = Math.min(
        pixel ? 1 : MAX_TIER,
        Math.max(1 / 16, 2 ** Math.ceil(Math.log2(scale * renderer.resolution))),
      );
      const key = `${tier}/${far}/${pixel}`;
      const queue: Chunk[] = [];
      for (const c of chunks) {
        const visible = c.objects.intersects(view);
        c.groundMesh.visible = c.objectSprite.visible = visible && c.baked !== '';
        if (visible) {
          c.lastSeen = frame;
          if (c.dirty || c.baked !== key) queue.push(c);
        } else if (c.baked && frame - c.lastSeen > EVICT_FRAMES && tier > 0.125) {
          swap(c.groundMesh, null);
          swap(c.objectSprite, null);
          c.baked = '';
        }
      }
      // Missing chunks first, then the ones nearest the view centre.
      const cx = view.x + view.width / 2;
      const cy = view.y + view.height / 2;
      const dist = (c: Chunk) =>
        Math.hypot(c.ground.x + c.ground.width / 2 - cx, c.ground.y + c.ground.height / 2 - cy);
      queue.sort((a, b) => (a.baked ? 1 : 0) - (b.baked ? 1 : 0) || dist(a) - dist(b));
      for (const c of queue.slice(0, BAKES_PER_FRAME)) bake(c, tier, far);
      stats.visible = chunks.filter((c) => c.lastSeen === frame).length;
      stats.pending = queue.length;
    },
  };
}

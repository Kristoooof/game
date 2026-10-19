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
import { levelAt, terrainAt } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { noise2 } from './sculpt';
import type { World } from '../sim/world';
import {
  drawBuilding,
  drawLampPost,
  drawPier,
  drawRoads,
  lampPosts,
  pierBox,
  setGlow,
  setSun,
  setWet,
} from './buildings';
import { sunShadow } from './daylight';
import { createGround } from './ground';
import { createMassif, TOP } from './massif';
import { groundToScreen, LEVEL_H, MAX_LEVEL, tileToScreen } from './iso';
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
  /** Mirror images of coastal things, drawn under the land so only the sea shows them. */
  reflectionSprite: Sprite;
  /** Window and lantern light, added on top after dark. */
  lightSprite: Sprite;
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
  /** A broadleaf for tile (x, y): autumn comes to whole stretches of woodland, not tree by tree. */
  const leaf = (k: number, x: number, y: number) => {
    const fall = noise2(x * 0.09, y * 0.09, 5) > 0.6 ? 0.65 : 0.015;
    if (k < fall) return art.autumn[Math.floor((k / fall) * art.autumn.length)];
    return art.broadleaves[Math.floor(((k - fall) / (1 - fall)) * art.broadleaves.length)];
  };
  const massif = createMassif(map);
  const ground = createGround(map, massif.peaks);
  const { width: W, height: H } = map;
  const at = (x: number, y: number) => terrainAt(map, x, y) ?? 'water';
  const groundLayer = new Container();
  const objectLayer = new Container({ sortableChildren: true });
  const reflectionLayer = new Container();
  const lightLayer = new Container({ alpha: 0 });
  /**
   * Depth-sorted with people and carts (zIndex = tile x + y): live copies of the buildings and of
   * the trees near roads, so whatever stands in front of a walker hides it.
   */
  const front = new Container({ sortableChildren: true });
  let occluders: Container[] = [];
  /** Buildings still under construction: drawn live elsewhere, left out of the bake. */
  const hidden = new Set<number>();
  /** Sun step for shadows (see daylight.ts); part of the bake key. */
  let sunStep = 3;
  let shade = sunShadow(sunStep);
  let wet = 0;

  /** Tiles of `type` `depth` steps or more inside their patch (up to `max`): darker woods. */
  const depthIn = (type: string, max: number) => {
    const depth = new Uint8Array(W * H);
    for (let pass = 1; pass <= max; pass++)
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (at(x, y) !== type || depth[i] !== pass - 1) continue;
          if ([i - 1, i + 1, i - W, i + W].every((j) => map.tiles[j] === type && depth[j] >= pass - 1)) depth[i] = pass;
        }
    return depth;
  };
  /** Boulders lie in screes, a few 3×3 patches of the highland, not sprinkled evenly over it. */
  const scree = (x: number, y: number) => mulberry32(Math.floor(x / 3) * 7919 + Math.floor(y / 3) * 104729)() < 0.35;
  const woodDepth = depthIn('forest', 3);
  /** Steps out from the nearest wood: 1 beside it, 2 one tile further, 0 beyond or in it. */
  const woodNear = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (at(x, y) === 'forest') continue;
      let d = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (at(x + dx, y + dy) === 'forest') {
            const k = Math.max(Math.abs(dx), Math.abs(dy));
            d = d === 0 ? k : Math.min(d, k);
          }
      woodNear[y * W + x] = d;
    }

  /**
   * Draw order of something standing at tile point (px, py), given its own depth `z`: a building is
   * one depth for its whole footprint, so next to one, anything past its front faces goes after it
   * and anything else before it.
   */
  const depthBeside = (px: number, py: number, z: number) => {
    const fx = Math.floor(px);
    const fy = Math.floor(py);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (fx + dx < 0 || fy + dy < 0 || fx + dx >= W || fy + dy >= H) continue;
        const b = world.buildings.get(world.occupied[(fy + dy) * W + fx + dx]);
        if (!b || b.type === 'road') continue;
        const size = BUILDINGS[b.type].size;
        const bz = b.x + b.y + size;
        z = px >= b.x + size || py >= b.y + size ? Math.max(z, bz + 0.01) : Math.min(z, bz - 0.01);
      }
    return z;
  };
  /** Ground worn bare by the town: round each building, fading over two tiles, and beside roads. */
  const wear = (x: number, y: number) => {
    let w = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const b = world.buildings.get(world.occupied[(y + dy) * W + x + dx]);
        if (!b) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        w = Math.max(w, b.type === 'road' ? (d <= 1 ? 0.5 : 0) : 1 - d / 3);
      }
    return w;
  };
  ground.setWear(wear);
  /** Beside a road (any of the eight neighbours): trees kept back so their crowns do not hang over it. */
  const byRoad = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        if (world.buildings.get(world.occupied[(y + dy) * W + x + dx])?.type === 'road') return true;
      }
    return false;
  };
  /** Water right in front (below on screen): only then does a building's mirror image meet the shore. */
  const waterInFront = (x: number, y: number) =>
    [at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)].some((t) => t === 'water' || t === 'river');
  /** Coastal things mirror into the sea: the same picture flipped about its base line `y`. */
  const mirror = (d: Container, y: number, into: Container) => {
    d.scale.y = -d.scale.y;
    d.y = 2 * y - d.y;
    into.addChild(d);
  };
  /** Trees, bushes, boulders, peaks and offshore rocks on free tiles of a chunk. */
  /**
   * Nature on `tiles`. Without `reflections` only the plain sprites, no shadows or mirror images:
   * the live copies that hide people behind trees (see `refreshFront`).
   */
  function addNature(tiles: Iterable<[number, number]>, into: Container, reflections: Container | null, far: boolean) {
    for (const [x, y] of tiles) {
      if (world.occupied[y * W + x]) continue;
      const t = at(x, y);
      const r = mulberry32(x * 92821 + y * 68917 + 7);
      /** `lean`: trees bend a little with the prevailing wind. */
      const put = (a: Art, u: number, v: number, scale: number, lean = false, tint = 0xffffff) => {
        // Trees (the ones that lean) keep off the roadside.
        if (lean && byRoad(x, y)) return;
        const s = groundToScreen(x + u, y + v);
        const sp = sprite(a, s.x, s.y, scale);
        sp.tint = tint;
        if (lean) sp.skew.x = -(0.05 + ((x * 7 + y * 13) % 5) * 0.012);
        sp.zIndex = depthBeside(x + u, y + v, x + y + u + v);
        into.addChild(sp);
        if (!reflections) return;
        // Cast shadow: the silhouette laid flat along the sun's direction.
        const sh = sprite(a, s.x, s.y, scale);
        sh.texture = a.bare;
        const k = sh.scale.x;
        // Never laid so flat that it thins into a line.
        const dy = Math.sign(shade.dy || 1) * Math.max(Math.abs(shade.dy), 0.28);
        sh.setFromMatrix(new Matrix(k, 0, -shade.dx * k, -dy * k, s.x, s.y));
        sh.tint = 0x0a1a10;
        sh.alpha = 0.22 * shade.alpha;
        sh.zIndex = sp.zIndex - 0.5;
        into.addChild(sh);
        // Only things standing in the water mirror in it: a tree set back on the shore shows only
        // its crown in the water, hanging there apart from it.
        if (!far && t === 'water') {
          const m = sprite(a, s.x, s.y, scale);
          m.zIndex = sp.zIndex;
          mirror(m, s.y, reflections);
        }
      };
      const rock = t === 'water' && !far && ground.rockAt(x, y);
      // Small rocks are always low ones; big ones may be tall stacks.
      if (rock) put(art.seaRocks[rock[2] < 0.35 ? rock[3] % 3 : rock[3]], rock[0], rock[1], rock[2] * 1.4);
      else if (t === 'forest' && !far) {
        // Young trees and undergrowth at the edge; old, tall, shadowed trees deep inside.
        const d = woodDepth[y * W + x];
        const n = 3 + Math.floor(r() * 2) + (d > 1 ? 1 : 0);
        const grow = 0.85 + d * 0.08;
        const dark = [0xffffff, 0xe6ece4, 0xccd6ca, 0xb8c4b6][d];
        for (let i = 0; i < n; i++) {
          const u = 0.1 + r() * 0.8;
          const v = 0.1 + r() * 0.8;
          const k = r();
          const bush = d === 0 ? 0.75 : 0.93;
          if (k < 0.55)
            put(art.conifers[Math.floor(r() * art.conifers.length)], u, v, (0.75 + r() * 0.45) * grow, true, dark);
          else if (k < bush) put(leaf(r(), x, y), u, v, (0.7 + r() * 0.4) * grow, true, dark);
          else put(art.bushes[Math.floor(r() * art.bushes.length)], u, v, 0.8 + r() * 0.4);
        }
      } else if (t === 'mountain') {
        // The range itself (see massif.ts), and boulders in screes on the low ground at its edge.
        const g = massif.piece(x, y);
        if (g) {
          const m = new Mesh({ geometry: g, shader: massif.shader });
          m.zIndex = depthBeside(x + 0.5, y + 0.5, x + y + 1);
          into.addChild(m);
        }
        if (!far && massif.peaks[y * W + x] < 6 && r() < (scree(x, y) ? 0.6 : 0.08))
          put(art.boulder, 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.8 + r() * 0.8);
      } else if (t === 'beach' && !far) {
        // Coast: palms just back from the water, driftwood and pebbles along the tideline.
        const coastal = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].includes('water');
        const p = r();
        if (coastal && p < 0.07)
          put(art.palms[Math.floor(r() * 3)], 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.85 + r() * 0.3, true);
        else if (coastal && p < 0.2)
          put(art.driftwood[Math.floor(r() * 2)], 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.9 + r() * 0.4);
        else if (p < 0.12) put(art.pebbles[Math.floor(r() * 2)], 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.8 + r() * 0.5);
      } else if (t === 'rocky' && !far) {
        // Stony shore: boulders and loose stones.
        const p = r();
        if (p < 0.35) put(art.boulder, 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.6 + r() * 0.9);
        else if (p < 0.6) put(art.pebbles[Math.floor(r() * 2)], 0.2 + r() * 0.6, 0.2 + r() * 0.6, 0.9 + r() * 0.5);
      } else if (t === 'grass' && !far) {
        const p = r();
        // Rubble fallen from the cliff behind.
        const l = levelAt(map, x, y);
        if (
          [levelAt(map, x - 1, y), levelAt(map, x, y - 1), levelAt(map, x - 1, y - 1)].some((v) => v > l) &&
          p < 0.45
        ) {
          put(art.boulder, 0.15 + r() * 0.3, 0.15 + r() * 0.3, 0.5 + r() * 0.6);
          if (r() < 0.6) put(art.pebbles[Math.floor(r() * 2)], 0.3 + r() * 0.4, 0.3 + r() * 0.4, 0.8 + r() * 0.4);
        } else {
          // Out from the wood: a hem of scrub and young trees, then groves, and here and there a
          // big lone tree in the open.
          const edge = woodNear[y * W + x];
          const [u, v] = [0.2 + r() * 0.6, 0.2 + r() * 0.6];
          if ((edge === 1 && p < 0.45) || (edge === 2 && p < 0.2)) {
            if (r() < 0.55) put(art.bushes[Math.floor(r() * art.bushes.length)], u, v, 0.7 + r() * 0.5);
            else if (r() < 0.5) put(art.conifers[Math.floor(r() * art.conifers.length)], u, v, 0.5 + r() * 0.25, true);
            else put(leaf(r(), x, y), u, v, 0.5 + r() * 0.25, true);
          } else if (noise2(x * 0.13, y * 0.13, 6) > 0.64 && p < 0.35)
            put(leaf(r(), x, y), u, v, 0.75 + r() * 0.4, true);
          else if (p < 0.006) put(leaf(r(), x, y), u, v, 1.15 + r() * 0.25, true);
          else if (p < 0.05) put(art.bushes[Math.floor(r() * art.bushes.length)], u, v, 0.7 + r() * 0.5);
          else if (p < 0.065) put(art.boulder, u, v, 0.6 + r() * 0.5);
        }
      }
    }
  }

  function* chunkTiles(c: Chunk): Generator<[number, number]> {
    for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) yield [x, y];
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
      for (let y = y0; y < y1 && !hasLand; y++)
        for (let x = x0; x < x1; x++) if (at(x, y) !== 'water' || ground.rockAt(x, y)) hasLand = true;
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
        // Raised terraces of tiles in front reach up into this chunk's area.
        ground: new Rectangle(
          left - 16,
          top - 16 - MAX_LEVEL * LEVEL_H,
          right - left + 32,
          bottom - top + 32 + MAX_LEVEL * LEVEL_H,
        ),
        // Mountains rise up to TOP above their (raised) ground.
        objects: new Rectangle(
          left - 80,
          top - TOP - 30 - MAX_LEVEL * LEVEL_H,
          right - left + 160,
          bottom - top + TOP + 54 + MAX_LEVEL * LEVEL_H,
        ),
        groundMesh: diamondMesh(
          x0,
          y0,
          x1,
          y1,
          new Rectangle(
            left - 16,
            top - 16 - MAX_LEVEL * LEVEL_H,
            right - left + 32,
            bottom - top + 32 + MAX_LEVEL * LEVEL_H,
          ),
        ),
        objectSprite: new Sprite({ visible: false, zIndex: cx + cy }),
        reflectionSprite: new Sprite({ visible: false, tint: 0x2a6a8a, alpha: 0.22 }),
        lightSprite: new Sprite({ visible: false, blendMode: 'add' }),
        baked: '',
        dirty: false,
        lastSeen: -1e9,
      };
      groundLayer.addChild(c.groundMesh);
      objectLayer.addChild(c.objectSprite);
      reflectionLayer.addChild(c.reflectionSprite);
      lightLayer.addChild(c.lightSprite);
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

  /** Render `o` into a texture trimmed to what is actually in it: less transparent overdraw. */
  const renderTrimmed = (o: Container, tier: number) => {
    if (!o.children.length) return { texture: null };
    const b = o.getLocalBounds();
    const rect = new Rectangle(
      Math.floor(b.minX) - 2,
      Math.floor(b.minY) - 2,
      Math.ceil(b.width) + 4,
      Math.ceil(b.height) + 4,
    );
    return { texture: render(o, rect, tier), rect };
  };

  function bake(c: Chunk, tier: number, far: boolean, key: string) {
    const g = new Container();
    // Bake a little past the diamond so its edge texels are fully covered: no seams.
    // The finest ground detail only where it is baked sharp enough to show.
    const land = ground.landMesh(
      c.x0 - 0.25,
      c.y0 - 0.25,
      c.x1 + 0.25,
      c.y1 + 0.25,
      far ? 1 : 0,
      tier >= 2 ? 1 : 0,
      wet,
    );
    const roads = new Graphics();
    drawRoads(roads, world, c.x0, c.y0, c.x1, c.y1, wet);
    g.addChild(land, roads);
    const groundTex = render(g, c.ground, tier);
    land.geometry.destroy();
    g.destroy({ children: true });

    const o = new Container({ sortableChildren: true });
    const refl = new Container({ sortableChildren: true });
    const lights = new Container({ children: [new Graphics()] });
    setSun(shade);
    setWet(wet);
    addNature(chunkTiles(c), o, refl, far);
    for (const b of world.buildings.values()) {
      if (b.type === 'road' || hidden.has(b.id) || b.x < c.x0 || b.x >= c.x1 || b.y < c.y0 || b.y >= c.y1) continue;
      const size = BUILDINGS[b.type].size;
      const draw = (mirrored = false) => {
        const bg = new Graphics({ zIndex: b.x + b.y + size });
        drawBuilding(bg, b.type, b.x, b.y, b.id, mirrored);
        return bg;
      };
      setGlow(lights);
      o.addChild(draw());
      setGlow(null);
      const pier = b.type === 'harbor' || b.type === 'fisher' ? pierBox(map, b.x, b.y, size) : null;
      const drawP = (mirrored = false) => {
        const pg = new Graphics({ zIndex: pier!.x0 + pier!.y0 + 0.5 });
        drawPier(pg, pier!.x0, pier!.y0, pier!.x1, pier!.y1, mirrored);
        return pg;
      };
      setGlow(lights);
      if (pier) o.addChild(drawP());
      setGlow(null);
      if (far || !waterInFront(b.x + size - 1, b.y + size - 1)) continue;
      // Drawn in mirror mode: every point hangs below its own ground point, as in still water.
      refl.addChild(draw(true));
      if (pier) refl.addChild(drawP(true));
    }
    setGlow(lights);
    for (const [x, y] of lampPosts(world, c.x0, c.y0, c.x1, c.y1)) {
      const pg = new Graphics({ zIndex: x + y + 1 });
      drawLampPost(pg, x, y);
      o.addChild(pg);
    }
    setGlow(null);
    const obj = renderTrimmed(o, tier);
    const mir = renderTrimmed(refl, tier);
    const lit = renderTrimmed(new Container({ children: [lights] }), tier);
    o.destroy({ children: true });
    refl.destroy({ children: true });
    lights.destroy({ children: true });

    swap(c.groundMesh, groundTex);
    swap(c.objectSprite, obj.texture, obj.rect);
    swap(c.reflectionSprite, mir.texture, mir.rect);
    swap(c.lightSprite, lit.texture, lit.rect);
    c.baked = key;
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
    reflections: reflectionLayer,
    front,
    /** Offshore rock on a water tile, if any: [u, v, size, variant]. */
    rockAt: ground.rockAt,
    /** Rebuild the live copies in `front` after the roads or buildings changed. */
    refreshFront() {
      for (const o of occluders) o.destroy();
      const near = new Set<number>();
      for (const b of world.buildings.values())
        if (b.type === 'road')
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              if (terrainAt(map, b.x + dx, b.y + dy)) near.add((b.y + dy) * W + b.x + dx);
      const tmp = new Container();
      addNature(
        [...near].map((i): [number, number] => [i % W, Math.floor(i / W)]),
        tmp,
        null,
        false,
      );
      for (const b of world.buildings.values()) {
        if (b.type === 'road' || hidden.has(b.id)) continue;
        const g = new Graphics({ zIndex: b.x + b.y + BUILDINGS[b.type].size });
        drawBuilding(g, b.type, b.x, b.y, b.id, false, false);
        tmp.addChild(g);
      }
      occluders = [...tmp.children] as Container[];
      if (occluders.length) front.addChild(...occluders);
      tmp.destroy();
    },
    lights: lightLayer,
    light: ground.light,
    /** Sun step (see daylight.ts) for cast shadows; chunks rebake when it changes. */
    setSun(step: number) {
      if (step === sunStep) return;
      sunStep = step;
      shade = sunShadow(step);
    },
    /** Rebake the chunks covering these tiles, including neighbours their objects overhang. */
    invalidate(tiles: [number, number][]) {
      for (const [x, y] of tiles)
        for (const c of chunks) if (x >= c.x0 - 1 && x <= c.x1 && y >= c.y0 - 1 && y <= c.y1) c.dirty = true;
    },
    /** Leave building `id` out of the bake (under construction) or put it back. */
    hide(id: number, on: boolean) {
      if (on) hidden.add(id);
      else hidden.delete(id);
    },
    /** How wet the ground is (0..1, from the rain); in thirds, each a rebake of the land on view. */
    setWet(amount: number) {
      wet = Math.round(Math.min(1, Math.max(0, amount)) * 3) / 3;
    },
    /** Switch the look; chunks rebake on their next view because their key changes. */
    setPixel(on: boolean) {
      pixel = on;
    },
    /** Tiles changed by building or demolishing: clear their forest and rebake around them. */
    changed(tiles: [number, number][]) {
      ground.clearForest(tiles);
      ground.setWear(wear);
      this.invalidate(tiles);
    },
    update(dt: number, view: Rectangle, scale: number) {
      frame++;
      const far = scale < FAR_SCALE;
      ground.update(dt, Math.min(1, Math.max(0, (FAR_SCALE + 0.08 - scale) / 0.08)));
      // Power-of-two texture resolution per zoom level, so zooming does not rebake constantly.
      const tier = Math.min(
        pixel ? 1 : MAX_TIER,
        // Never below native: zooming out keeps the land as sharp as zoomed in, like the sea.
        Math.max(1, 2 ** Math.ceil(Math.log2(scale * renderer.resolution))),
      );
      const key = `${tier}/${far}/${pixel}/${sunStep}/${wet}`;
      const queue: Chunk[] = [];
      for (const c of chunks) {
        const visible = c.objects.intersects(view);
        c.groundMesh.visible =
          c.objectSprite.visible =
          c.reflectionSprite.visible =
          c.lightSprite.visible =
            visible && c.baked !== '';
        if (visible) {
          c.lastSeen = frame;
          if (c.dirty || c.baked !== key) queue.push(c);
        } else if (c.baked && frame - c.lastSeen > EVICT_FRAMES) {
          swap(c.groundMesh, null);
          swap(c.objectSprite, null);
          swap(c.reflectionSprite, null);
          swap(c.lightSprite, null);
          c.baked = '';
        }
      }
      // Missing chunks first, then the ones nearest the view centre.
      const cx = view.x + view.width / 2;
      const cy = view.y + view.height / 2;
      const dist = (c: Chunk) =>
        Math.hypot(c.ground.x + c.ground.width / 2 - cx, c.ground.y + c.ground.height / 2 - cy);
      queue.sort((a, b) => (a.baked ? 1 : 0) - (b.baked ? 1 : 0) || dist(a) - dist(b));
      for (const c of queue.slice(0, BAKES_PER_FRAME)) bake(c, tier, far, key);
      stats.visible = chunks.filter((c) => c.lastSeen === frame).length;
      stats.pending = queue.length;
    },
  };
}

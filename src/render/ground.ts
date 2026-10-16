import { BufferImageSource, Geometry, Mesh, Shader } from 'pixi.js';
import type { GameMap } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { TILE_H, TILE_W } from './iso';

/** Share of eligible coastal water tiles with a rock, and how far it may sit off the tile centre. */
const ROCK_CHANCE = 0.1;
const ROCK_SPREAD = 0.2;

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vPos;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;


void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
}`;

/** Shared GLSL: uniforms, baked-noise helpers, smooth per-tile sampling and the coastline. */
const common = /* glsl */ `
in vec2 vPos;
out vec4 finalColor;
uniform sampler2D uMask;
uniform sampler2D uDist;
uniform sampler2D uNoise;
uniform vec2 uSize;
uniform float uTime;
uniform float uFar;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Baked, tileable noise (see bakeNoise): r = 4-octave fbm, g = single octave, b = second fbm.
vec4 nz(vec2 p) { return texture(uNoise, p / 32.0); }
float fbm(vec2 p) { return nz(p).r; }
float noise(vec2 p) { return texture(uNoise, p / 64.0).g; }
// Smooth (C1) sampling of a per-tile texture at tile-space point p.
vec4 smp(sampler2D t, vec2 p) {
  vec2 q = p - 0.5, i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  return texture(t, (i + f + 0.5) / uSize);
}
// Screen-space world pixels back to continuous tile coordinates.
vec2 tileCoord() {
  return vec2(vPos.x / ${TILE_W.toFixed(1)} + vPos.y / ${TILE_H.toFixed(1)}, vPos.y / ${TILE_H.toFixed(1)} - vPos.x / ${TILE_W.toFixed(1)});
}
// Animated sea height: several octaves of drifting noise.
float wave(vec2 q) { return fbm(q * 0.9 + vec2(uTime * 0.08, -uTime * 0.05)) + 0.4 * noise(q * 2.7 - vec2(uTime * 0.1, 0.0)); }
vec2 warpN(vec2 q) { return vec2(noise(q * 0.7 + 3.0), noise(q * 0.7 + 9.0)) * 2.0 - 1.0; }
// The one coastline warp both shaders use, so surf meets the land exactly.
vec2 coastWarp(vec2 p) { return p + (nz(p * 0.45).rb - 0.5) * 0.7; }
`;

/*
 * Live sea, drawn every frame under the baked land: depth colour, swell crests, glints,
 * waves rolling in and surf. Kept to ~10 texture reads; deep water skips the shore work.
 */
const waterFragment = /* glsl */ `${common}
void main() {
  vec2 p = tileCoord();
  // Past the map edge the sea fades to deep water over a few tiles: sampling beyond the edge
  // would repeat the edge tiles as long straight bands, and a hard edge shows as a diamond.
  vec2 pc = clamp(p, vec2(0.0), uSize);
  float beyond = length(p - pc);
  float fade = smoothstep(0.0, 6.0, beyond);
  float land = smp(uMask, coastWarp(pc)).r * (1.0 - smoothstep(0.0, 2.0, beyond));
  // Hidden under baked land: stop before the expensive part.
  if (land > 0.56) { finalColor = vec4(0.3, 0.45, 0.3, 1.0); return; }
  float depthRaw = mix(smp(uDist, pc).r, 1.0, fade);
  float t = uTime;
  float depth = smoothstep(0.0, 0.75, depthRaw);
  vec3 col = mix(vec3(0.24, 0.63, 0.66), vec3(0.09, 0.42, 0.58), smoothstep(0.0, 0.25, depth));
  col = mix(col, vec3(0.05, 0.25, 0.42), smoothstep(0.3, 1.0, depth));
  // Shallows are see-through: the sandy bottom shows through, rippled by caustics.
  float caustic = noise(p * 4.0 + vec2(t * 0.5, -t * 0.35)) * noise(p * 5.5 - vec2(t * 0.4, t * 0.3));
  vec3 bottom = mix(vec3(0.85, 0.78, 0.55), vec3(0.6, 0.55, 0.42), noise(p * 1.7)) * (0.85 + 0.25 * caustic);
  col = mix(col, bottom, (1.0 - smoothstep(0.04, 0.3, depthRaw)) * 0.55);
  // Reef: darker, greener patches in the shallows.
  float reef = smoothstep(0.62, 0.75, noise(p * 4.5 + 4.0)) * (1.0 - smoothstep(0.02, 0.16, depthRaw));
  col = mix(col, vec3(0.16, 0.42, 0.4), reef * 0.15);
  // Height field: domain-warped noise, so crests bend, split and fade like real water.
  // Sun glint comes from its slope: facets turned towards the sun (upper left) flash.
  float h0 = wave(p);
  vec2 grad = vec2(wave(p + vec2(0.15, 0.0)) - h0, wave(p + vec2(0.0, 0.15)) - h0) / 0.15;
  vec3 n = normalize(vec3(-grad * 0.5, 1.0));
  vec3 sunH = normalize(vec3(-0.45, -0.55, 0.7) + vec3(0.0, 0.0, 1.0));
  float glint = pow(max(dot(n, sunH), 0.0), 600.0);
  col += vec3(1.0, 0.95, 0.8) * glint * 0.45 * (1.0 - uFar * 0.8) * (1.0 - depth * 0.4);
  // Crest lines: ridged noise, thin and bright, only where the sea is open.
  float ridge = 1.0 - abs(noise(p * 1.3 + warpN(p)) * 2.0 - 1.0);
  col += vec3(0.6, 0.66, 0.68) * smoothstep(0.96, 0.995, ridge) * 0.07 * (1.0 - uFar) * (0.4 + depth * 0.6);
  // Breaking swells: crests roll in towards the shore, bent by the same height field, and whiten.
  // Distance alone makes parallel bands, so the crest lines are bent by noise and only break in patches.
  float bend = (noise(p * 1.1) - 0.5) * 0.3 + (fbm(p * 0.6) - 0.5) * 0.12;
  float swell = sin((depthRaw + bend) * 19.0 - t * 2.4 + h0 * 6.0);
  float patchy = smoothstep(0.45, 0.8, noise(p * 0.9 + vec2(t * 0.03, 0.0)));
  float breaker = smoothstep(0.75, 1.0, swell) * patchy * (1.0 - smoothstep(0.03, 0.26, depthRaw)) * (1.0 - fade);
  col = mix(col, vec3(0.92, 0.96, 0.95), breaker * 0.5);
  // Ripple rings and a foam collar around offshore rocks (rockAt places the same rocks on the CPU).
  vec2 cell = floor(pc);
  float rh = mod(cell.x * 37.0 + cell.y * 101.0 + cell.x * cell.y * 13.0, 97.0) / 97.0;
  float rd0 = texture(uDist, (cell + 0.5) / uSize).r;
  if (rh < ${ROCK_CHANCE} && rd0 > 0.02 && rd0 < 0.115 && fade < 1.0) {
    vec2 off = vec2(mod(cell.x * 53.0 + cell.y * 29.0 + cell.x * cell.y * 7.0, 89.0) / 89.0,
                    mod(cell.x * 17.0 + cell.y * 61.0 + cell.x * cell.y * 11.0, 83.0) / 83.0) - 0.5;
    float d = length(pc - cell - 0.5 - off * ${ROCK_SPREAD});
    float rings = 0.0;
    for (int k = 0; k < 2; k++) {
      float ph = fract(t * 0.3 + rh * 7.0 + float(k) * 0.5);
      rings += smoothstep(0.035, 0.0, abs(d - 0.12 - ph * 0.26)) * (1.0 - ph);
    }
    rings += smoothstep(0.17, 0.1, d) * (0.6 + 0.4 * noise(p * 9.0 + t));
    col = mix(col, vec3(0.88, 0.94, 0.94), clamp(rings, 0.0, 1.0) * 0.6 * (1.0 - uFar) * (1.0 - fade));
  }
  if (land > 0.01) {
    col = mix(col, vec3(0.5, 0.76, 0.7), smoothstep(0.2, 0.5, land) * 0.5);
    float roll = sin(land * 40.0 - t * 2.2 + fbm(p * 0.8) * 4.0 + noise(p * 0.7) * 6.0) * noise(p * 1.2 + t * 0.05);
    col += vec3(0.2) * smoothstep(0.88, 0.99, roll) * smoothstep(0.02, 0.3, land);
    float wave = 0.32 + 0.06 * sin(t * 1.4 + noise(p * 1.3) * 7.0);
    float foam = smoothstep(wave - 0.04, wave + 0.02, land) * (0.6 + 0.4 * noise(p * 9.0 + t));
    foam = max(foam, smoothstep(0.42, 0.49, land));
    col = mix(col, vec3(0.94, 0.97, 0.96), clamp(foam, 0.0, 1.0) * 0.85);
  }
  finalColor = vec4(pow(col, vec3(0.95)) * vec3(1.04, 1.0, 0.94), 1.0);
}`;

/*
 * Land, rendered once per chunk into a texture (never per frame): grass with patches,
 * tufts and flowers, forest floor or canopy, ridged rock, beach and wet sand, lit by
 * relief. Sea pixels come out transparent so the live water shows through.
 */
const landFragment = /* glsl */ `${common}
float height(vec2 q) { return smp(uDist, q).g * 1.6 + fbm(q * 0.5) * 0.9; }
void main() {
  vec2 p = tileCoord();
  float land = smp(uMask, coastWarp(p)).r;
  if (land < 0.45) { finalColor = vec4(0.0); return; }
  vec2 warp = nz(p * 0.45).rb - 0.5;
  vec2 warp2 = vec2(noise(p * 1.7), noise(p * 1.7 + 13.0)) - 0.5;
  // Inland borders (forest, rock) may wander further than the coast, which must match the tiles.
  vec2 pf = p + warp * 1.2 + warp2 * 0.5;
  // Ground-plane coords aligned to the screen: fine detail here does not zigzag along tile diagonals.
  vec2 g = vec2(vPos.x, vPos.y * 2.0) / 32.0;
  vec4 m = smp(uMask, p + warp * 0.7);

  float n = fbm(p * 0.22);
  vec3 grass = mix(vec3(0.36, 0.6, 0.22), vec3(0.52, 0.7, 0.28), n);
  grass = mix(grass, vec3(0.66, 0.68, 0.34), smoothstep(0.62, 0.8, fbm(p * 0.13 + 7.0)) * 0.7);
  float fine = noise(g * 8.0) * 0.6 + noise(g * 19.0) * 0.4;
  grass *= 0.9 + 0.2 * fine;
  // Blade streaks: thin vertical grain on screen, bent by noise; darker clumps of long grass.
  float streak = noise(vec2(g.x * 1.5 + noise(g * 4.0) * 3.0, g.y * 22.0));
  grass *= 0.93 + 0.14 * streak;
  grass *= 1.0 - 0.08 * smoothstep(0.55, 0.75, noise(g * 2.2 + 5.0));
  // Tufts and flowers as small round dots jittered inside a fine grid.
  vec2 cb = g * 16.0, ib = floor(cb);
  float blade = step(0.8, hash(ib)) * (1.0 - smoothstep(0.08, 0.2, length(fract(cb) - 0.25 - 0.5 * vec2(hash(ib + 1.0), hash(ib + 2.0)))));
  grass = mix(grass, grass * 1.3, blade * 0.6);
  vec2 cf = g * 6.0, iff = floor(cf);
  float dot = 1.0 - smoothstep(0.06, 0.12, length(fract(cf) - 0.3 - 0.4 * vec2(hash(iff + 4.0), hash(iff + 5.0))));
  vec3 flower = mix(vec3(1.0, 0.95, 0.75), vec3(0.95, 0.6, 0.75), hash(iff + 9.0));
  grass = mix(grass, flower, dot * step(0.97, hash(iff + 3.0)) * step(0.6, noise(p * 0.7)) * (1.0 - uFar));
  vec3 col = grass;

  vec3 floorCol = vec3(0.23, 0.38, 0.16) * (0.85 + 0.3 * fine);
  float bumps = noise(p * 4.0) * 0.6 + noise(p * 9.0) * 0.4;
  vec3 canopy = mix(vec3(0.12, 0.27, 0.13), vec3(0.3, 0.48, 0.2), bumps);
  col = mix(col, mix(floorCol, canopy, uFar), smoothstep(0.3, 0.7, smp(uDist, pf).b));

  // Rock: ridged noise gives crevices and ledges; scree and moss where it meets the grass.
  // Highland ground: pale stone with ochre and lichen, gravel, scrub where it meets the grass.
  // Crisp, noise-broken edge: a soft blur reads as smudges.
  float rockEdge = smp(uMask, pf).b + (noise(p * 3.0) - 0.5) * 0.35;
  float rockMask = smoothstep(0.42, 0.5, rockEdge);
  float rockFringe = smoothstep(0.3, 0.44, rockEdge) * (1.0 - rockMask);
  float ridge = 1.0 - abs(noise(p * vec2(2.2, 0.9)) * 2.0 - 1.0);
  vec3 stone = mix(vec3(0.6, 0.58, 0.52), vec3(0.74, 0.71, 0.64), ridge);
  stone = mix(stone, vec3(0.6, 0.5, 0.36), smoothstep(0.55, 0.8, fbm(p * 0.9 + 3.0)) * 0.35);
  stone = mix(stone, vec3(0.62, 0.66, 0.4), smoothstep(0.62, 0.78, noise(g * 2.5 + 9.0)) * 0.45);
  vec2 gb = g * 26.0, gi = floor(gb);
  float pebble = (1.0 - smoothstep(0.1, 0.22, length(fract(gb) - 0.5 - 0.3 * vec2(hash(gi), hash(gi + 7.0))))) * step(0.55, hash(gi + 3.0));
  stone = mix(stone, stone * 0.8 + vec3(0.14), pebble * 0.5);
  stone *= 0.92 + 0.12 * noise(g * 7.0);
  vec3 scrub = mix(vec3(0.42, 0.52, 0.24), vec3(0.5, 0.58, 0.3), noise(g * 5.0));
  col = mix(col, scrub, rockFringe * 0.7);
  col = mix(col, stone, rockMask);

  vec3 sandCol = vec3(0.9, 0.81, 0.58) * (0.94 + 0.12 * noise(g * 10.0));
  sandCol -= 0.03 * sin((p.x + p.y) * 9.0 + noise(p * 2.0) * 4.0);
  // Low threshold: a one-tile beach only reaches ~0.375 after the mask blur.
  // Sand edge: wobbles a little, but stays a wide band so grass never breaks into the beach.
  float sandEdge = m.g + (noise(p * 3.5) - 0.5) * 0.12;
  col = mix(col, sandCol, smoothstep(0.14, 0.34, sandEdge));
  col = mix(col, vec3(0.68, 0.6, 0.42), (1.0 - smoothstep(0.5, 0.58, land)) * 0.8);

  // Relief: height from inland distance plus noise (rock raised), lit from the upper left.
  float h0 = height(p) + rockMask * ridge * 0.4;
  float hx = height(p + vec2(0.35, 0.0)) + smp(uMask, pf + vec2(0.35, 0.0)).b * ridge * 0.4;
  float hy = height(p + vec2(0.0, 0.35)) + smp(uMask, pf + vec2(0.0, 0.35)).b * ridge * 0.4;
  col *= clamp(1.0 + ((hx - h0) * 0.9 + (hy - h0) * 0.35) * 0.9, 0.65, 1.3);

  col = pow(col, vec3(0.95)) * vec3(1.04, 1.0, 0.94);
  // Premultiplied alpha with a soft coastline edge.
  float a = smoothstep(0.45, 0.52, land);
  finalColor = vec4(col * a, a);
}`;

const N = 256;

/** Tileable value noise on an N×N grid with `cells` lattice cells per side. */
function valueNoise(seed: number, cells: number) {
  const r = mulberry32(seed);
  const lattice = Float32Array.from({ length: cells * cells }, r);
  const at = (i: number, j: number) => lattice[(j % cells) * cells + (i % cells)];
  const out = new Float32Array(N * N);
  const step = N / cells;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const fx = x / step;
      const fy = y / step;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = (fx - i) * (fx - i) * (3 - 2 * (fx - i));
      const ty = (fy - j) * (fy - j) * (3 - 2 * (fy - j));
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
      const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
      out[y * N + x] = a + (b - a) * ty;
    }
  return out;
}

/**
 * Noise baked once instead of hashed per pixel: far cheaper on the GPU, and mipmaps
 * stop high-frequency detail from shimmering when zoomed out.
 */
function bakeNoise() {
  const fbm = (seed: number) => {
    const o = [8, 16, 32, 64].map((c, k) => valueNoise(seed + k, c));
    return o[0].map((_, i) => o[0][i] * 0.5 + o[1][i] * 0.25 + o[2][i] * 0.125 + o[3][i] * 0.0625);
  };
  const r = fbm(1);
  const g = valueNoise(9, 64);
  const b = fbm(11);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) data.set([r[i] * 255, g[i] * 255, b[i] * 255, 255], i * 4);
  return new BufferImageSource({
    resource: data,
    width: N,
    height: N,
    format: 'rgba8unorm',
    scaleMode: 'linear',
    mipmapFilter: 'linear',
    autoGenerateMipmaps: true,
    addressMode: 'repeat',
  });
}

/**
 * Two passes of a 3×3 [1 2 1] blur. Binary tile masks blurred like this have a 0.5
 * contour that rounds staircase corners into smooth diagonals.
 */
function blur(src: Float32Array, W: number, H: number) {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const h = new Float32Array(W * H);
    const v = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        h[i] = (a[x > 0 ? i - 1 : i] + 2 * a[i] + a[x < W - 1 ? i + 1 : i]) / 4;
      }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        v[i] = (h[y > 0 ? i - W : i] + 2 * h[i] + h[y < H - 1 ? i + W : i]) / 4;
      }
    a = v;
  }
  return a;
}

/**
 * Chamfer distance (two raster passes, weights 1 and √2): close to Euclidean. A plain
 * 4-neighbour BFS measures Manhattan distance, whose kinks show up as straight bright
 * or dark lines across the sea.
 */
function distance(W: number, H: number, src: (i: number) => boolean) {
  const D = Math.SQRT2;
  const dist = new Float32Array(W * H).fill(1e9);
  for (let i = 0; i < W * H; i++) if (src(i)) dist[i] = 0;
  const at = (x: number, y: number) => dist[y * W + x];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let d = dist[i];
      if (x > 0) d = Math.min(d, at(x - 1, y) + 1);
      if (y > 0) d = Math.min(d, at(x, y - 1) + 1);
      if (x > 0 && y > 0) d = Math.min(d, at(x - 1, y - 1) + D);
      if (x < W - 1 && y > 0) d = Math.min(d, at(x + 1, y - 1) + D);
      dist[i] = d;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let d = dist[i];
      if (x < W - 1) d = Math.min(d, at(x + 1, y) + 1);
      if (y < H - 1) d = Math.min(d, at(x, y + 1) + 1);
      if (x < W - 1 && y < H - 1) d = Math.min(d, at(x + 1, y + 1) + D);
      if (x > 0 && y < H - 1) d = Math.min(d, at(x - 1, y + 1) + D);
      dist[i] = d;
    }
  return dist;
}

/** The whole ground and sea as one shaded quad. `setForest` updates a tile after clearing. */
export function createGround(map: GameMap) {
  const { width: W, height: H, tiles } = map;
  const mask = new Uint8Array(W * H * 4);
  const dist = new Uint8Array(W * H * 4);
  const toSea = distance(W, H, (i) => tiles[i] !== 'water');
  /**
   * Offshore rock on water tile (x, y), 1.4–2 tiles from land: [u, v, scale] within the tile, or null.
   * Integer-exact hash so the sea shader finds the same rocks for their ripple rings.
   */
  const rockAt = (x: number, y: number): [number, number, number] | null => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const i = y * W + x;
    if (tiles[i] !== 'water' || toSea[i] < 1.2 || toSea[i] > 2.01) return null;
    if (((x * 37 + y * 101 + x * y * 13) % 97) / 97 >= ROCK_CHANCE) return null;
    const u = ((x * 53 + y * 29 + x * y * 7) % 89) / 89 - 0.5;
    const v = ((x * 17 + y * 61 + x * y * 11) % 83) / 83 - 0.5;
    return [0.5 + u * ROCK_SPREAD, 0.5 + v * ROCK_SPREAD, 0.45 + ((x * y) % 7) * 0.06];
  };
  const toShore = distance(W, H, (i) => tiles[i] === 'water' || tiles[i] === 'beach');
  const is = (k: string) => Float32Array.from(tiles, (t) => (t === k ? 1 : 0));
  const land = blur(
    Float32Array.from(tiles, (t) => (t === 'water' ? 0 : 1)),
    W,
    H,
  );
  const sand = blur(is('beach'), W, H);
  const rock = blur(is('mountain'), W, H);
  const forestRaw = is('forest');
  // Alpha stays 255 in both: a zero alpha would wipe the other channels (premultiplied upload).
  const packForest = () => blur(forestRaw, W, H).forEach((v, i) => (dist[i * 4 + 2] = v * 255));
  tiles.forEach((_, i) => {
    mask.set([land[i] * 255, sand[i] * 255, rock[i] * 255, 255], i * 4);
    dist.set([Math.min(255, (toSea[i] - 1) * 28), Math.min(255, toShore[i] * 22), 0, 255], i * 4);
  });
  packForest();
  const opts = { width: W, height: H, format: 'rgba8unorm' as const, scaleMode: 'linear' as const };
  const maskSrc = new BufferImageSource({ resource: mask, ...opts, addressMode: 'clamp-to-edge' });
  const distSrc = new BufferImageSource({ resource: dist, ...opts, addressMode: 'clamp-to-edge' });

  const resources = (name: string) => ({
    uMask: maskSrc,
    uDist: distSrc,
    uNoise: noise,
    [name]: {
      uSize: { value: new Float32Array([W, H]), type: 'vec2<f32>' },
      uTime: { value: 0, type: 'f32' },
      uFar: { value: 0, type: 'f32' },
    },
  });
  const noise = bakeNoise();
  // highp: positions are thousands of world pixels, and phones' mediump (16-bit) turns them into blocks.
  const waterShader = Shader.from({
    gl: { vertex, fragment: waterFragment, name: 'water', preferredFragmentPrecision: 'highp' },
    resources: resources('water'),
  });
  const landShader = Shader.from({
    gl: { vertex, fragment: landFragment, name: 'land', preferredFragmentPrecision: 'highp' },
    resources: resources('land'),
  });

  // Map diamond plus a wide margin of open sea.
  const M = 6000;
  const quad = (x0: number, y0: number, x1: number, y1: number) =>
    new Geometry({ attributes: { aPosition: [x0, y0, x1, y0, x1, y1, x0, y1] }, indexBuffer: [0, 1, 2, 0, 2, 3] });
  const water = new Mesh({
    geometry: quad(-H * (TILE_W / 2) - M, -M, W * (TILE_W / 2) + M, (W + H) * (TILE_H / 2) + M),
    shader: waterShader,
  });
  const wu = waterShader.resources.water.uniforms;

  return {
    water,
    rockAt,
    update(dt: number, far: number) {
      wu.uTime += dt;
      wu.uFar = far;
    },
    /** A mesh covering tiles [x0, x1) × [y0, y1), to render that chunk's land once. */
    landMesh(x0: number, y0: number, x1: number, y1: number, far: number) {
      landShader.resources.land.uniforms.uFar = far;
      const pt = (x: number, y: number) => [((x - y) * TILE_W) / 2, ((x + y) * TILE_H) / 2];
      const geometry = new Geometry({
        attributes: { aPosition: [...pt(x0, y0), ...pt(x1, y0), ...pt(x1, y1), ...pt(x0, y1)] },
        indexBuffer: [0, 1, 2, 0, 2, 3],
      });
      return new Mesh({ geometry, shader: landShader });
    },
    /** Forest gone from these tiles (cleared for building). */
    clearForest(tiles: [number, number][]) {
      if (!tiles.some(([x, y]) => forestRaw[y * W + x])) return;
      for (const [x, y] of tiles) forestRaw[y * W + x] = 0;
      packForest();
      distSrc.update();
    },
  };
}

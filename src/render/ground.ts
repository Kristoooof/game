import { BufferImageSource, Geometry, Mesh, Shader } from 'pixi.js';
import type { GameMap } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { TILE_H, TILE_W } from './iso';

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
  float land = smp(uMask, coastWarp(p)).r;
  // Hidden under baked land: stop before the expensive part.
  if (land > 0.56) { finalColor = vec4(0.3, 0.45, 0.3, 1.0); return; }
  float depthRaw = smp(uDist, p).r;
  float t = uTime;
  float depth = smoothstep(0.0, 0.75, depthRaw);
  vec3 col = mix(vec3(0.24, 0.63, 0.66), vec3(0.09, 0.42, 0.58), smoothstep(0.0, 0.25, depth));
  col = mix(col, vec3(0.05, 0.25, 0.42), smoothstep(0.3, 1.0, depth));
  // Short, broken swell crests running diagonally, fading in and out in patches.
  float w = sin(p.x * 1.3 + p.y * 0.5 + t * 1.1 + fbm(p * 0.3 + t * 0.04) * 7.0);
  float patch = smoothstep(0.45, 0.7, noise(p * 0.35 + vec2(t * 0.05, 0.0)));
  col += vec3(0.07, 0.09, 0.1) * smoothstep(0.9, 1.0, w) * patch * (0.3 + depth * 0.7);
  float glint = noise(p * 5.0 + vec2(t * 0.9, t * 0.3));
  col += vec3(0.6) * smoothstep(0.82, 0.9, glint) * depth * (1.0 - uFar * 0.8);
  if (land > 0.01) {
    col = mix(col, vec3(0.5, 0.76, 0.7), smoothstep(0.2, 0.5, land) * 0.5);
    float roll = sin(land * 40.0 - t * 2.2 + fbm(p * 0.8) * 4.0);
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
  // Crisp, noise-broken edges: a soft blur reads as smudges, not terrain.
  float rockEdge = smp(uMask, pf).b + (noise(p * 3.0) - 0.5) * 0.35;
  float rockMask = smoothstep(0.42, 0.5, rockEdge);
  float rockRim = smoothstep(0.36, 0.44, rockEdge) - rockMask;
  float ridge = 1.0 - abs(noise(p * vec2(2.2, 0.9)) * 2.0 - 1.0);
  float strata = 0.5 + 0.5 * sin((p.x - p.y) * 6.0 + fbm(p * 1.2) * 8.0);
  vec3 rock = mix(vec3(0.5, 0.47, 0.42), vec3(0.7, 0.66, 0.6), ridge * 0.7 + strata * 0.3);
  rock = mix(rock, vec3(0.3, 0.27, 0.24), smoothstep(0.75, 0.95, 1.0 - ridge) * 0.6);
  rock *= 0.88 + 0.24 * noise(g * 6.0);
  // Stony grain and thin cracks where the ridged noise dips to its midline.
  rock *= 0.8 + 0.4 * smoothstep(0.6, 0.9, noise(g * 14.0));
  rock *= 1.0 - 0.3 * smoothstep(0.03, 0.0, abs(noise(p * 5.0) - 0.5));
  vec3 scree = mix(vec3(0.5, 0.47, 0.4), vec3(0.42, 0.45, 0.32), noise(g * 3.0));
  col = mix(col, scree, smoothstep(0.3, 0.5, rockEdge) * (1.0 - rockMask) * 0.8);
  col = mix(col, vec3(0.5, 0.47, 0.43), rockRim * 0.5);
  col = mix(col, rock, rockMask);

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

/** Multi-source BFS distance (in tiles, 4-neighbour) from every tile where `src` is true. */
function distance(W: number, H: number, src: (i: number) => boolean) {
  const dist = new Float32Array(W * H).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++)
    if (src(i)) {
      dist[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
      if (j >= 0 && dist[j] === Infinity) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
  }
  return dist;
}

/** The whole ground and sea as one shaded quad. `setForest` updates a tile after clearing. */
export function createGround(map: GameMap) {
  const { width: W, height: H, tiles } = map;
  const mask = new Uint8Array(W * H * 4);
  const dist = new Uint8Array(W * H * 4);
  const toSea = distance(W, H, (i) => tiles[i] !== 'water');
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
  const waterShader = Shader.from({
    gl: { vertex, fragment: waterFragment, name: 'water' },
    resources: resources('water'),
  });
  const landShader = Shader.from({
    gl: { vertex, fragment: landFragment, name: 'land' },
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

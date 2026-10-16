import { BufferImageSource, Geometry, Mesh, Shader } from 'pixi.js';
import { type GameMap, levelAt, terrainAt } from '../sim/map';
import { mulberry32 } from '../sim/rng';
import { LEVEL_H, MAX_LEVEL, TILE_H, TILE_W } from './iso';

/** Largest offshore rock, in tiles across its foam collar; the rock texture stores size / ROCK_MAX. */
const ROCK_MAX = 1.2;

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
uniform vec3 uAmbient;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform sampler2D uRocks;
uniform sampler2D uRiver;
uniform sampler2D uLevel;

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
// Screen-space world pixels back to continuous tile coordinates (at sea level).
vec2 toTile(vec2 v) {
  return vec2(v.x / ${TILE_W.toFixed(1)} + v.y / ${TILE_H.toFixed(1)}, v.y / ${TILE_H.toFixed(1)} - v.x / ${TILE_W.toFixed(1)});
}
vec2 tileCoord() { return toTile(vPos); }
// Terrace level at tile point p (uLevel r = level / MAX_LEVEL), its edge warped so terraces wander.
float levelAt(vec2 p) { return smp(uLevel, p + (nz(p * 0.5).gb - 0.5) * 0.5).r * ${MAX_LEVEL.toFixed(1)}; }
/*
 * What the eye meets at world pixel v on raised ground: (tile point, level, k). k = 0 is the top
 * of a terrace; k in (0, 1] is a cliff face, k of the way down from its top edge to the level below.
 * Searched from the highest terrace down: a higher one hides what lies behind it.
 */
vec4 surface(vec2 v) {
  for (int l = ${MAX_LEVEL}; l >= 1; l--) {
    float fl = float(l);
    for (int k = 0; k <= SURFACE_STEPS; k++) {
      vec2 p = toTile(v + vec2(0.0, (fl - float(k) / float(SURFACE_STEPS)) * ${LEVEL_H.toFixed(1)}));
      if (levelAt(p) > fl - 0.5) return vec4(p, fl, float(k) / float(SURFACE_STEPS));
    }
  }
  return vec4(toTile(v), 0.0, 0.0);
}
// A river on raised ground within a few tiles of p? Elsewhere the land hides the sea layer anyway.
bool nearTerrace(vec2 p) { return texture(uLevel, (floor(p) + 0.5) / uSize).b > 0.0; }
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
// Live every frame: a coarser terrace search is enough under the baked land.
const waterFragment = /* glsl */ `#define SURFACE_STEPS 8
${common}
void main() {
  vec2 p = tileCoord();
  float t = uTime;
  // On raised ground, rivers lie on their terrace; where one goes over a cliff, it falls.
  float lift = 0.0;
  if (nearTerrace(p)) {
    vec4 sf = surface(vPos);
    if (sf.z > 0.5) {
      if (sf.w > 0.0) {
        // Waterfall (the land shader leaves the cliff open only where a river crosses its edge):
        // streaks pouring down, a smooth glassy lip at the top, white water at the foot.
        float a = noise(vec2(vPos.x * 0.35, vPos.y * 0.05 - t * 2.6));
        float b = noise(vec2(vPos.x * 0.9 + 5.0, vPos.y * 0.09 - t * 3.8));
        vec3 c = mix(vec3(0.45, 0.7, 0.75), vec3(0.95, 0.98, 0.98), smoothstep(0.35, 0.75, a) * 0.8 + smoothstep(0.6, 0.9, b) * 0.4);
        c = mix(c, vec3(0.32, 0.58, 0.6), smoothstep(0.15, 0.0, sf.w) * 0.6);
        c = mix(c, vec3(0.97, 0.99, 0.99), smoothstep(0.7, 1.0, sf.w) * (0.7 + 0.3 * noise(vPos * 0.3 + t * 2.0)));
        finalColor = vec4(pow(c, vec3(0.95)) * vec3(1.04, 1.0, 0.94) * uAmbient, 1.0);
        return;
      }
      p = sf.xy;
      lift = sf.z;
    }
  }
  // Past the map edge the sea fades to deep water over a few tiles: sampling beyond the edge
  // would repeat the edge tiles as long straight bands, and a hard edge shows as a diamond.
  vec2 pc = clamp(p, vec2(0.0), uSize);
  float beyond = length(p - pc);
  float fade = smoothstep(0.0, 6.0, beyond);
  float land = smp(uMask, coastWarp(pc)).r * (1.0 - smoothstep(0.0, 2.0, beyond));
  // Hidden under baked land: stop before the expensive part.
  if (land > 0.56) { finalColor = vec4(0.3, 0.45, 0.3, 1.0); return; }
  float depthRaw = mix(smp(uDist, pc).r, 1.0, fade);
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
  col += uSun * glint * 0.45 * (1.0 - uFar * 0.8) * (1.0 - depth * 0.4);
  // Crest lines: ridged noise, thin and bright, only where the sea is open.
  float ridge = 1.0 - abs(noise(p * 1.3 + warpN(p)) * 2.0 - 1.0);
  col += vec3(0.6, 0.66, 0.68) * smoothstep(0.96, 0.995, ridge) * 0.07 * (1.0 - uFar) * (0.4 + depth * 0.6);
  // Breaking swells: crests roll in towards the shore, bent by the same height field, and whiten.
  // Distance alone makes parallel bands, so the crest lines are bent by noise and only break in patches.
  float bend = (noise(p * 1.1) - 0.5) * 0.3 + (fbm(p * 0.6) - 0.5) * 0.12;
  float swell = sin((depthRaw + bend) * 19.0 - t * 2.4 + h0 * 6.0);
  float patchy = smoothstep(0.45, 0.8, noise(p * 0.9 + vec2(t * 0.03, 0.0)));
  float breaker = smoothstep(0.75, 1.0, swell) * (1.0 - smoothstep(0.1, 0.4, smp(uRiver, pc).r)) * patchy * (1.0 - smoothstep(0.03, 0.26, depthRaw)) * (1.0 - fade);
  col = mix(col, vec3(0.92, 0.96, 0.95), breaker * 0.5);
  // Offshore rocks (uRocks: r size, gb position in the tile): foam collar and ripple rings.
  // The 3×3 neighbourhood, so a big rock's rings are not cut at its tile's edge.
  if (depthRaw < 0.45 && fade < 1.0 && uFar < 1.0) {
    float rings = 0.0;
    vec2 c0 = floor(pc);
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec2 cell = c0 + vec2(float(i), float(j));
        vec4 rk = texture(uRocks, (cell + 0.5) / uSize);
        if (rk.r < 0.01) continue;
        float rad = rk.r * ${(ROCK_MAX * 0.75).toFixed(3)};
        float d = length(pc - cell - rk.gb);
        float seed = fract(cell.x * 0.37 + cell.y * 0.61);
        for (int k = 0; k < 2; k++) {
          float ph = fract(t * 0.3 + seed * 7.0 + float(k) * 0.5);
          rings += smoothstep(0.035, 0.0, abs(d - rad - 0.04 - ph * 0.4)) * (1.0 - ph) * 0.8;
        }
        rings += smoothstep(rad + 0.08, rad - 0.02, d) * (0.6 + 0.4 * noise(p * 9.0 + t));
      }
    col = mix(col, vec3(0.88, 0.94, 0.94), clamp(rings, 0.0, 1.0) * 0.6 * (1.0 - uFar) * (1.0 - fade));
  }
  // Rivers (uRiver: r coverage, gb flow direction): fresh water with streaks running downstream.
  vec4 rv = smp(uRiver, pc);
  float river = smoothstep(0.2, 0.6, rv.r);
  if (river > 0.0) {
    // Flow map: two layers of noise carried downstream, each restarting while the other is
    // at full strength, so the pattern flows along bends and banks without stretching.
    vec2 f = (rv.gb * 2.0 - 1.0) * 1.4;
    float ph0 = fract(t * 0.3);
    float ph1 = fract(t * 0.3 + 0.5);
    float w = abs(ph0 - 0.5) * 2.0;
    float s1 = mix(noise(p * 2.4 - f * ph0 * 2.4), noise(p * 2.4 - f * ph1 * 2.4 + 0.37), w);
    float s2 = mix(noise(p * 6.0 - f * ph0 * 6.0 + 3.0), noise(p * 6.0 - f * ph1 * 6.0 + 7.3), w);
    vec3 rc = mix(vec3(0.15, 0.4, 0.43), vec3(0.27, 0.56, 0.54), s1);
    rc += vec3(0.55, 0.6, 0.6) * smoothstep(0.62, 0.85, s2) * 0.35;
    // White water where it lands at the foot of a cliff.
    float foot = smoothstep(0.12, 0.45, smp(uLevel, pc).r * ${MAX_LEVEL.toFixed(1)} - lift);
    rc = mix(rc, vec3(0.93, 0.97, 0.97), foot * (0.6 + 0.4 * s2));
    col = mix(col, rc, river);
  }
  if (land > 0.01) {
    col = mix(col, vec3(0.5, 0.76, 0.7), smoothstep(0.2, 0.5, land) * 0.5 * (1.0 - river));
    float roll = sin(land * 40.0 - t * 2.2 + fbm(p * 0.8) * 4.0 + noise(p * 0.7) * 6.0) * noise(p * 1.2 + t * 0.05);
    col += vec3(0.2) * smoothstep(0.88, 0.99, roll) * smoothstep(0.02, 0.3, land);
    float wave = 0.32 + 0.06 * sin(t * 1.4 + noise(p * 1.3) * 7.0);
    float foam = smoothstep(wave - 0.04, wave + 0.02, land) * (0.6 + 0.4 * noise(p * 9.0 + t));
    foam = max(foam, smoothstep(0.42, 0.49, land));
    // In a river only a thin rim of foam along the banks.
    col = mix(col, vec3(0.94, 0.97, 0.96), clamp(foam, 0.0, 1.0) * 0.85 * (1.0 - river * 0.85));
  }
  col = pow(col, vec3(0.95)) * vec3(1.04, 1.0, 0.94) * uAmbient;
  // Moonlight: a glittering column under the moon (uMoon: world x, half width, strength).
  if (uMoon.z > 0.0) {
    float mx = (vPos.x - uMoon.x) / uMoon.y;
    float path = exp(-mx * mx) * (0.6 + 0.4 * noise(p * 0.5 + t * 0.05));
    float mg = pow(max(dot(n, normalize(vec3(0.0, -0.3, 1.0))), 0.0), 50.0);
    col += vec3(0.75, 0.82, 0.95) * path * (0.06 + mg * 0.8) * uMoon.z * (1.0 - smoothstep(0.1, 0.4, land));
  }
  finalColor = vec4(col, 1.0);
}`;

/*
 * Land, rendered once per chunk into a texture (never per frame): grass with patches,
 * tufts and flowers, forest floor or canopy, ridged rock, beach and wet sand, lit by
 * relief. Sea pixels come out transparent so the live water shows through.
 */
// Baked once per chunk: a fine terrace search, for smooth cliff edges.
const landFragment = /* glsl */ `#define SURFACE_STEPS 20
${common}
// Inland rise, small bumps, rolling hills, and dune ridges where the sand is wide.
float height(vec2 q) {
  float sand = smp(uMask, q).g;
  // Ridged, warped noise: crests that bend, fork and fade, not parallel stripes.
  float crest = 1.0 - abs(noise(q * 0.8 + warpN(q * 0.6) * 1.5) * 2.0 - 1.0);
  float dune = sand * sand * crest * crest * 0.9;
  return smp(uDist, q).g * 1.6 + fbm(q * 0.5) * 0.9 + smoothstep(0.3, 0.8, fbm(q * 0.1 + 11.0)) * 9.0 + dune;
}
void main() {
  vec4 sf = surface(vPos);
  vec2 p = sf.xy;
  if (sf.w > 0.0) {
    // Cliff face of a terrace. Where a river runs over its edge it is left open: the live
    // water shader draws the waterfall there.
    // Opened with a soft edge: a hard cut leaves the fall's sides jagged.
    float open = smoothstep(0.35, 0.65, smp(uRiver, p).r);
    if (open > 0.99) { finalColor = vec4(0.0); return; }
    // Facing: the slope of the level field, lit from the upper left like everything else.
    vec2 gl = vec2(levelAt(p + vec2(0.25, 0.0)) - levelAt(p - vec2(0.25, 0.0)), levelAt(p + vec2(0.0, 0.25)) - levelAt(p - vec2(0.0, 0.25)));
    vec2 nrm = length(gl) > 0.001 ? -normalize(gl) : vec2(0.7);
    float shade = 0.82 + 0.28 * (nrm.y - nrm.x) * 0.5;
    float strata = noise(vec2(vPos.x * 0.04, vPos.y * 0.45));
    float cracks = noise(vec2(vPos.x * 0.55, vPos.y * 0.07));
    vec3 c = mix(vec3(0.5, 0.45, 0.38), vec3(0.68, 0.62, 0.52), strata);
    c *= 0.82 + 0.3 * smoothstep(0.3, 0.7, cracks);
    c *= mix(1.05, 0.68, sf.w);
    // A lip of grass hanging over the top edge.
    c = mix(c, vec3(0.3, 0.47, 0.2), smoothstep(0.14, 0.02, sf.w) * 0.85);
    c *= shade;
    finalColor = vec4(pow(c, vec3(0.95)) * vec3(1.04, 1.0, 0.94) * (1.0 - open), 1.0 - open);
    return;
  }
  // Ground-plane point of this pixel on its terrace: fine detail stays fixed to the ground.
  vec2 vg = vPos + vec2(0.0, sf.z * ${LEVEL_H.toFixed(1)});
  float land = smp(uMask, coastWarp(p)).r;
  if (land < 0.45) { finalColor = vec4(0.0); return; }
  vec2 warp = nz(p * 0.45).rb - 0.5;
  vec2 warp2 = vec2(noise(p * 1.7), noise(p * 1.7 + 13.0)) - 0.5;
  // Inland borders (forest, rock) may wander further than the coast, which must match the tiles.
  vec2 pf = p + warp * 1.2 + warp2 * 0.5;
  // Ground-plane coords aligned to the screen: fine detail here does not zigzag along tile diagonals.
  vec2 g = vec2(vg.x, vg.y * 2.0) / 32.0;
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
  // Meadows: patches of the island thick with poppies, buttercups, cornflowers and daisies.
  float meadow = smoothstep(0.55, 0.7, fbm(p * 0.06 + 31.0));
  grass = mix(grass, grass * vec3(1.05, 1.08, 0.9), meadow * 0.5);
  float fh = hash(iff + 9.0);
  vec3 flower = fh < 0.25 ? vec3(0.88, 0.2, 0.15) : fh < 0.5 ? vec3(0.98, 0.85, 0.25) : fh < 0.75 ? vec3(0.55, 0.45, 0.9) : vec3(1.0, 0.97, 0.9);
  flower = mix(mix(vec3(1.0, 0.95, 0.75), vec3(0.95, 0.6, 0.75), fh), flower, meadow);
  float bloom = step(mix(0.97, 0.55, meadow), hash(iff + 3.0)) * max(step(0.6, noise(p * 0.7)), meadow);
  grass = mix(grass, flower, dot * bloom * (1.0 - uFar));
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
  // Marram grass in tufts on the dunes.
  sandCol = mix(sandCol, vec3(0.56, 0.6, 0.32), blade * smoothstep(0.75, 0.9, m.g) * step(0.5, noise(p * 1.3)) * 0.7);
  float sandEdge = m.g + (noise(p * 3.5) - 0.5) * 0.12;
  col = mix(col, sandCol, smoothstep(0.14, 0.34, sandEdge));
  col = mix(col, vec3(0.68, 0.6, 0.42), (1.0 - smoothstep(0.5, 0.58, land)) * 0.8);

  // Terraces read from above: a pale rim along the top of each cliff, shade along its foot.
  float lv = levelAt(p);
  col *= 1.0 + 0.12 * smoothstep(0.35, 0.0, lv - (sf.z - 0.5)) * step(0.5, sf.z);
  col *= 1.0 - 0.3 * smoothstep(0.0, 0.4, levelAt(p - vec2(0.35)) - (sf.z + 0.5) + 0.4);

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
  const toSea = distance(W, H, (i) => tiles[i] !== 'water' && tiles[i] !== 'river');
  /**
   * Offshore rocks, in clusters: many in some stretches of coast, almost none elsewhere; mostly
   * small with the odd big one further out. [u, v, size, variant] per water tile, or null.
   */
  const rocks: ([number, number, number, number] | null)[] = new Array(W * H).fill(null);
  {
    const r = mulberry32(4242);
    const C = 10;
    const cw = Math.ceil(W / C) + 2;
    const lattice = Float32Array.from({ length: cw * (Math.ceil(H / C) + 2) }, r);
    const cluster = (x: number, y: number) => {
      const fx = x / C;
      const fy = y / C;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = (fx - i) * (fx - i) * (3 - 2 * (fx - i));
      const ty = (fy - j) * (fy - j) * (3 - 2 * (fy - j));
      const at = (a: number, b: number) => lattice[b * cw + a];
      const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
      const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
      return top + (bottom - top) * ty;
    };
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const d = toSea[i];
        if (tiles[i] !== 'water' || d < 1.2 || d > 4.5) continue;
        const dense = Math.max(0, cluster(x, y) - 0.45) / 0.55;
        if (r() > dense * dense * 0.75 + 0.004) continue;
        // Squared: more small rocks than big; big ones only away from the beach.
        let size = 0.2 + r() ** 2 * 0.95;
        if (d < 2.1) size = Math.min(size, 0.45);
        // Neighbours must leave room: no two rocks touching where either is big.
        const near = [i - 1, i - W, i - W - 1, i - W + 1].some((k) => rocks[k] && (rocks[k]![2] > 0.35 || size > 0.35));
        if (near) continue;
        rocks[i] = [0.35 + r() * 0.3, 0.35 + r() * 0.3, size, Math.floor(r() * 6)];
      }
  }
  const rockAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : rocks[y * W + x]);
  const rockData = new Uint8Array(W * H * 4);
  rocks.forEach((k, i) => {
    if (k) rockData.set([(k[2] / ROCK_MAX) * 255, k[0] * 255, k[1] * 255, 255], i * 4);
    else rockData[i * 4 + 3] = 255;
  });
  const toShore = distance(W, H, (i) => tiles[i] === 'water' || tiles[i] === 'beach');
  const is = (k: string) => Float32Array.from(tiles, (t) => (t === k ? 1 : 0));
  const land = blur(
    Float32Array.from(tiles, (t) => (t === 'water' ? 0 : 1)),
    W,
    H,
  );
  // Rivers are cut in after the blur, sharp: blurred, the inside of every bend would flood into a pond.
  tiles.forEach((t, i) => {
    if (t === 'river') land[i] = Math.min(land[i], 0.15);
  });
  const sand = blur(is('beach'), W, H);
  const rock = blur(
    Float32Array.from(tiles, (t) => (t === 'mountain' || t === 'rocky' ? 1 : 0)),
    W,
    H,
  );
  // Rivers: coverage, and the direction to the next tile downstream (distance to the sea along the river).
  const riverData = new Uint8Array(W * H * 4);
  {
    const down = new Int32Array(W * H).fill(-1);
    const queue: number[] = [];
    tiles.forEach((t, i) => {
      if (t !== 'water') return;
      down[i] = 0;
      queue.push(i);
    });
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (const j of [i + 1, i - 1, i + W, i - W])
        if (j >= 0 && j < W * H && tiles[j] === 'river' && down[j] < 0) {
          down[j] = down[i] + 1;
          queue.push(j);
        }
    }
    const cover = blur(is('river'), W, H).map((v, i) => (tiles[i] === 'river' ? 1 : v));
    // Downstream step of each river tile, then averaged over its surroundings: the flow turns
    // smoothly through bends and keeps its direction out to the banks.
    const fx = new Float32Array(W * H);
    const fy = new Float32Array(W * H);
    tiles.forEach((t, i) => {
      if (t !== 'river') return;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = i + dx + dy * W;
        if (down[j] >= 0 && down[j] < down[i]) [fx[i], fy[i]] = [dx, dy];
      }
    });
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let sx = 0;
        let sy = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const u = x + dx;
            const v = y + dy;
            if (u < 0 || v < 0 || u >= W || v >= H) continue;
            sx += fx[v * W + u];
            sy += fy[v * W + u];
          }
        const len = Math.hypot(sx, sy) || 1;
        const i = y * W + x;
        riverData.set([cover[i] * 255, (sx / len) * 127.5 + 127.5, (sy / len) * 127.5 + 127.5, 255], i * 4);
      }
  }
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
  // Terraces: r level (blurred), g the highest level within three tiles, b raised ground and a
  // river within three tiles: the only places the sea shader has to search the terraces.
  const levels = map.levels ?? new Uint8Array(W * H);
  // Blurred: unblurred, a diagonal edge is a staircase of tiny cliffs facing alternate ways.
  const smoothLevels = blur(
    Float32Array.from(levels, (v) => v / MAX_LEVEL),
    W,
    H,
  );
  const levelData = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let top = 0;
      let river = false;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          top = Math.max(top, levelAt(map, x + dx, y + dy));
          river ||= terrainAt(map, x + dx, y + dy) === 'river';
        }
      const search = top > 0 && river ? 255 : 0;
      levelData.set([smoothLevels[y * W + x] * 255, (top / MAX_LEVEL) * 255, search, 255], (y * W + x) * 4);
    }
  const levelSrc = new BufferImageSource({ resource: levelData, ...opts, addressMode: 'clamp-to-edge' });
  const rockSrc = new BufferImageSource({ resource: rockData, ...opts, addressMode: 'clamp-to-edge' });
  const riverSrc = new BufferImageSource({ resource: riverData, ...opts, addressMode: 'clamp-to-edge' });

  const resources = (name: string) => ({
    uMask: maskSrc,
    uDist: distSrc,
    uRocks: rockSrc,
    uRiver: riverSrc,
    uLevel: levelSrc,
    uNoise: noise,
    [name]: {
      uSize: { value: new Float32Array([W, H]), type: 'vec2<f32>' },
      uTime: { value: 0, type: 'f32' },
      uFar: { value: 0, type: 'f32' },
      uAmbient: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
      uSun: { value: new Float32Array([1, 0.95, 0.8]), type: 'vec3<f32>' },
      uMoon: { value: new Float32Array([0, 1, 0]), type: 'vec3<f32>' },
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
    /** Time-of-day light on the sea: colour multiplier, sun glint colour, moon column (world x, half width, strength). */
    light(ambient: number[], sun: number[], moon: number[]) {
      wu.uAmbient.set(ambient);
      wu.uSun.set(sun);
      wu.uMoon.set(moon);
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

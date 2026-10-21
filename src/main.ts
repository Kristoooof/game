import {
  Application,
  Container,
  Graphics,
  Matrix,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  type WebGLRenderer,
} from 'pixi.js';
import { BUILDINGS, GOOD_NAMES, type Good } from './data/buildings';
import pelda from './data/maps/pelda.txt?raw';
import { chimneyAt, drawBuilding, drawTerritory } from './render/buildings';
import { createEffects } from './render/effects';
import { attachCameraControls, screenToWorld, type Camera } from './render/camera';
import { diamond, groundToScreen, screenToGround, setLevels, tileToScreen } from './render/iso';
import { createTerrain, FAR_SCALE } from './render/terrain';
import { type GameMap, type Terrain, generateMap, levelAt, parseMap, terrainAt } from './sim/map';
import { buildingAt, createWorld, demolish, islandOf, place, placementError, roadPath } from './sim/world';
import { CAP, tick, TICK, trouble } from './sim/economy';
import { costText, createBuildMenu, type Tool } from './ui/buildMenu';
import { createAtmosphere, type Weather } from './render/atmosphere';
import { createConstruction } from './render/construction';
import { createLife } from './render/life';
import { daylight } from './render/daylight';
import { createFpsCounter, createSettingsPanel, loadSettings, resolutionOf } from './ui/settings';
import { createFxaa } from './render/fxaa';
import { createWind } from './render/wind';

const MAPS: Record<string, string> = { pelda };
const TERRAIN_NAMES: Record<Terrain, string> = {
  water: 'Víz',
  beach: 'Part',
  grass: 'Fű',
  forest: 'Erdő',
  mountain: 'Hegy',
  rocky: 'Sziklás part',
  river: 'Folyó',
};

// ?map=pelda loads a hand-made map, ?seed=123 a generated one; otherwise a random seed.
const params = new URLSearchParams(location.search);
const mapName = params.get('map') ?? '';
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e6);
const map: GameMap = MAPS[mapName] ? parseMap(MAPS[mapName]) : generateMap(seed);
// Everything placed on the ground is raised to its tile's terrace.
setLevels((x, y) => levelAt(map, x, y));
const world = createWorld(map);

const hud = document.getElementById('hud')!;
const resources = document.getElementById('resources')!;
const mapLabel = MAPS[mapName] ? `Térkép: ${mapName}` : `Seed: ${seed}`;
const say = (msg = '') => {
  hud.textContent = msg;
  hud.hidden = !msg;
};
say();
const ICONS: Record<'gold' | Good, string> = {
  gold: '<circle cx="12" cy="12" r="9" fill="#e8c34a" stroke="#8a6a1a" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#b8922a" stroke-width="1.5"/>',
  wood: '<rect x="3" y="9" width="18" height="7" rx="3.5" fill="#9b6b3d" stroke="#5b3b1d" stroke-width="1.5"/><ellipse cx="19" cy="12.5" rx="2.5" ry="3.5" fill="#e0bf86" stroke="#5b3b1d"/>',
  tools:
    '<path d="M5 19 14 10" stroke="#7a5a35" stroke-width="3" stroke-linecap="round"/><path d="M12 5h7l-2 4h-6z" fill="#b8bec6" stroke="#4a4f57" stroke-width="1.2"/>',
  bricks:
    '<rect x="3" y="6" width="8" height="5" fill="#b5523a" stroke="#6a2a1a"/><rect x="12" y="6" width="9" height="5" fill="#c0603f" stroke="#6a2a1a"/><rect x="3" y="12" width="12" height="5" fill="#c0603f" stroke="#6a2a1a"/><rect x="16" y="12" width="5" height="5" fill="#b5523a" stroke="#6a2a1a"/>',
  fish: '<path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z" fill="#9aaab4" stroke="#4a5a64" stroke-width="1.2"/><path d="M17 12l4-3.5v7z" fill="#7a8a94" stroke="#4a5a64"/><circle cx="7" cy="11" r="1" fill="#1a2a34"/>',
  wool: '<circle cx="9" cy="11" r="4.5" fill="#f0ead8" stroke="#8a8270"/><circle cx="15" cy="11" r="4.5" fill="#e8e0cc" stroke="#8a8270"/><circle cx="12" cy="15" r="4.5" fill="#f4eee0" stroke="#8a8270"/>',
  cloth:
    '<path d="M4 7h13l3 3v8H7l-3-3z" fill="#4a6a9a" stroke="#22344e" stroke-width="1.2"/><path d="M4 7v8l3 3v-8zM7 10h13" fill="#3a5680" stroke="#22344e"/><path d="M10 10v8M14 10v8" stroke="#6a8aba" stroke-width="0.8"/>',
};
const icon = (k: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
/** The island whose goods the bar shows: the one in the middle of the screen, or the last looked at. */
let shownIsland = 0;
let shownHtml = '';
const showResources = () => {
  const stock = world.stocks.get(shownIsland) ?? world.stocks.get(0)!;
  const where = world.stocks.has(shownIsland) && shownIsland ? `${shownIsland}. sziget` : 'Hajó';
  const html = [
    `<span title="Arany">${icon('gold')}${world.gold}</span>`,
    `<span class="where" title="Kinek a készlete">${where}</span>`,
    ...(Object.keys(GOOD_NAMES) as Good[]).map((g) => `<span title="${GOOD_NAMES[g]}">${icon(g)}${stock[g]}</span>`),
  ].join('');
  // Rewritten only when something changed: it is checked every frame.
  if (html !== shownHtml) resources.innerHTML = shownHtml = html;
};
showResources();

const app = new Application();
// WebGL: the ground shader is GLSL only.
const settings = loadSettings();
await app.init({
  resizeTo: window,
  background: '#0d4166',
  antialias: settings.antialias === 'msaa',
  preference: 'webgl',
  resolution: resolutionOf(settings),
  autoDensity: true,
});
document.body.prepend(app.canvas);

// Which GPU the browser draws with. A software one (hardware acceleration off or blocked)
// is tens of times slower, so say so plainly instead of leaving the player with 5 FPS.
const gl = (app.renderer as WebGLRenderer).gl;
const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = String(gl.getParameter(gpuInfo ? gpuInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) {
  const warn = Object.assign(document.createElement('div'), {
    className: 'warn',
    textContent:
      `A böngésző nem a videokártyával rajzol (${gpu}), ezért nagyon lassú. ` +
      'Chrome/Edge: Beállítások → Rendszer → „Grafikus gyorsítás használata, ha rendelkezésre áll” bekapcsolása, ' +
      'majd a böngésző újraindítása. (Koppints a bezáráshoz.)',
  });
  warn.addEventListener('click', () => warn.remove());
  document.body.append(warn);
}

const scene = new Container();
const terrain = createTerrain(world, app.renderer);
const territory = new Graphics();
const hover = new Graphics();
const selection = new Graphics();
const preview = new Graphics();
const ghost = new Graphics({ alpha: 0.6 });
territory.visible = false;
const effects = createEffects(map);
// Reflections under the land: the baked land is opaque, so they only show on the sea.
// The whole world takes the time of day as a tint; night lights and the UI overlays sit above it, untinted.
// Buildings rise behind scaffolding; until then the terrain leaves them out of its baked chunks.
const construction = createConstruction(effects.dust, (id) => {
  terrain.hide(id, false);
  terrain.refreshFront();
  const b = world.buildings.get(id);
  if (b) terrain.invalidate(footprint(b.x, b.y, BUILDINGS[b.type].size));
});
// Weather and air; `?idojaras=rain` (clear, cloudy, rain, fog) fixes it. Cloud shadows fall on the world.
const fixedWeather = new URLSearchParams(location.search).get('idojaras') as Weather | null;
const atmosphere = createAtmosphere(fixedWeather ?? undefined);
// People, carts and boats; their wakes and reflections lie on the water, under the land.
const life = createLife(world, app.renderer, terrain.front, terrain.rockAt);
const lit = new Container({
  children: [
    terrain.reflections,
    life.water,
    terrain.ground,
    territory,
    terrain.objects,
    terrain.front,
    construction.layer,
    atmosphere.world,
    effects.layer,
  ],
});
scene.addChild(lit, terrain.lights);
scene.addChild(hover, selection, preview, ghost);
app.stage.addChild(scene);

// The sea is drawn into its own texture, separate from the world's resolution, so it stays
// sharp when the world is rendered smaller. Smooth: device pixels (up to 2×), linear.
// Pixel look: a quarter of that, nearest, so each water pixel is a hard block.
const WATER_BLOCK = 4;
const waterScene = new Container({ children: [terrain.water] });
const waterTexture = RenderTexture.create({ width: 1, height: 1 });
const waterSprite = new Sprite({ texture: waterTexture, eventMode: 'none' });
app.stage.addChildAt(waterSprite, 0);
const waterRes = () => Math.min(devicePixelRatio, 2) / (settings.waterPixel ? WATER_BLOCK : 1);
const waterTransform = new Matrix();

// Vignette inside the canvas: as a CSS overlay the browser would blend it over the whole
// window at full screen resolution every frame, whatever the game's own resolution.
const vignetteCanvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
const vctx = vignetteCanvas.getContext('2d')!;
const vg = vctx.createRadialGradient(128, 128, 100, 128, 128, 181);
vg.addColorStop(0, 'rgba(5,15,30,0)');
vg.addColorStop(1, 'rgba(5,15,30,0.2)');
vctx.fillStyle = vg;
vctx.fillRect(0, 0, 256, 256);
const vignette = new Sprite({ texture: Texture.from(vignetteCanvas), eventMode: 'none' });
// Warm light from the upper left, as the shading assumes; added on top so it only brightens.
const sunCanvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
const sctx = sunCanvas.getContext('2d')!;
const sg = sctx.createRadialGradient(128, 96, 0, 128, 96, 420);
sg.addColorStop(0, 'rgba(255,236,190,0.16)');
sg.addColorStop(0.5, 'rgba(255,220,160,0.06)');
sg.addColorStop(1, 'rgba(255,200,140,0)');
sctx.fillStyle = sg;
sctx.fillRect(0, 0, 512, 512);
const sunlight = new Sprite({ texture: Texture.from(sunCanvas), eventMode: 'none', blendMode: 'add' });
const fitVignette = () => {
  vignette.setSize(app.screen.width, app.screen.height);
  sunlight.setSize(app.screen.width, app.screen.height);
};
fitVignette();
// Rain over the scene, under the vignette.
app.stage.addChild(atmosphere.screen, vignette, sunlight);

const fxaa = createFxaa();
const wind = createWind();
let windTime = 0;
// A fixed filter area: measuring the huge sea mesh for bounds every frame is wasted work.
app.stage.filterArea = app.screen;
const applySettings = () => {
  terrain.setPixel(settings.pixel);
  waterTexture.resize(app.screen.width, app.screen.height, waterRes());
  waterSprite.texture.source.style.scaleMode = settings.waterPixel ? 'nearest' : 'linear';
  waterSprite.width = app.screen.width;
  waterSprite.height = app.screen.height;
  app.stage.filters = settings.antialias === 'fxaa' ? [fxaa] : [];
  const r = resolutionOf(settings);
  if (r !== app.renderer.resolution) app.renderer.resize(innerWidth, innerHeight, r);
};
applySettings();
createSettingsPanel(document.getElementById('settings')!, settings, applySettings, mapLabel);
// 'Auto' resolution depends on the window size.
addEventListener('resize', applySettings);
// Time of day: a full day takes DAY_SECONDS; `?ido=0.8` fixes it (0 midnight, 0.5 noon).
const DAY_SECONDS = 480;
const fixedTime = new URLSearchParams(location.search).get('ido');
let dayTime = fixedTime !== null ? Number(fixedTime) : 0.32;
const hex = (c: number[]) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
const countFps = createFpsCounter(document.getElementById('fps')!);
const view = new Rectangle();
/** Game speed: 0 paused, 1, 2 or 4 times. The world steps in fixed ticks of game time. */
let speed = 1;
let simTime = 0;
const speedBar = document.getElementById('speed')!;
const SPEEDS: [number, string, string][] = [
  [
    0,
    '<svg viewBox="0 0 12 12" width="12" height="12"><rect x="2" y="1.5" width="3" height="9" fill="currentColor"/><rect x="7" y="1.5" width="3" height="9" fill="currentColor"/></svg>',
    'Szünet (szóköz)',
  ],
  [1, '1×', 'Normál (1)'],
  [2, '2×', 'Gyors (2)'],
  [4, '4×', 'Nagyon gyors (3)'],
];
const setSpeed = (v: number) => {
  speed = v;
  speedBar.replaceChildren(
    ...SPEEDS.map(([k, label, title]) => {
      const b = Object.assign(document.createElement('button'), { innerHTML: label, title });
      b.classList.toggle('active', k === v);
      b.addEventListener('click', () => setSpeed(k));
      return b;
    }),
  );
};
setSpeed(1);
let lastSpeed = 1;
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === ' ') {
    e.preventDefault();
    if (speed) [lastSpeed, speed] = [speed, 0];
    setSpeed(speed || lastSpeed);
  } else if (['1', '2', '3'].includes(e.key)) setSpeed([1, 2, 4][Number(e.key) - 1]);
});

app.ticker.add((t) => {
  const realDt = t.deltaMS / 1000;
  // Everything alive moves in game time: paused, it all stands still (weather and water go on).
  const dt = realDt * speed;
  simTime = Math.min(simTime + dt, 2);
  while (simTime >= TICK) {
    tick(world, TICK);
    simTime -= TICK;
  }
  const centre = tileAt(app.screen.width / 2, app.screen.height / 2);
  const here = centre && islandOf(world, centre.x, centre.y);
  if (here && world.stocks.has(here)) shownIsland = here;
  showResources();
  if (info) info();
  const tl = screenToWorld(cam, 0, 0);
  view.x = tl.x;
  view.y = tl.y;
  view.width = app.screen.width / cam.scale;
  view.height = app.screen.height / cam.scale;
  if (fixedTime === null && settings.dayCycle) dayTime = (dayTime + dt / DAY_SECONDS) % 1;
  const day = daylight(fixedTime !== null || settings.dayCycle ? dayTime : 0.42);
  // Weather dims and greys the light; clouds dull the sea's glints.
  atmosphere.update(realDt, view, app.screen, day.sunStrength, settings.weather);
  const { cloud, rain, fog } = atmosphere.sky;
  const dim = 1 - rain * 0.28 - cloud * 0.1;
  const ambient = day.ambient.map((v, i, a) => {
    const grey = (a[0] + a[1] + a[2]) / 3;
    return (v + (grey - v) * rain * 0.35) * dim;
  });
  lit.tint = hex(ambient);
  terrain.lights.alpha = day.night;
  // Invisible layers are skipped, not drawn at zero opacity: full-screen blending is the main cost.
  terrain.lights.visible = day.night > 0.01;
  terrain.setSun(day.step);
  terrain.setWet(rain);
  sunlight.tint = hex(day.sun);
  // A low sun rakes in stronger and warmer from the upper left.
  sunlight.alpha = day.sunStrength * (1 + 1.4 * ((0.8 - day.sun[2]) / 0.45));
  sunlight.visible = day.sunStrength > 0.01;
  // The moon's glitter column stays at a fixed place on screen, like the real one as you move.
  terrain.light(
    ambient,
    day.sun.map((v) => v * day.sunStrength),
    [view.x + view.width * 0.62, 50 / cam.scale, day.night * (1 - cloud * 0.8)],
    [fog, rain, cloud],
  );
  terrain.update(realDt, view, cam.scale);
  construction.update(dt);
  life.update(dt, view, cam.scale < FAR_SCALE);
  terrain.front.visible = cam.scale >= FAR_SCALE;
  // The target keeps CSS-pixel units; its own resolution does the downscaling.
  waterTransform.set(cam.scale, 0, 0, cam.scale, cam.x, cam.y);
  // Wind in the leaves while trees are drawn (not at the far zoom's canopy), unless switched off.
  const windy = settings.wind && cam.scale >= FAR_SCALE;
  terrain.objects.filters = windy ? [wind] : [];
  if (windy) {
    windTime += realDt;
    const u = wind.resources.wind.uniforms;
    u.uTime = windTime;
    u.uView.set([view.x, view.y, cam.scale, app.renderer.resolution]);
  }
  app.renderer.render({ container: waterScene, target: waterTexture, transform: waterTransform, clear: true });
  effects.update(realDt, view, cam.scale < FAR_SCALE);
  const { width, height } = app.canvas;
  countFps(
    settings.fps,
    `${width}×${height} px · ${settings.antialias.toUpperCase()} · ${terrain.stats.visible} darab, ${terrain.stats.pending} sütésre vár\nGPU: ${gpu}`,
  );
});

/** Redraw after a world change in `tiles` (built on, cleared or demolished). */
const refresh = (tiles: [number, number][] = []) => {
  terrain.changed(tiles);
  terrain.refreshFront();
  life.refresh();
  effects.setChimneys([...world.buildings.values()].flatMap((b) => chimneyAt(b.type, b.x, b.y) ?? []));
  drawTerritory(territory, world);
  showResources();
};

// Start centred on the biggest island.
const sums = new Map<number, [number, number, number]>();
world.islands.forEach((l, i) => {
  if (!l) return;
  const s = sums.get(l) ?? [0, 0, 0];
  sums.set(l, [s[0] + (i % map.width), s[1] + Math.floor(i / map.width), s[2] + 1]);
});
const [sx, sy, n] = [...sums.values()].sort((a, b) => b[2] - a[2])[0] ?? [map.width / 2, map.height / 2, 1];
const mid = tileToScreen(sx / n, sy / n);
const cam: Camera = { scale: 0.6, x: 0, y: 0 };
cam.x = app.screen.width / 2 - mid.x * cam.scale;
cam.y = app.screen.height / 2 - mid.y * cam.scale;
const applyCamera = () => {
  scene.position.set(cam.x, cam.y);
  scene.scale.set(cam.scale);
};
applyCamera();

const tileAt = (sx: number, sy: number) => {
  const w = screenToWorld(cam, sx, sy);
  const t = screenToGround(w.x, w.y);
  return terrainAt(map, t.x, t.y) ? t : undefined;
};

const outline = (g: Graphics, x: number, y: number, alpha: number, color = 0xffffff) =>
  g
    .poly(diamond(x, y))
    .fill({ color, alpha: alpha / 3 })
    .stroke({ width: 2, color, alpha });

const footprint = (x: number, y: number, size: number) => {
  const tiles: [number, number][] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tiles.push([x + dx, y + dy]);
  return tiles;
};

let tool: Tool = null;
/** Refreshes the selected building's line in the hud, while one is selected. */
let info: (() => void) | null = null;
let roadStart: { x: number; y: number } | null = null;

const menu = createBuildMenu(document.getElementById('build')!, (t) => {
  tool = t;
  info = null;
  roadStart = null;
  preview.clear();
  ghost.clear();
  hover.clear();
  selection.clear();
  territory.visible = !!t && t !== 'demolish';
  say(t === 'demolish' ? 'Bontás: koppints vagy húzz az épületekre' : t ? `${BUILDINGS[t].name}: ${costText(t)}` : '');
});
addEventListener('keydown', (e) => e.key === 'Escape' && menu.setTool(null));

/** Top corner for a building so the pointer sits near its middle. */
const anchorFor = (size: number, t: { x: number; y: number }) => ({
  x: t.x - Math.floor((size - 1) / 2),
  y: t.y - Math.floor((size - 1) / 2),
});

const showPreview = (t: { x: number; y: number } | undefined) => {
  preview.clear();
  ghost.clear();
  if (!t || !tool) return;
  if (tool === 'demolish') {
    const b = buildingAt(world, t.x, t.y);
    const tiles = b ? footprint(b.x, b.y, BUILDINGS[b.type].size) : [[t.x, t.y]];
    for (const [x, y] of tiles) outline(preview, x, y, 0.8, 0xff3b30);
    return;
  }
  if (tool === 'road') {
    const path = roadStart ? roadPath(roadStart.x, roadStart.y, t.x, t.y) : [[t.x, t.y]];
    let fresh = 0;
    for (const [x, y] of path) {
      const ok = !placementError(world, 'road', x, y);
      if (ok) fresh++;
      // Existing road is skipped, not an error.
      outline(preview, x, y, 0.8, ok ? 0x4cd964 : buildingAt(world, x, y)?.type === 'road' ? 0xbbbbbb : 0xff3b30);
    }
    say(`Út: ${fresh} új mező, ${fresh * BUILDINGS.road.cost.gold} arany`);
    return;
  }
  const def = BUILDINGS[tool];
  const a = anchorFor(def.size, t);
  const err = placementError(world, tool, a.x, a.y);
  const color = err ? 0xff3b30 : 0x4cd964;
  for (const [x, y] of footprint(a.x, a.y, def.size)) outline(preview, x, y, 0.5, color);
  drawBuilding(ghost, tool, a.x, a.y);
  say(err ?? `${def.name}: ${costText(tool)}`);
};

const demolishAt = (t: { x: number; y: number } | undefined) => {
  const b = t && demolish(world, t.x, t.y);
  if (!b) return;
  construction.cancel(b.id);
  terrain.hide(b.id, false);
  // A cloud of dust over the footprint.
  const size = BUILDINGS[b.type].size;
  for (let k = 0; k < 18; k++) {
    const p = groundToScreen(b.x + Math.random() * size, b.y + Math.random() * size);
    effects.dust(p.x, p.y - Math.random() * 20);
  }
  refresh(footprint(b.x, b.y, BUILDINGS[b.type].size));
  showPreview(t);
};

attachCameraControls(app.canvas, cam, {
  onChange: applyCamera,
  onHover(sx, sy) {
    const t = tileAt(sx, sy);
    if (tool) return showPreview(t);
    hover.clear();
    if (t) outline(hover, t.x, t.y, 0.35);
  },
  onTap(sx, sy) {
    const t = tileAt(sx, sy);
    selection.clear();
    info = null;
    if (!t) return say();
    const b = buildingAt(world, t.x, t.y);
    outline(selection, t.x, t.y, 0.9);
    const where = `(${t.x}, ${t.y}) ${TERRAIN_NAMES[terrainAt(map, t.x, t.y)!]}`;
    const p = b && BUILDINGS[b.type].production;
    if (!b || !p) return say(`${where}${b ? ` · ${BUILDINGS[b.type].name}` : ''}`);
    if (world.stocks.has(islandOf(world, b.x, b.y))) shownIsland = islandOf(world, b.x, b.y);
    // A producer: how well it works and why not better, kept up to date while selected.
    info = () => {
      if (!world.buildings.has(b.id)) return (info = null);
      const goods = `${GOOD_NAMES[p.output].toLowerCase()} ${b.output}/${CAP}`;
      const input = p.input ? ` · ${GOOD_NAMES[p.input].toLowerCase()} ${b.input}/${CAP}` : '';
      const why = trouble(world, b);
      say(
        `${BUILDINGS[b.type].name} · hatékonyság ${Math.round(b.busy! * 100)}% · ${goods}${input}${why ? ` · ${why}` : ''}`,
      );
    };
    info();
  },
  paint: {
    active: () => tool !== null,
    start(sx, sy) {
      const t = tileAt(sx, sy);
      if (tool === 'road') roadStart = t ?? null;
      if (tool === 'demolish') demolishAt(t);
      showPreview(t);
    },
    move(sx, sy) {
      const t = tileAt(sx, sy);
      if (tool === 'demolish') demolishAt(t);
      showPreview(t);
    },
    end(sx, sy) {
      const t = tileAt(sx, sy);
      if (t && tool === 'road' && roadStart) {
        const path = roadPath(roadStart.x, roadStart.y, t.x, t.y);
        const built = path.filter(([x, y]) => place(world, 'road', x, y) === null).length;
        say(`${built} útszakasz megépült`);
        refresh(path.filter(([x, y]) => buildingAt(world, x, y)?.type === 'road'));
      } else if (t && tool && tool !== 'demolish' && tool !== 'road') {
        const s = BUILDINGS[tool].size;
        const a = anchorFor(s, t);
        const err = place(world, tool, a.x, a.y);
        const b = err ? undefined : buildingAt(world, a.x, a.y);
        if (b) {
          terrain.hide(b.id, true);
          construction.start(b);
        }
        say(err ?? `Megépült: ${BUILDINGS[tool].name}`);
        refresh(err ? [] : footprint(a.x, a.y, s));
      }
      roadStart = null;
      preview.clear();
    },
    cancel() {
      roadStart = null;
      preview.clear();
      ghost.clear();
    },
  },
});

// Keep the camera centred on the same world point when the window resizes.
let size = { w: app.screen.width, h: app.screen.height };
app.renderer.on('resize', (w: number, h: number) => {
  cam.x += (w - size.w) / 2;
  cam.y += (h - size.h) / 2;
  size = { w, h };
  applyCamera();
  fitVignette();
});

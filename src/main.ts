import { Application, Container, CullerPlugin, extensions, Graphics } from 'pixi.js';
import { BUILDINGS, GOOD_NAMES, type Good } from './data/buildings';
import pelda from './data/maps/pelda.txt?raw';
import { drawBox, drawBuildings, drawTerritory } from './render/buildings';
import { attachCameraControls, screenToWorld, type Camera } from './render/camera';
import { screenToTile, tileToScreen } from './render/iso';
import { createTerrain, diamond } from './render/terrain';
import { type GameMap, type Terrain, generateMap, parseMap, terrainAt } from './sim/map';
import { buildingAt, createWorld, demolish, place, placementError, roadPath } from './sim/world';
import { costText, createBuildMenu, type Tool } from './ui/buildMenu';

const MAPS: Record<string, string> = { pelda };
const TERRAIN_NAMES: Record<Terrain, string> = {
  water: 'Víz',
  beach: 'Part',
  grass: 'Fű',
  forest: 'Erdő',
  mountain: 'Hegy',
};

// ?map=pelda loads a hand-made map, ?seed=123 a generated one; otherwise a random seed.
const params = new URLSearchParams(location.search);
const mapName = params.get('map') ?? '';
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e6);
const map: GameMap = MAPS[mapName] ? parseMap(MAPS[mapName]) : generateMap(seed);
const world = createWorld(map);

const hud = document.getElementById('hud')!;
const resources = document.getElementById('resources')!;
const mapLabel = MAPS[mapName] ? `Térkép: ${mapName}` : `Seed: ${seed}`;
const say = (msg = '') => (hud.textContent = msg ? `${mapLabel} · ${msg}` : mapLabel);
say();
const showResources = () =>
  (resources.textContent = [
    `Arany ${world.gold}`,
    ...(Object.keys(GOOD_NAMES) as Good[]).map((g) => `${GOOD_NAMES[g]} ${world.stock[g]}`),
  ].join(' · '));
showResources();

extensions.add(CullerPlugin);
const app = new Application();
await app.init({ resizeTo: window, background: '#0b3a5a', antialias: true });
document.body.prepend(app.canvas);

const scene = new Container();
const terrain = createTerrain(map);
let terrainRev = world.terrainRev;
const territory = new Graphics();
const buildings = new Graphics();
const hover = new Graphics();
const selection = new Graphics();
const preview = new Graphics();
territory.visible = false;
scene.addChild(terrain.ground, territory, buildings, terrain.features, hover, selection, preview);
app.stage.addChild(scene);

/** Redraw what a world change in tiles (x0, y0)..(x1, y1) may have touched. */
const refresh = (x0 = 0, y0 = 0, x1 = 0, y1 = 0) => {
  if (terrainRev !== world.terrainRev) {
    terrainRev = world.terrainRev;
    terrain.redraw(x0, y0, x1, y1);
  }
  drawBuildings(buildings, world);
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
  const t = screenToTile(w.x, w.y);
  return terrainAt(map, t.x, t.y) ? t : undefined;
};

const outline = (g: Graphics, x: number, y: number, alpha: number, color = 0xffffff) =>
  g
    .poly(diamond(x, y))
    .fill({ color, alpha: alpha / 3 })
    .stroke({ width: 2, color, alpha });

let tool: Tool = null;
let roadStart: { x: number; y: number } | null = null;

const menu = createBuildMenu(document.getElementById('build')!, (t) => {
  tool = t;
  roadStart = null;
  preview.clear();
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
  if (!t || !tool) return;
  if (tool === 'demolish') {
    const b = buildingAt(world, t.x, t.y);
    if (b) drawBox(preview, b.x, b.y, BUILDINGS[b.type].size, BUILDINGS[b.type].height + 1, 0xff3b30, 0.6);
    else outline(preview, t.x, t.y, 0.6, 0xff3b30);
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
  for (let dy = 0; dy < def.size; dy++)
    for (let dx = 0; dx < def.size; dx++) outline(preview, a.x + dx, a.y + dy, 0.5, color);
  drawBox(preview, a.x, a.y, def.size, def.height, def.color, 0.55);
  say(err ?? `${def.name}: ${costText(tool)}`);
};

const demolishAt = (t: { x: number; y: number } | undefined) => {
  if (!t || !demolish(world, t.x, t.y)) return;
  refresh();
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
    if (!t) return say();
    const b = buildingAt(world, t.x, t.y);
    outline(selection, t.x, t.y, 0.9);
    say(`(${t.x}, ${t.y}) ${TERRAIN_NAMES[terrainAt(map, t.x, t.y)!]}${b ? ` · ${BUILDINGS[b.type].name}` : ''}`);
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
        refresh(
          Math.min(roadStart.x, t.x),
          Math.min(roadStart.y, t.y),
          Math.max(roadStart.x, t.x),
          Math.max(roadStart.y, t.y),
        );
      } else if (t && tool && tool !== 'demolish' && tool !== 'road') {
        const s = BUILDINGS[tool].size;
        const a = anchorFor(s, t);
        say(place(world, tool, a.x, a.y) ?? `Megépült: ${BUILDINGS[tool].name}`);
        refresh(a.x, a.y, a.x + s - 1, a.y + s - 1);
      }
      roadStart = null;
      preview.clear();
    },
    cancel() {
      roadStart = null;
      preview.clear();
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
});

import { Application, Container, CullerPlugin, extensions, Graphics } from 'pixi.js';
import { BUILDINGS, GOOD_NAMES, type Good } from './data/buildings';
import pelda from './data/maps/pelda.txt?raw';
import { createBuildingsView, drawBuilding, drawRoads, drawTerritory } from './render/buildings';
import { attachCameraControls, screenToWorld, type Camera } from './render/camera';
import { screenToTile, tileToScreen } from './render/iso';
import { createTerrain, diamond, LIFT, liftAt } from './render/terrain';
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
const ICONS: Record<'gold' | Good, string> = {
  gold: '<circle cx="12" cy="12" r="9" fill="#e8c34a" stroke="#8a6a1a" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#b8922a" stroke-width="1.5"/>',
  wood: '<rect x="3" y="9" width="18" height="7" rx="3.5" fill="#9b6b3d" stroke="#5b3b1d" stroke-width="1.5"/><ellipse cx="19" cy="12.5" rx="2.5" ry="3.5" fill="#e0bf86" stroke="#5b3b1d"/>',
  tools:
    '<path d="M5 19 14 10" stroke="#7a5a35" stroke-width="3" stroke-linecap="round"/><path d="M12 5h7l-2 4h-6z" fill="#b8bec6" stroke="#4a4f57" stroke-width="1.2"/>',
  bricks:
    '<rect x="3" y="6" width="8" height="5" fill="#b5523a" stroke="#6a2a1a"/><rect x="12" y="6" width="9" height="5" fill="#c0603f" stroke="#6a2a1a"/><rect x="3" y="12" width="12" height="5" fill="#c0603f" stroke="#6a2a1a"/><rect x="16" y="12" width="5" height="5" fill="#b5523a" stroke="#6a2a1a"/>',
};
const icon = (k: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const showResources = () =>
  (resources.innerHTML = [
    `<span title="Arany">${icon('gold')}${world.gold}</span>`,
    ...(Object.keys(GOOD_NAMES) as Good[]).map(
      (g) => `<span title="${GOOD_NAMES[g]}">${icon(g)}${world.stock[g]}</span>`,
    ),
  ].join(''));
showResources();

extensions.add(CullerPlugin);
const app = new Application();
await app.init({ resizeTo: window, background: '#1d5e89', antialias: true });
document.body.prepend(app.canvas);

const scene = new Container();
const terrain = createTerrain(map);
const { layers } = terrain;
const territory = new Graphics();
const roads = new Graphics();
const hover = new Graphics();
const selection = new Graphics();
const preview = new Graphics();
const ghost = new Graphics({ alpha: 0.6 });
territory.visible = false;
scene.addChild(layers.sea, layers.halos, layers.ground, layers.foam, roads, territory, layers.objects);
scene.addChild(layers.clouds, hover, selection, preview, ghost);
app.stage.addChild(scene);
app.ticker.add((t) => terrain.update(t.deltaMS / 1000));
const syncBuildings = createBuildingsView(terrain.objectsAt);

/** Redraw after a world change; `cleared` tiles lose their trees and decoration. */
const refresh = (cleared: [number, number][] = []) => {
  for (const [x, y] of cleared) terrain.clearTile(x, y);
  syncBuildings(world);
  drawRoads(roads, world);
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

/** Tile under a screen point: raised land first, then the sea level behind it. */
const tileAt = (sx: number, sy: number) => {
  const w = screenToWorld(cam, sx, sy);
  const up = screenToTile(w.x, w.y + LIFT);
  if (liftAt(map, up.x, up.y)) return up;
  const t = screenToTile(w.x, w.y);
  return terrainAt(map, t.x, t.y) ? t : undefined;
};

const outline = (g: Graphics, x: number, y: number, alpha: number, color = 0xffffff) =>
  g
    .poly(diamond(x, y, liftAt(map, x, y)))
    .fill({ color, alpha: alpha / 3 })
    .stroke({ width: 2, color, alpha });

const footprint = (x: number, y: number, size: number) => {
  const tiles: [number, number][] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tiles.push([x + dx, y + dy]);
  return tiles;
};

let tool: Tool = null;
let roadStart: { x: number; y: number } | null = null;

const menu = createBuildMenu(document.getElementById('build')!, (t) => {
  tool = t;
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
        refresh(path.filter(([x, y]) => buildingAt(world, x, y)?.type === 'road'));
      } else if (t && tool && tool !== 'demolish' && tool !== 'road') {
        const s = BUILDINGS[tool].size;
        const a = anchorFor(s, t);
        const err = place(world, tool, a.x, a.y);
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
});

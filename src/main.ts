import { Application, Container, Graphics } from 'pixi.js';
import pelda from './data/maps/pelda.txt?raw';
import { attachCameraControls, screenToWorld, type Camera } from './render/camera';
import { screenToTile, tileToScreen } from './render/iso';
import { diamond, drawTerrain } from './render/terrain';
import { type GameMap, type Terrain, generateMap, parseMap, terrainAt } from './sim/map';

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

const hud = document.getElementById('hud')!;
const mapLabel = MAPS[mapName] ? `Térkép: ${mapName}` : `Seed: ${seed}`;
hud.textContent = mapLabel;

const app = new Application();
await app.init({ resizeTo: window, background: '#0b3a5a', antialias: true });
document.body.appendChild(app.canvas);

const world = new Container();
const hover = new Graphics();
const selection = new Graphics();
world.addChild(drawTerrain(map), hover, selection);
app.stage.addChild(world);

const mid = tileToScreen(map.width / 2, map.height / 2);
const cam: Camera = { scale: 0.5, x: 0, y: 0 };
cam.x = app.screen.width / 2 - mid.x * cam.scale;
cam.y = app.screen.height / 2 - mid.y * cam.scale;
const applyCamera = () => {
  world.position.set(cam.x, cam.y);
  world.scale.set(cam.scale);
};
applyCamera();

const tileAt = (sx: number, sy: number) => {
  const w = screenToWorld(cam, sx, sy);
  const t = screenToTile(w.x, w.y);
  const terrain = terrainAt(map, t.x, t.y);
  return terrain && { ...t, terrain };
};

const outline = (g: Graphics, x: number, y: number, alpha: number) =>
  g
    .clear()
    .poly(diamond(x, y))
    .fill({ color: 0xffffff, alpha: alpha / 3 })
    .stroke({ width: 2, color: 0xffffff, alpha });

attachCameraControls(app.canvas, cam, {
  onChange: applyCamera,
  onHover(sx, sy) {
    const t = tileAt(sx, sy);
    if (t) outline(hover, t.x, t.y, 0.35);
    else hover.clear();
  },
  onTap(sx, sy) {
    const t = tileAt(sx, sy);
    if (t) outline(selection, t.x, t.y, 0.9);
    else selection.clear();
    hud.textContent = t ? `${mapLabel} · (${t.x}, ${t.y}) ${TERRAIN_NAMES[t.terrain]}` : mapLabel;
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

import type { Rectangle } from 'pixi.js';
import type { Terrain } from '../sim/map';
import type { World } from '../sim/world';

const COLORS: Record<Terrain, string> = {
  water: '#245f84',
  beach: '#d8c890',
  rocky: '#9a9488',
  grass: '#6a9a48',
  forest: '#3a6a32',
  mountain: '#9a9aa2',
  river: '#4a8ab0',
};
/** Width of the minimap, CSS pixels; its height follows the diamond of the map. */
const SIZE = 200;

/**
 * The whole map in a corner, as the diamond the view shows it in: land, the player's buildings,
 * ships (the free trader red) and a frame for what is on screen. A click moves the view there.
 */
export function createMinimap(root: HTMLElement, w: World, onJump: (wx: number, wy: number) => void) {
  const { width: W, height: H } = w.map;
  // Tile (x, y) lands at ((x - y) * k + H * k, (x + y) * k / 2): world pixels times k / 32.
  const k = SIZE / (W + H);
  const dpr = Math.min(devicePixelRatio, 2);
  const canvas = Object.assign(document.createElement('canvas'), {
    width: Math.round(SIZE * dpr),
    height: Math.round((SIZE / 2) * dpr),
  });
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE / 2}px`;
  root.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const base = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
  const toMini = (wx: number, wy: number) => [(wx * k) / 32 + H * k, (wy * k) / 32];

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const [mx, my] = [e.clientX - r.left, e.clientY - r.top];
    onJump(((mx - H * k) * 32) / k, (my * 32) / k);
  });

  let since = Infinity;
  return {
    /** Repaint the land (after building cleared a forest, or at the start). */
    redraw() {
      const tiles = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const t = tiles.getContext('2d')!;
      const img = t.createImageData(W, H);
      const rgb = Object.fromEntries(
        Object.entries(COLORS).map(([key, c]) => [key, [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))]),
      );
      w.map.tiles.forEach((tile, i) => {
        img.data.set([...rgb[tile], 255], i * 4);
      });
      t.putImageData(img, 0, 0);
      const b = base.getContext('2d')!;
      b.imageSmoothingEnabled = false;
      b.setTransform(k * dpr, (k / 2) * dpr, -k * dpr, (k / 2) * dpr, H * k * dpr, 0);
      b.clearRect(-W, -H, 3 * W, 3 * H);
      b.drawImage(tiles, 0, 0);
      since = Infinity;
    },
    /** Buildings, ships and the view frame, a few times a second. */
    update(dt: number, view: Rectangle) {
      since += dt;
      if (since < 0.25) return;
      since = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dot = (x: number, y: number, r: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect((x - y) * k + H * k - r / 2, ((x + y) * k) / 2 - r / 2, r, r);
      };
      for (const b of w.buildings.values())
        dot(b.x + 1, b.y + 1, b.type === 'road' ? 1 : 2, b.type === 'road' ? '#8a6a42' : '#f4e2b0');
      for (const s of w.ships) dot(s.x, s.y, 3, s.trader ? '#e05040' : '#ffffff');
      const [x0, y0] = toMini(view.x, view.y);
      const [x1, y1] = toMini(view.x + view.width, view.y + view.height);
      ctx.strokeStyle = 'rgba(255, 236, 180, 0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    },
  };
}

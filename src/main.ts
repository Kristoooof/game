import { Application, Graphics } from 'pixi.js';
import { TILE_H, TILE_W, tileToScreen } from './render/iso';

const MAP_SIZE = 32;

const app = new Application();
await app.init({ resizeTo: window, background: '#0b3a5a', antialias: true });
document.body.appendChild(app.canvas);

const grid = new Graphics();
for (let y = 0; y < MAP_SIZE; y++) {
  for (let x = 0; x < MAP_SIZE; x++) {
    const { x: sx, y: sy } = tileToScreen(x, y);
    grid
      .poly([sx, sy, sx + TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx - TILE_W / 2, sy + TILE_H / 2])
      .fill((x + y) % 2 ? 0x1c6e99 : 0x1a6690)
      .stroke({ width: 1, color: 0x2b80ad, alpha: 0.4 });
  }
}
app.stage.addChild(grid);

const center = () => {
  grid.x = app.screen.width / 2;
  grid.y = app.screen.height / 2 - (MAP_SIZE * TILE_H) / 2;
};
center();
app.renderer.on('resize', center);

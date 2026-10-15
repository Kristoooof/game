import { expect, test } from 'vitest';
import { TILE_H, screenToTile, tileToScreen } from './iso';

test('screenToTile inverts tileToScreen at tile centers', () => {
  for (const [x, y] of [
    [0, 0],
    [3, 7],
    [12, 2],
  ]) {
    const s = tileToScreen(x, y);
    expect(screenToTile(s.x, s.y + TILE_H / 2)).toEqual({ x, y });
  }
});

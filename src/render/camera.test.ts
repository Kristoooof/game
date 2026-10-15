import { expect, test } from 'vitest';
import { MAX_SCALE, MIN_SCALE, screenToWorld, zoomAt } from './camera';

test('zoomAt keeps the point under the cursor fixed and clamps scale', () => {
  const cam = { x: 100, y: -50, scale: 0.5 };
  const before = screenToWorld(cam, 300, 200);
  const z = zoomAt(cam, 2, 300, 200);
  expect(z.scale).toBe(1);
  const after = screenToWorld(z, 300, 200);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  expect(zoomAt(cam, 100, 0, 0).scale).toBe(MAX_SCALE);
  expect(zoomAt(cam, 0.001, 0, 0).scale).toBe(MIN_SCALE);
});

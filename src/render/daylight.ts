/** Time of day in [0, 1): 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk. */
export type DayTime = number;

type RGB = [number, number, number];

/** World colour multiplier through the day; interpolated, wrapping at midnight. */
const AMBIENT: [DayTime, RGB][] = [
  [0, [0.26, 0.33, 0.56]],
  [0.2, [0.32, 0.36, 0.58]],
  [0.26, [0.92, 0.74, 0.66]],
  [0.33, [1, 0.94, 0.86]],
  [0.5, [1, 1, 1]],
  [0.67, [1, 0.94, 0.84]],
  [0.74, [1, 0.74, 0.56]],
  [0.8, [0.46, 0.4, 0.58]],
  [0.86, [0.26, 0.33, 0.56]],
  [1, [0.26, 0.33, 0.56]],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Sun steps a day: shadows change this often, each step rebakes the chunks on screen. */
export const SUN_STEPS = 8;
const RISE = 0.24;
const SET = 0.78;

export function daylight(d: DayTime) {
  d = ((d % 1) + 1) % 1;
  const i = AMBIENT.findIndex(([t]) => t > d);
  const [t0, c0] = AMBIENT[i - 1];
  const [t1, c1] = AMBIENT[i];
  const k = (d - t0) / (t1 - t0);
  const ambient = c0.map((v, j) => lerp(v, c1[j], k)) as RGB;
  // How far through the day the sun is (0 rise, 1 set) and how high (0 horizon, 1 noon).
  const day = Math.min(1, Math.max(0, (d - RISE) / (SET - RISE)));
  const height = Math.sin(Math.PI * day);
  const up = d > RISE && d < SET;
  // Low sun: warm and orange; noon: pale yellow.
  const warm = 1 - smooth(0.1, 0.5, height);
  const sun: RGB = up ? [1, lerp(0.95, 0.6, warm), lerp(0.8, 0.35, warm)] : [0, 0, 0];
  const sunStrength = up ? smooth(0, 0.12, height) : 0;
  return {
    ambient,
    sun,
    sunStrength,
    /** 0 by day, 1 at night: lights and moonlight. */
    night: up ? 1 - smooth(0.02, 0.2, height) : 1,
    /** Quantised sun position for baked shadows: −1 at night, else 0..SUN_STEPS−1. */
    step: up ? Math.min(SUN_STEPS - 1, Math.floor(day * SUN_STEPS)) : -1,
  };
}

/**
 * Shadow of sun step `step` (see daylight): screen offset per pixel of object height, and opacity.
 * Morning shadows fall right and up, noon short to the lower right, evening long and down.
 */
export function sunShadow(step: number) {
  if (step < 0) return { dx: 0.3, dy: 0.12, alpha: 0.25 };
  const day = (step + 0.5) / SUN_STEPS;
  const length = 0.32 / Math.max(0.2, Math.sin(Math.PI * day));
  const a = lerp(-0.35, 1.2, day);
  return { dx: Math.cos(a) * length, dy: Math.sin(a) * length, alpha: 1 };
}

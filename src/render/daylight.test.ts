import { describe, expect, it } from 'vitest';
import { daylight, SUN_STEPS, sunShadow } from './daylight';

describe('daylight', () => {
  it('is full white light at noon and dark blue night at midnight', () => {
    const noon = daylight(0.5);
    expect(noon.ambient).toEqual([1, 1, 1]);
    expect(noon.night).toBe(0);
    const midnight = daylight(0);
    expect(midnight.night).toBe(1);
    expect(midnight.step).toBe(-1);
    expect(midnight.ambient[2]).toBeGreaterThan(midnight.ambient[0]);
  });

  it('wraps around midnight and steps the sun through the day', () => {
    expect(daylight(1.5)).toEqual(daylight(0.5));
    expect(daylight(0.3).step).toBe(0);
    expect(daylight(0.77).step).toBe(SUN_STEPS - 1);
  });

  it('casts long shadows at the ends of the day and short ones at noon', () => {
    const len = (s: number) => Math.hypot(sunShadow(s).dx, sunShadow(s).dy);
    expect(len(0)).toBeGreaterThan(len(SUN_STEPS / 2) * 2);
    expect(len(SUN_STEPS - 1)).toBeGreaterThan(len(SUN_STEPS / 2) * 2);
  });
});

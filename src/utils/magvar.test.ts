import { describe, expect, it } from 'vitest';
import {
  getMagneticVariation,
  MAGNETIC_VARIATION_THEATRES,
  magneticToTrue,
  trueToMagnetic,
} from './magvar';

const TEST_DATE = new Date(Date.UTC(2025, 0, 1));

describe('theatre magnetic variation', () => {
  it('returns a finite, bounded variation for every supported theatre', () => {
    for (const theatre of MAGNETIC_VARIATION_THEATRES) {
      const variation = getMagneticVariation(theatre, 42, 41.8, TEST_DATE);
      expect(Number.isFinite(variation)).toBe(true);
      expect(variation).toBeGreaterThan(-30);
      expect(variation).toBeLessThan(30);
    }
  });

  it('linearly interpolates between reference years and clamps unknown theatres safely', () => {
    const start = getMagneticVariation('Caucasus', 42, 41.8, new Date(Date.UTC(2020, 0, 1)));
    const middle = getMagneticVariation('Caucasus', 42, 41.8, new Date(Date.UTC(2025, 0, 1)));
    const end = getMagneticVariation('Caucasus', 42, 41.8, new Date(Date.UTC(2030, 0, 1)));

    expect(middle).toBeCloseTo((start + end) / 2, 8);
    expect(getMagneticVariation('UnknownTheatre', 0, 0, TEST_DATE)).toBe(0);
  });

  it('uses east-positive variation with the aviation sign convention', () => {
    expect(trueToMagnetic(90, 10)).toBe(80);
    expect(trueToMagnetic(5, 10)).toBe(355);
    expect(trueToMagnetic(350, -10)).toBe(0);
    expect(magneticToTrue(80, 10)).toBe(90);
    expect(magneticToTrue(355, 10)).toBe(5);
  });
});

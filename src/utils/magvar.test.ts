import { describe, expect, it } from 'vitest';
import {
  MAGNETIC_VARIATION_DATA,
  getMagneticVariation,
  MAGNETIC_VARIATION_THEATRES,
  magneticToTrue,
  trueToMagnetic,
} from './magvar';

const TEST_DATE = new Date(Date.UTC(2025, 0, 1));

// NOAA NCEI WMM-2025 API (https://www.ngdc.noaa.gov/geomag-web/calculators/calculateIgrfwmm),
// 2025-01-01, elevation 0 km.  The coordinates are
// recorded in magneticVariation.json and are intentionally map-level samples.
const NOAA_WMM_2025_VALUES: Record<string, number> = {
  Caucasus: 6.9974,
  MarianaIslands: 0.14184,
  Syria: 5.3664,
  Nevada: 11.32463,
  Normandy: 0.48383,
  PersianGulf: 2.33742,
  TheChannel: 1.54648,
  Falklands: 4.02399,
  Sinai: 4.77075,
  Kola: 12.95722,
  GermanyCW: 4.93359,
};

describe('theatre magnetic variation', () => {
  it('returns a finite, bounded variation for every supported theatre', () => {
    for (const theatre of MAGNETIC_VARIATION_THEATRES) {
      const variation = getMagneticVariation(theatre, 42, 41.8, TEST_DATE);
      expect(Number.isFinite(variation)).toBe(true);
      expect(variation).toBeGreaterThan(-30);
      expect(variation).toBeLessThan(30);
    }
  });

  it('matches NOAA WMM-2025 samples and records their reference locations', () => {
    for (const theatre of MAGNETIC_VARIATION_THEATRES) {
      const reference = MAGNETIC_VARIATION_DATA[theatre]._reference;
      expect(reference).toMatchObject({
        model: 'NOAA WMM-2025',
        date: '2025-01-01',
        elevationKm: 0,
      });

      const variation = getMagneticVariation(theatre, 0, 0, TEST_DATE);
      expect(variation).toBeCloseTo(NOAA_WMM_2025_VALUES[theatre], 2);
    }
  });

  it('documents that latitude and longitude are reserved for future refinement', () => {
    const atReference = getMagneticVariation('Falklands', -52, -60, TEST_DATE);
    const elsewhere = getMagneticVariation('Falklands', 0, 0, TEST_DATE);
    expect(atReference).toBeCloseTo(4.02399, 2);
    expect(elsewhere).toBe(atReference);
  });

  it('linearly interpolates between reference years and clamps unknown theatres safely', () => {
    const start = getMagneticVariation('Caucasus', 42, 41.8, new Date(Date.UTC(2025, 0, 1)));
    const middle = getMagneticVariation('Caucasus', 42, 41.8, new Date(Date.UTC(2027, 0, 1)));
    const end = getMagneticVariation('Caucasus', 42, 41.8, new Date(Date.UTC(2030, 0, 1)));

    expect(middle).toBeCloseTo(start + (end - start) * 0.4, 8);
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

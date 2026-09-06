import { describe, expect, it } from 'vitest';
import {
  dcsToLatLon,
  formatCoordinate,
  formatMGRS,
  getDefaultCoordinateFormat,
  latLonToDCS,
} from './coordinates';

// These WGS84 points are the (0, 0) DCS origins obtained independently from
// each pydcs projection.py definition (https://github.com/pydcs/dcs/tree/master/dcs/terrain).
// Keeping the pydcs-derived coordinates fixed catches false-origin/sign regressions.
const PYDCS_PROJECTION_ORIGINS = [
  ['Caucasus', 45.129497, 34.265515],
  ['MarianaIslands', 13.485000, 144.797541],
  ['Syria', 35.021918, 35.900560],
  ['Nevada', 39.818116, -114.733412],
  ['Normandy', 49.484431, -0.300349],
  ['PersianGulf', 26.171819, 56.241935],
  ['TheChannel', 50.875127, 1.587533],
  ['Falklands', -52.468928, -59.173518],
  ['Sinai', 30.047194, 31.244760],
  ['Kola', 67.999997, 22.499999],
  ['GermanyCW', 54.700772, 20.450252],
] as const;

describe('coordinate formatting', () => {
  it('formats the known point as an FR-12 eight-digit MGRS reference by default', () => {
    expect(formatMGRS(42.0, 41.8)).toBe('37TGG31895356');
    expect(formatCoordinate(42.0, 41.8, 'MGRS')).toBe('37TGG31895356');
    expect(formatMGRS(42.0, 41.8)).toMatch(/^37TGG\d{8}$/);
  });

  it('allows selecting the easting/northing precision', () => {
    expect(formatMGRS(42.0, 41.8, 1)).toBe('37TGG35');
    expect(formatMGRS(42.0, 41.8, 5)).toBe('37TGG3189953569');
  });

  it('returns a fallback instead of throwing for unsupported or invalid coordinates', () => {
    expect(() => formatMGRS(85, 0)).not.toThrow();
    expect(formatMGRS(85, 0)).toContain('MGRS unavailable');
    expect(formatMGRS(Number.NaN, 0)).toContain('invalid');
    expect(formatMGRS(42, 181)).toContain('MGRS unavailable');
  });

  it('preserves DDM and DMS direction handling in the southern and western hemispheres', () => {
    expect(formatCoordinate(-42.5, -41.25, 'DDM')).toBe('42°30.00′S 41°15.00′W');
    expect(formatCoordinate(-42.5, -41.25, 'DMS')).toBe('42°30′00.00″S 41°15′00.00″W');
  });

  it('carries rounded minutes and seconds into the next degree', () => {
    expect(formatCoordinate(12.9999999, -179.9999999, 'DDM')).toBe('13°00.00′N 180°00.00′W');
    expect(formatCoordinate(-12.9999999, 179.9999999, 'DMS')).toBe('13°00′00.00″S 180°00′00.00″E');
  });

  it('keeps rounded coordinates inside the latitude and longitude limits', () => {
    expect(formatCoordinate(89.99999999, -179.99999999, 'DDM')).toBe('90°00.00′N 180°00.00′W');
    expect(formatCoordinate(-90.1, 180.1, 'DMS')).toBe('90°00′00.00″S 180°00′00.00″E');
  });

  it('looks up DCS aircraft defaults and falls back for unknown types', () => {
    expect(getDefaultCoordinateFormat('FA-18C_hornet')).toBe('DDM');
    expect(getDefaultCoordinateFormat('F-16C_50')).toBe('DDM');
    expect(getDefaultCoordinateFormat('AH-64D_BLK_II')).toBe('MGRS');
    expect(getDefaultCoordinateFormat('A-10C_2')).toBe('MGRS');
    expect(getDefaultCoordinateFormat('JF-17')).toBe('DMS');
    expect(getDefaultCoordinateFormat('unknown-aircraft')).toBe('DDM');
  });
});

describe('DCS theatre projections', () => {
  it('matches the pydcs origin and round-trips every supported theatre', () => {
    for (const [theatre, expectedLat, expectedLon] of PYDCS_PROJECTION_ORIGINS) {
      const origin = dcsToLatLon(theatre, 0, 0);
      expect(origin).not.toBeNull();
      expect(origin?.[0]).toBeCloseTo(expectedLat, 5);
      expect(origin?.[1]).toBeCloseTo(expectedLon, 5);

      const dcsPoint = latLonToDCS(theatre, expectedLat, expectedLon);
      expect(dcsPoint).not.toBeNull();
      // Coordinates are fixed to six decimal places above, so allow sub-metre
      // rounding while still requiring the pydcs origin rather than a map-scale offset.
      expect(dcsPoint?.[0]).toBeCloseTo(0, 0);
      expect(dcsPoint?.[1]).toBeCloseTo(0, 0);

      const roundTrip = dcsToLatLon(theatre, dcsPoint![0], dcsPoint![1]);
      expect(roundTrip?.[0]).toBeCloseTo(expectedLat, 5);
      expect(roundTrip?.[1]).toBeCloseTo(expectedLon, 5);
    }
  });
});

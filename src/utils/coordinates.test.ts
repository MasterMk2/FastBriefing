import { describe, expect, it } from 'vitest';
import {
  formatCoordinate,
  formatMGRS,
  getDefaultCoordinateFormat,
} from './coordinates';

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

  it('looks up DCS aircraft defaults and falls back for unknown types', () => {
    expect(getDefaultCoordinateFormat('FA-18C_hornet')).toBe('DDM');
    expect(getDefaultCoordinateFormat('F-16C_50')).toBe('DDM');
    expect(getDefaultCoordinateFormat('AH-64D_BLK_II')).toBe('MGRS');
    expect(getDefaultCoordinateFormat('A-10C_2')).toBe('MGRS');
    expect(getDefaultCoordinateFormat('JF-17')).toBe('DMS');
    expect(getDefaultCoordinateFormat('unknown-aircraft')).toBe('DDM');
  });
});

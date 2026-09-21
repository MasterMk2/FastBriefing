import { describe, expect, it } from 'vitest';
import type { MissionMeta, RoutePoint } from '../types/mission';
import { calculateRouteLegs, formatLegDuration, formatRouteCoordinate } from './routeLegs';
import { calculateBearing, calculateDistance } from './coordinates';

const meta = {
  theatre: 'Caucasus', date: { Year: 2026, Month: 9, Day: 6 },
} as MissionMeta;

function point(x: number, y: number, speed: number, resolved = true): RoutePoint {
  return {
    xy: [x, y], latlon: [45 + x / 111111, 34 + y / 78000], latlonResolved: resolved, speed,
  } as RoutePoint;
}

describe('route leg calculations', () => {
  it('calculates DCS planar distance, bearing, time, and cumulative values', () => {
    const route = calculateRouteLegs([
      point(0, 0, 100, false), point(1000, 1000, 100, false), point(1000, 2000, 50, false),
    ], meta);
    expect(route[0].leg).toBeUndefined();
    expect(route[1].leg?.distance).toBeCloseTo(Math.SQRT2 * 1000);
    expect(route[1].leg?.trueBearing).toBeCloseTo(45);
    expect(route[1].leg?.magneticBearing).toBeUndefined();
    expect(route[1].leg?.time).toBeCloseTo(Math.SQRT2 * 10);
    expect(route[2].leg?.trueBearing).toBeCloseTo(90);
    expect(route[2].leg?.cumulativeDistance).toBeCloseTo(Math.SQRT2 * 1000 + 1000);
    expect(route[2].leg?.cumulativeTime).toBeCloseTo(Math.SQRT2 * 10 + 20);
  });

  it('uses geodesic distance and true bearing for resolved coordinates', () => {
    const route = calculateRouteLegs([point(0, 0, 100), point(1000, 1000, 100)], meta);
    const from = route[0].latlon;
    const to = route[1].latlon;
    expect(route[1].leg?.distance).toBeCloseTo(calculateDistance(from[0], from[1], to[0], to[1]));
    expect(route[1].leg?.trueBearing).toBeCloseTo(calculateBearing(from[0], from[1], to[0], to[1]));
    expect(route[1].leg?.magneticBearing).toBeTypeOf('number');
  });

  it('keeps true bearings on an unsupported map and leaves unknown time blank', () => {
    const route = calculateRouteLegs([
      point(0, 0, 50, false), point(0, 1000, 0, false),
    ], { ...meta, theatre: 'Unknown map' });
    expect(route[1].leg?.trueBearing).toBe(90);
    expect(route[1].leg?.magneticBearing).toBeUndefined();
    expect(route[1].leg?.time).toBeUndefined();
    expect(formatLegDuration(route[1].leg?.time)).toBe('-');
    expect(formatRouteCoordinate(route[1], 'DDM')).toBe('DCS X 0 m / Y 1000 m');
  });

  it('formats elapsed time as a duration, including hours', () => {
    expect(formatLegDuration(125)).toBe('02:05');
    expect(formatLegDuration(3723)).toBe('1:02:03');
  });
});

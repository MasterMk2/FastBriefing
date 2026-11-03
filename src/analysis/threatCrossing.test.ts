import { describe, expect, it } from 'vitest';
import {
  classifyCrossing,
  crossRoute,
  distanceToSegment,
  GRAZING_BAND_METERS,
  selectCrossingThreats,
} from './threatCrossing';
import { makeAIGroup } from '../__tests__/testMission';

const route = [
  { index: 1, xy: [0, 0] as [number, number] },
  { index: 2, xy: [10000, 0] as [number, number] },
  { index: 3, xy: [20000, 0] as [number, number] },
];

describe('distanceToSegment (F6 formula)', () => {
  it('is zero when the threat centre lies on the leg', () => {
    expect(distanceToSegment([0, 0], [10000, 0], [5000, 0])).toBe(0);
  });

  it('clamps the projection to the ends of the leg', () => {
    // The nearest point of the infinite line is at x = -3000; the leg starts at x = 0.
    expect(distanceToSegment([0, 0], [10000, 0], [-3000, 4000])).toBeCloseTo(5000, 6);
    expect(distanceToSegment([0, 0], [10000, 0], [13000, 4000])).toBeCloseTo(5000, 6);
  });

  it('treats a zero-length leg as a point', () => {
    expect(distanceToSegment([100, 100], [100, 100], [103, 104])).toBeCloseTo(5, 6);
  });
});

describe('classifyCrossing', () => {
  it('reports inside below the range, grazing within 1 nm outside it, and outside beyond that', () => {
    expect(classifyCrossing(9999, 10000)).toBe('inside');
    expect(classifyCrossing(10000, 10000)).toBe('grazing');
    expect(classifyCrossing(10000 + GRAZING_BAND_METERS, 10000)).toBe('grazing');
    expect(classifyCrossing(10000 + GRAZING_BAND_METERS + 1, 10000)).toBe('outside');
  });
});

describe('crossRoute', () => {
  it('marks the legs that pass through the threat ring and merges them into one run', () => {
    const crossing = crossRoute(route, { id: 't', type: 'SA-2', position: [15000, 0], range: 2000 });

    // Leg 1 (1 to 2) comes closest at x = 10000, 5000 m from the centre: beyond the 2000 m
    // ring and its 1 nm band. Leg 2 (2 to 3) passes the centre at distance 0: inside.
    expect(crossing.segments.map(segment => segment.state)).toEqual(['outside', 'inside']);
    expect(crossing.state).toBe('inside');
    expect(crossing.runs).toEqual([{ state: 'inside', from: 2, to: 3 }]);
  });

  it('keeps a threat whose centre is beyond the end of the route outside', () => {
    const crossing = crossRoute(route, { id: 't', type: 'SA-2', position: [40000, 0], range: 8000 });
    expect(crossing.state).toBe('outside');
    expect(crossing.runs).toEqual([]);
  });

  it('uses the clamped end point when the closest point lies beyond the leg', () => {
    // Centre is 5000 m beyond the end (20000,0) of leg 2, so the leg's distance is 5000 and it is inside 6000 m.
    const crossing = crossRoute(route, { id: 't', type: 'SA-2', position: [25000, 0], range: 6000 });
    expect(crossing.segments[1].distance).toBeCloseTo(5000, 6);
    expect(crossing.segments[1].state).toBe('inside');
  });

  it('reports grazing when the closest approach is only just outside the ring', () => {
    const crossing = crossRoute(route, { id: 't', type: 'SA-2', position: [15000, 3000], range: 2000 });
    expect(crossing.state).toBe('grazing');
    expect(crossing.runs).toEqual([{ state: 'grazing', from: 2, to: 3 }]);
  });

  it('returns no legs for a route with fewer than two points', () => {
    const crossing = crossRoute([{ index: 1, xy: [0, 0] }], { id: 't', type: 'SA-2', position: [0, 0], range: 1000 });
    expect(crossing.segments).toEqual([]);
    expect(crossing.state).toBe('outside');
  });
});

describe('selectCrossingThreats', () => {
  it('uses only reference ranges and never an unknown range', () => {
    const selected = selectCrossingThreats([
      makeAIGroup({ type: 'SA-2', threatRange: 18000, threatRangeSource: 'reference', position: [1, 2] }),
      makeAIGroup({ type: 'Unknown', threatRange: 0, threatRangeSource: 'unknown' }),
      makeAIGroup({ type: 'EWR', threatRange: 0, detectionRange: 300000, threatRangeSource: 'reference' }),
      makeAIGroup({ type: 'Guess', threatRange: 5000, threatRangeSource: undefined }),
    ]);

    expect(selected).toEqual([{ id: '0:SA-2', type: 'SA-2', position: [1, 2], range: 18000 }]);
  });
});

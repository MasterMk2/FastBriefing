import type { AIGroup, RoutePoint } from '../types/mission';

/** Band around the threat ring in which a leg counts as grazing: 1 nm (D10). */
export const GRAZING_BAND_METERS = 1852;

/**
 * inside: the leg passes within the threat range. grazing: the closest approach
 * is within the band just outside the range. outside: neither.
 * These are horizontal distances in theory, not a detection or kill model.
 */
export type CrossingState = 'inside' | 'grazing' | 'outside';

export interface CrossingThreat {
  id: string;
  type: string;
  /** DCS x, y in metres (same axes as RoutePoint.xy). */
  position: [number, number];
  /** Engagement range in metres. D3: the unit of src/data/threatRanges.json is metres. */
  range: number;
}

export interface SegmentCrossing {
  /** Route index (RoutePoint.index) of the leg's start point. */
  from: number;
  /** Route index of the leg's end point. */
  to: number;
  /** Closest horizontal distance from the threat centre to the leg, in metres. */
  distance: number;
  state: CrossingState;
}

/** Consecutive legs with the same inside or grazing state, shown as one "区間 from〜to". */
export interface CrossingRun {
  state: Exclude<CrossingState, 'outside'>;
  from: number;
  to: number;
}

export interface ThreatCrossing {
  threat: CrossingThreat;
  /** The worst state over all legs (inside, then grazing, then outside). */
  state: CrossingState;
  runs: CrossingRun[];
  segments: SegmentCrossing[];
}

/** Distance from point p to the segment ab. The projection is clamped to the segment ends (t in [0, 1]). */
export function distanceToSegment(a: [number, number], b: [number, number], p: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

export function classifyCrossing(distance: number, range: number): CrossingState {
  if (distance < range) return 'inside';
  if (Math.abs(distance - range) <= GRAZING_BAND_METERS) return 'grazing';
  return 'outside';
}

/** Cross every leg of the route with one threat. Leg i runs from route point i - 1 to point i. */
export function crossRoute(route: Pick<RoutePoint, 'index' | 'xy'>[], threat: CrossingThreat): ThreatCrossing {
  const segments: SegmentCrossing[] = [];
  for (let i = 1; i < route.length; i += 1) {
    const start = route[i - 1];
    const end = route[i];
    const distance = distanceToSegment(start.xy, end.xy, threat.position);
    segments.push({
      from: start.index,
      to: end.index,
      distance,
      state: classifyCrossing(distance, threat.range),
    });
  }

  const state: CrossingState = segments.some(segment => segment.state === 'inside')
    ? 'inside'
    : segments.some(segment => segment.state === 'grazing') ? 'grazing' : 'outside';

  return { threat, state, runs: mergeRuns(segments), segments };
}

/** Cross a route with every threat, in the order given. */
export function crossRouteWithThreats(route: Pick<RoutePoint, 'index' | 'xy'>[], threats: CrossingThreat[]): ThreatCrossing[] {
  return threats.map(threat => crossRoute(route, threat));
}

/**
 * Threats that can take part in a crossing: the range comes from the reference
 * table (threatRangeSource 'reference') and is positive. Unknown ranges are never
 * used as zero or as a guess (D3, F6).
 */
export function selectCrossingThreats(groups: AIGroup[]): CrossingThreat[] {
  return groups.flatMap((group, index): CrossingThreat[] => {
    if (group.threatRangeSource !== 'reference') return [];
    const range = group.threatRange;
    if (range === undefined || !Number.isFinite(range) || range <= 0) return [];
    return [{
      id: `${index}:${group.type}`,
      type: group.type,
      position: group.position,
      range,
    }];
  });
}

function mergeRuns(segments: SegmentCrossing[]): CrossingRun[] {
  const runs: CrossingRun[] = [];
  for (const segment of segments) {
    if (segment.state === 'outside') continue;
    const last = runs[runs.length - 1];
    if (last && last.state === segment.state && last.to === segment.from) {
      last.to = segment.to;
    } else {
      runs.push({ state: segment.state, from: segment.from, to: segment.to });
    }
  }
  return runs;
}

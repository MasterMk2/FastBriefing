import type { Flight, MissionData, RoutePoint, UserNotes, WaypointAnnotation } from '../types/mission';

export type CoalitionSide = 'blue' | 'red' | 'neutral';

export interface MissionWaypointRef {
  key: string;
  side: CoalitionSide;
  flight: Flight;
  routeIndex: number;
  waypoint: RoutePoint;
}

export interface NearbyWaypointRef extends MissionWaypointRef {
  distanceNm: number;
}

export const DEFAULT_WAYPOINT_SYNC_RADIUS_NM = 1;
export const MAX_WAYPOINT_SYNC_RADIUS_NM = 20;
export const MAX_WAYPOINT_ANNOTATIONS = 500;
export const MAX_WAYPOINT_PURPOSE_LENGTH = 80;
export const MAX_WAYPOINT_NOTES_LENGTH = 1000;

export function waypointAnnotationKey(side: CoalitionSide, groupId: number, routeIndex: number): string {
  return `${side}:${groupId}:${routeIndex}`;
}

export function collectMissionWaypoints(mission: MissionData): MissionWaypointRef[] {
  const result: MissionWaypointRef[] = [];
  for (const side of ['blue', 'red', 'neutral'] as const) {
    for (const flight of mission.coalitions[side].flights) {
      flight.route.forEach((waypoint, routeIndex) => {
        result.push({
          key: waypointAnnotationKey(side, flight.groupId, routeIndex),
          side,
          flight,
          routeIndex,
          waypoint,
        });
      });
    }
  }
  return result;
}

export function findNearbyWaypoints(
  mission: MissionData,
  sourceKey: string,
  radiusNm: number,
): NearbyWaypointRef[] {
  const all = collectMissionWaypoints(mission);
  const source = all.find(item => item.key === sourceKey);
  if (!source || !isResolved(source.waypoint)) return [];
  const boundedRadius = Math.max(0, Math.min(MAX_WAYPOINT_SYNC_RADIUS_NM, radiusNm));
  return all
    .filter(candidate => candidate.key !== sourceKey
      && (candidate.side !== source.side || candidate.flight.groupId !== source.flight.groupId)
      && isResolved(candidate.waypoint))
    .map(candidate => ({
      ...candidate,
      distanceNm: greatCircleDistanceNm(source.waypoint.latlon, candidate.waypoint.latlon),
    }))
    .filter(candidate => candidate.distanceNm <= boundedRadius)
    .sort((a, b) => a.distanceNm - b.distanceNm || a.key.localeCompare(b.key));
}

export function getSyncGroupMembers(notes: UserNotes, key: string): string[] {
  const groupId = notes.waypoints[key]?.syncGroupId;
  if (!groupId) return [];
  return Object.entries(notes.waypoints)
    .filter(([, annotation]) => annotation.syncGroupId === groupId)
    .map(([memberKey]) => memberKey)
    .sort();
}

export function intersectWaypointKeys(
  selectedKeys: Iterable<string>,
  allowedKeys: ReadonlySet<string>,
): string[] {
  return [...new Set(selectedKeys)].filter(key => allowedKeys.has(key));
}

export function hasWaypointSyncConflict(
  notes: UserNotes,
  sourceKey: string,
  targetKeys: Iterable<string>,
): boolean {
  const sourceGroupId = notes.waypoints[sourceKey]?.syncGroupId;
  return [...targetKeys].some(key => {
    const targetGroupId = notes.waypoints[key]?.syncGroupId;
    return Boolean(targetGroupId && targetGroupId !== sourceGroupId);
  });
}

export function filterWaypointAnnotationsForFlights(
  waypoints: Readonly<Record<string, WaypointAnnotation>>,
  visibleFlightKeys: ReadonlySet<string>,
): Record<string, WaypointAnnotation> {
  const visible: Record<string, WaypointAnnotation> = {};
  for (const [key, annotation] of Object.entries(waypoints)) {
    const match = /^(blue|red|neutral):(\d+):(\d+)$/.exec(key);
    if (!match || !visibleFlightKeys.has(`${match[1]}:${match[2]}`)) continue;
    visible[key] = { ...annotation };
  }

  const groupCounts = new Map<string, number>();
  for (const annotation of Object.values(visible)) {
    if (annotation.syncGroupId) {
      groupCounts.set(annotation.syncGroupId, (groupCounts.get(annotation.syncGroupId) ?? 0) + 1);
    }
  }
  for (const [key, annotation] of Object.entries(visible)) {
    if (annotation.syncGroupId && groupCounts.get(annotation.syncGroupId) === 1) {
      visible[key] = { purpose: annotation.purpose, notes: annotation.notes };
    }
  }
  return visible;
}

export function saveWaypointAnnotation(
  notes: UserNotes,
  key: string,
  value: WaypointAnnotation,
  applyToSyncGroup: boolean,
  allowedKeys?: ReadonlySet<string>,
): UserNotes | null {
  const normalized = normalizeWaypointAnnotation(value);
  const keys = applyToSyncGroup ? getSyncGroupMembers(notes, key) : [];
  const permittedKeys = allowedKeys ?? new Set(keys.length > 0 ? keys : [key]);
  const targets = intersectWaypointKeys(keys.length > 0 ? keys : [key], permittedKeys);
  if (targets.length === 0) return null;
  const waypoints = { ...notes.waypoints };
  for (const target of targets) {
    const existing = waypoints[target];
    const next = { ...normalized, syncGroupId: existing?.syncGroupId ?? normalized.syncGroupId };
    if (!hasWaypointAnnotationContent(next)) delete waypoints[target];
    else waypoints[target] = next;
  }
  if (Object.keys(waypoints).length > MAX_WAYPOINT_ANNOTATIONS) return null;
  return { ...notes, waypoints };
}

export function syncWaypointAnnotationGroup(
  notes: UserNotes,
  sourceKey: string,
  targetKeys: readonly string[],
  value: WaypointAnnotation,
  groupId: string,
  allowedKeys?: ReadonlySet<string>,
): UserNotes | null {
  const sourceGroupId = notes.waypoints[sourceKey]?.syncGroupId;
  if ((sourceGroupId && sourceGroupId !== groupId)
    || hasWaypointSyncConflict(notes, sourceKey, targetKeys)) return null;
  const requestedTargets = [
    ...(sourceGroupId ? getSyncGroupMembers(notes, sourceKey) : []),
    sourceKey,
    ...targetKeys,
  ];
  const permittedKeys = allowedKeys ?? new Set(requestedTargets);
  const safeTargets = intersectWaypointKeys(requestedTargets, permittedKeys).filter(isWaypointKey);
  if (safeTargets.length < 2 || !isSyncGroupId(groupId)) return null;
  const normalized = normalizeWaypointAnnotation(value);
  const waypoints = { ...notes.waypoints };
  for (const key of safeTargets) waypoints[key] = { ...normalized, syncGroupId: groupId };
  if (Object.keys(waypoints).length > MAX_WAYPOINT_ANNOTATIONS) return null;
  return { ...notes, waypoints };
}

export function leaveWaypointSyncGroup(notes: UserNotes, key: string): UserNotes {
  const existing = notes.waypoints[key];
  if (!existing?.syncGroupId) return notes;
  const groupId = existing.syncGroupId;
  const waypoints: Record<string, WaypointAnnotation> = {
    ...notes.waypoints,
    [key]: { purpose: existing.purpose, notes: existing.notes },
  };
  if (!hasWaypointAnnotationContent(waypoints[key])) delete waypoints[key];
  const remainingKeys = Object.entries(waypoints)
    .filter(([, annotation]) => annotation.syncGroupId === groupId)
    .map(([memberKey]) => memberKey);
  if (remainingKeys.length === 1) {
    const remainingKey = remainingKeys[0];
    const remaining = waypoints[remainingKey];
    waypoints[remainingKey] = { purpose: remaining.purpose, notes: remaining.notes };
    if (!hasWaypointAnnotationContent(waypoints[remainingKey])) delete waypoints[remainingKey];
  }
  return { ...notes, waypoints };
}

export function greatCircleDistanceNm(a: [number, number], b: [number, number]): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a[0]);
  const lat2 = radians(b[0]);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b[1] - a[1]);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function normalizeWaypointAnnotation(value: WaypointAnnotation): WaypointAnnotation {
  return {
    purpose: value.purpose.slice(0, MAX_WAYPOINT_PURPOSE_LENGTH),
    notes: value.notes.slice(0, MAX_WAYPOINT_NOTES_LENGTH),
    ...(value.syncGroupId && isSyncGroupId(value.syncGroupId) ? { syncGroupId: value.syncGroupId } : {}),
  };
}

export function hasWaypointAnnotationContent(value: WaypointAnnotation): boolean {
  return Boolean(value.purpose.trim() || value.notes.trim() || value.syncGroupId);
}

export function isWaypointKey(value: string): boolean {
  return /^(blue|red|neutral):\d+:\d+$/.test(value);
}

export function isSyncGroupId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isResolved(point: RoutePoint): boolean {
  return point.latlonResolved !== false
    && Number.isFinite(point.latlon[0])
    && Number.isFinite(point.latlon[1]);
}

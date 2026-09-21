import { describe, expect, it } from 'vitest';
import type { MissionData } from '../types/mission';
import { emptyUserNotes } from './notes';
import {
  findNearbyWaypoints,
  getSyncGroupMembers,
  greatCircleDistanceNm,
  saveWaypointAnnotation,
  syncWaypointAnnotationGroup,
  leaveWaypointSyncGroup,
  waypointAnnotationKey,
} from './waypointAnnotations';

function missionFixture(): MissionData {
  const flight = (groupId: number, callsign: string, points: Array<[number, number]>) => ({
    groupId, callsign, name: callsign, route: points.map((latlon, index) => ({ index, latlon, latlonResolved: true })),
  });
  const coalition = { flights: [], navPoints: [], airbases: [], support: [], aiGroups: [], zones: [], drawings: [] };
  return {
    coalitions: {
      blue: { ...coalition, flights: [flight(1, 'A', [[42, 43], [42.2, 43.2]]), flight(2, 'B', [[42.005, 43.005]])] },
      red: { ...coalition, flights: [flight(3, 'C', [[43, 44]])] },
      neutral: coalition,
    },
    userNotes: emptyUserNotes('fixture'),
  } as unknown as MissionData;
}

describe('waypoint annotation grouping', () => {
  it('calculates nautical-mile distance and finds only nearby points from other flights', () => {
    expect(greatCircleDistanceNm([0, 0], [0, 1])).toBeCloseTo(60.04, 1);
    const source = waypointAnnotationKey('blue', 1, 0);
    const candidates = findNearbyWaypoints(missionFixture(), source, 1);
    expect(candidates.map(candidate => candidate.key)).toEqual([waypointAnnotationKey('blue', 2, 0)]);
    expect(candidates[0].distanceNm).toBeLessThan(1);
  });

  it('groups explicitly selected points and applies later edits to the whole group', () => {
    const mission = missionFixture();
    const first = waypointAnnotationKey('blue', 1, 0);
    const second = waypointAnnotationKey('blue', 2, 0);
    const grouped = syncWaypointAnnotationGroup(
      mission.userNotes,
      first,
      [second],
      { purpose: 'IP', notes: 'Push north' },
      'sync_test',
    )!;
    expect(getSyncGroupMembers(grouped, first)).toEqual([first, second]);

    const edited = saveWaypointAnnotation(grouped, first, { purpose: 'Attack IP', notes: '15,000 ft' }, true)!;
    expect(edited.waypoints[first].purpose).toBe('Attack IP');
    expect(edited.waypoints[second].notes).toBe('15,000 ft');
    expect(edited.waypoints[second].syncGroupId).toBe('sync_test');

    const ungrouped = leaveWaypointSyncGroup(edited, first);
    expect(ungrouped.waypoints[first].syncGroupId).toBeUndefined();
    expect(ungrouped.waypoints[second].syncGroupId).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { MissionData } from '../types/mission';
import { emptyUserNotes } from './notes';
import {
  findNearbyWaypoints,
  filterWaypointAnnotationsForFlights,
  getSyncGroupMembers,
  getWaypointSyncTargets,
  greatCircleDistanceNm,
  hasWaypointSyncConflict,
  intersectWaypointKeys,
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

  it('drops stale selections when the visible candidate set changes', () => {
    const near = waypointAnnotationKey('blue', 2, 0);
    const formerCandidate = waypointAnnotationKey('red', 3, 0);
    expect(intersectWaypointKeys(
      new Set([near, formerCandidate]),
      new Set([near]),
    )).toEqual([near]);
    expect(intersectWaypointKeys(
      new Set([near]),
      new Set([formerCandidate]),
    )).toEqual([]);
  });

  it('does not mutate hidden sync members when group updates are visibility-scoped', () => {
    const mission = missionFixture();
    const first = waypointAnnotationKey('blue', 1, 0);
    const second = waypointAnnotationKey('blue', 2, 0);
    const hidden = waypointAnnotationKey('red', 3, 0);
    mission.userNotes.waypoints = {
      [first]: { purpose: 'Old', notes: '', syncGroupId: 'sync_visible' },
      [second]: { purpose: 'Old', notes: '', syncGroupId: 'sync_visible' },
      [hidden]: { purpose: 'Hidden value', notes: 'Keep me', syncGroupId: 'sync_visible' },
    };

    const updated = saveWaypointAnnotation(
      mission.userNotes,
      first,
      { purpose: 'Visible update', notes: '' },
      true,
      new Set([first, second]),
    )!;
    expect(updated.waypoints[first].purpose).toBe('Visible update');
    expect(updated.waypoints[second].purpose).toBe('Visible update');
    expect(updated.waypoints[hidden]).toEqual(mission.userNotes.waypoints[hidden]);
  });

  it('rejects reassignment from another group instead of stranding its members', () => {
    const notes = emptyUserNotes('groups');
    const first = waypointAnnotationKey('blue', 1, 0);
    const second = waypointAnnotationKey('blue', 2, 0);
    const third = waypointAnnotationKey('red', 3, 0);
    const fourth = waypointAnnotationKey('neutral', 4, 0);
    notes.waypoints = {
      [first]: { purpose: 'A', notes: '', syncGroupId: 'group_a' },
      [second]: { purpose: 'A', notes: '', syncGroupId: 'group_a' },
      [third]: { purpose: 'B', notes: '', syncGroupId: 'group_b' },
      [fourth]: { purpose: 'B', notes: '', syncGroupId: 'group_b' },
    };

    expect(hasWaypointSyncConflict(notes, first, [third])).toBe(true);
    expect(syncWaypointAnnotationGroup(notes, first, [third], { purpose: 'Merged?', notes: '' }, 'group_a')).toBeNull();
    expect(getSyncGroupMembers(notes, fourth)).toEqual([fourth, third].sort());
  });

  it('uses the same full target set when extending an existing group', () => {
    const notes = emptyUserNotes('extend');
    const first = waypointAnnotationKey('blue', 1, 0);
    const second = waypointAnnotationKey('blue', 2, 0);
    const third = waypointAnnotationKey('red', 3, 0);
    const added = waypointAnnotationKey('neutral', 4, 0);
    notes.waypoints = {
      [first]: { purpose: 'A', notes: '', syncGroupId: 'group_a' },
      [second]: { purpose: 'B', notes: '', syncGroupId: 'group_a' },
      [third]: { purpose: 'C', notes: '', syncGroupId: 'group_a' },
    };
    const allowed = new Set([first, second, third, added]);
    const targets = getWaypointSyncTargets(notes, first, [added], allowed);

    expect(targets).toEqual([first, second, third, added]);
    const updated = syncWaypointAnnotationGroup(
      notes,
      first,
      [added],
      { purpose: 'Merged', notes: 'Same value' },
      'group_a',
      allowed,
    )!;
    expect(targets.every(key => updated.waypoints[key].purpose === 'Merged')).toBe(true);
    expect(getSyncGroupMembers(updated, first)).toEqual([...targets].sort());
  });

  it('filters pilot waypoint records to exact visible flight keys and removes orphan group metadata', () => {
    const visible = waypointAnnotationKey('blue', 1, 0);
    const samePrefixButHidden = waypointAnnotationKey('blue', 10, 0);
    const hiddenPeer = waypointAnnotationKey('red', 3, 0);
    const filtered = filterWaypointAnnotationsForFlights({
      [visible]: { purpose: 'Visible', notes: '', syncGroupId: 'mixed_group' },
      [samePrefixButHidden]: { purpose: 'Hidden 10', notes: '' },
      [hiddenPeer]: { purpose: 'Secret', notes: 'Hidden details', syncGroupId: 'mixed_group' },
    }, new Set(['blue:1']));

    expect(filtered).toEqual({ [visible]: { purpose: 'Visible', notes: '' } });
  });

  it('removes an empty visible record when its only sync peer is hidden', () => {
    const visible = waypointAnnotationKey('blue', 1, 0);
    const hidden = waypointAnnotationKey('red', 3, 0);
    const filtered = filterWaypointAnnotationsForFlights({
      [visible]: { purpose: '', notes: '', syncGroupId: 'mixed_group' },
      [hidden]: { purpose: '', notes: '', syncGroupId: 'mixed_group' },
    }, new Set(['blue:1']));

    expect(filtered).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import type { Flight, MissionData, RoutePoint } from '../types/mission';
import { missionLocalDate, missionZuluDate } from '../utils/time';
import { buildTot, TOT_NEAR_METERS, TOT_NEAR_SECONDS } from './tot';

function point(index: number, name: string, eta: number, xy: [number, number], resolved = true): RoutePoint {
  return {
    index,
    name,
    action: 'Turning Point',
    xy,
    latlon: resolved ? [42 + index * 0.01, 42 + index * 0.01] : [0, 0],
    latlonResolved: resolved,
    alt: 6000,
    altType: 'BARO',
    speed: 200,
    eta,
    tasks: [],
  };
}

function flight(groupId: number, callsign: string, route: RoutePoint[]): Flight {
  return {
    groupId,
    name: callsign,
    callsign,
    type: 'FA-18C_hornet',
    task: 'CAP',
    frequency: 251,
    modulation: 0,
    hidden: false,
    units: [],
    route,
  };
}

function makeMission(startTime: number, blueFlights: Flight[], redFlights: Flight[] = []): MissionData {
  const coalition = (flights: Flight[]) => ({
    bullseye: { xy: [0, 0] as [number, number], latlon: [42, 42] as [number, number], latlonResolved: true },
    navPoints: [],
    airbases: [],
    flights,
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  });
  return {
    sourceFingerprint: 'tot-fixture',
    meta: {
      sortie: 'TOT fixture',
      description: '',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 1, Day: 1 },
      startTime,
      utcOffset: 3,
      meVersion: 1,
      images: [],
    },
    weather: {} as MissionData['weather'],
    coalitions: { blue: coalition(blueFlights), red: coalition(redFlights), neutral: coalition([]) },
    userNotes: {} as MissionData['userNotes'],
    issues: [],
  } as unknown as MissionData;
}

describe('buildTot (F7)', () => {
  it('lists the side points with a positive eta in time order and counts the eta 0 points', () => {
    const mission = makeMission(0, [
      flight(1, 'Viper 1', [point(0, 'Start', 0, [0, 0]), point(1, 'WP1', 600, [0, 5000]), point(2, 'WP2', 1500, [0, 9000])]),
      flight(2, 'Viper 2', [point(0, 'Start', 0, [0, 0]), point(1, 'WP1', 300, [5000, 0])]),
    ]);

    const result = buildTot(mission, 'blue');

    expect(result.zeroEtaCount).toBe(2);
    expect(result.rows.map(row => `${row.callsign}:${row.pointName}`)).toEqual([
      'Viper 2:WP1',
      'Viper 1:WP1',
      'Viper 1:WP2',
    ]);
  });

  it('marks two points of different flights that are close in time and distance as near', () => {
    const mission = makeMission(0, [
      flight(1, 'Viper 1', [point(1, 'WP1', 600, [0, 0])]),
      flight(2, 'Viper 2', [point(1, 'WP1', 630, [0, 500])]),
    ]);

    const [first, second] = buildTot(mission, 'blue').rows;

    expect(first.near.map(item => item.callsign)).toEqual(['Viper 2']);
    expect(second.near.map(item => item.callsign)).toEqual(['Viper 1']);
  });

  it('does not mark points that are too far apart in time or in distance', () => {
    const farInTime = makeMission(0, [
      flight(1, 'Viper 1', [point(1, 'WP1', 600, [0, 0])]),
      flight(2, 'Viper 2', [point(1, 'WP1', 600 + TOT_NEAR_SECONDS + 1, [0, 0])]),
    ]);
    const farInSpace = makeMission(0, [
      flight(1, 'Viper 1', [point(1, 'WP1', 600, [0, 0])]),
      flight(2, 'Viper 2', [point(1, 'WP1', 610, [0, TOT_NEAR_METERS + 1])]),
    ]);

    expect(buildTot(farInTime, 'blue').rows.every(row => row.near.length === 0)).toBe(true);
    expect(buildTot(farInSpace, 'blue').rows.every(row => row.near.length === 0)).toBe(true);
  });

  it('rolls the local and Zulu dates over past midnight', () => {
    // Start at 23:00 local (utcOffset 3): an eta of one hour crosses into the next day.
    const mission = makeMission(23 * 3600, [
      flight(1, 'Viper 1', [point(1, 'WP1', 3600, [0, 0])]),
    ]);

    const [row] = buildTot(mission, 'blue').rows;
    const oneHour = 3600 * 1000;

    expect(row.localDate.getTime() - missionLocalDate(mission.meta).getTime()).toBe(oneHour);
    expect(row.zuluDate.getTime() - missionZuluDate(mission.meta).getTime()).toBe(oneHour);
  });

  it('keeps a point with an unresolved position in the list without a resolved flag', () => {
    const mission = makeMission(0, [
      flight(1, 'Viper 1', [point(1, 'WP1', 600, [1000, 2000], false)]),
    ]);

    const [row] = buildTot(mission, 'blue').rows;

    expect(row.resolved).toBe(false);
    expect(row.xy).toEqual([1000, 2000]);
  });

  it('lists only the given side', () => {
    const mission = makeMission(0, [flight(1, 'Viper 1', [point(1, 'WP1', 600, [0, 0])])], [
      flight(2, 'Bandit 1', [point(1, 'WP1', 700, [0, 0])]),
    ]);

    expect(buildTot(mission, 'blue').rows.map(row => row.callsign)).toEqual(['Viper 1']);
    expect(buildTot(mission, 'red').rows.map(row => row.callsign)).toEqual(['Bandit 1']);
  });
});

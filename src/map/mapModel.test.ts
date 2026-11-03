// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AIGroup, Flight, MissionData, RoutePoint } from '../types/mission';
import { applyViewMode } from '../utils/viewMode';
import { dcsColorToCss, isResolvedLatLon, isSupportedTheatre } from './geometry';
import { buildDcsRows, buildMapModel, collectBounds, flightBounds } from './mapModel';
import { isLayerAvailable, isLayerOn, layerGroupsFor } from './mapLayers';

const point = (index: number, latlon: [number, number], resolved = true, xy: [number, number] = [index * 1000, 0]): RoutePoint => ({
  index,
  name: `WP${index}`,
  action: 'Turning Point',
  xy,
  latlon,
  latlonResolved: resolved,
  alt: 1000,
  altType: 'BARO',
  speed: 200,
  eta: index * 60,
  tasks: [],
}) as RoutePoint;

const flight = (groupId: number, callsign: string, route: RoutePoint[]): Flight => ({
  groupId,
  name: callsign,
  callsign,
  type: 'F-16C_50',
  task: 'CAS',
  frequency: 251,
  modulation: 0,
  hidden: false,
  units: [],
  route,
}) as Flight;

const group = (type: string, latlon: [number, number] | undefined, threatRange?: number): AIGroup => ({
  category: 'SAM',
  type,
  count: 1,
  position: [0, 0],
  latlon,
  latlonResolved: latlon !== undefined,
  threatRange,
  hidden: false,
  lateActivation: false,
  startTime: 0,
}) as AIGroup;

const coalition = (overrides: Partial<MissionData['coalitions']['blue']> = {}) => ({
  bullseye: { xy: [0, 0] as [number, number], latlon: [0, 0] as [number, number], latlonResolved: false },
  navPoints: [],
  airbases: [],
  flights: [],
  support: [],
  aiGroups: [],
  zones: [],
  drawings: [],
  ...overrides,
});

function makeMission(): MissionData {
  return {
    sourceFingerprint: 'fp',
    meta: { theatre: 'Caucasus', descriptionBlueTask: 'blue task', descriptionRedTask: 'red task' },
    weather: {},
    coalitions: {
      blue: coalition({
        flights: [flight(1, 'BLUE1', [point(1, [42, 42]), point(2, [42.1, 42.1], false)])],
        aiGroups: [group('BLUE-SAM', [42.2, 42.2], 20000)],
        bullseye: { xy: [1, 1], latlon: [42, 43], latlonResolved: true },
      }),
      red: coalition({
        flights: [flight(2, 'RED1', [point(1, [43, 43])])],
        aiGroups: [group('RED-SAM', [43.2, 43.2], 30000)],
      }),
      neutral: coalition(),
    },
    userNotes: {
      missionKey: 'k',
      smeac: {} as never,
      perFlight: {},
      waypoints: {},
      mapAnnotations: [],
    },
    issues: [],
  } as unknown as MissionData;
}

describe('buildMapModel', () => {
  it('creator view shows both coalitions and lists threat groups of the coalition opposite the displayed side', () => {
    const mission = makeMission();
    const blue = buildMapModel(mission, 'blue', 'creator');
    expect(blue.flights.map(entry => entry.flight.callsign)).toEqual(['BLUE1', 'RED1']);
    expect(blue.groups.map(entry => entry.item.type)).toEqual(['RED-SAM']);

    const red = buildMapModel(mission, 'red', 'creator');
    expect(red.groups.map(entry => entry.item.type)).toEqual(['BLUE-SAM']);
  });

  it('pilot view has no threat groups, and drops the opposing side and its unresolved points', () => {
    const mission = makeMission();
    const pilot = buildMapModel(applyViewMode(mission, 'pilot', 'blue'), 'blue', 'pilot');
    expect(pilot.groups).toEqual([]);
    expect(pilot.flights.map(entry => entry.flight.callsign)).toEqual(['BLUE1']);
    // The red bullseye is unresolved in the original but must not be counted for the pilot.
    expect(pilot.unresolved.map(entry => entry.side)).toEqual(['blue']);
    expect(pilot.bullseyes.map(entry => entry.side)).toEqual(['blue']);
  });

  it('counts unresolved route points and AI groups in creator view', () => {
    const creator = buildMapModel(makeMission(), 'blue', 'creator');
    const labels = creator.unresolved.map(entry => entry.label);
    expect(labels).toContain('BLUE1: WP2');
    expect(labels).toContain('Bullseye');
  });

  it('gives neutral flights no flight key, so they cannot be selected', () => {
    const mission = makeMission();
    mission.coalitions.neutral.flights = [flight(9, 'NEUT', [point(1, [42, 42])])];
    const model = buildMapModel(mission, 'blue', 'creator');
    expect(model.flights.find(entry => entry.flight.callsign === 'NEUT')?.key).toBeNull();
    expect(model.flights.find(entry => entry.flight.callsign === 'BLUE1')?.key).toBe('blue:1');
  });
});

describe('bounds', () => {
  it('fits the whole drawn map but not the annotations', () => {
    const mission = makeMission();
    const model = buildMapModel(mission, 'blue', 'creator');
    const bounds = collectBounds(model, 'Caucasus');
    expect(bounds.isValid()).toBe(true);
    expect(bounds.contains([43, 43])).toBe(true);
  });

  it('fits one flight to its own resolved route only', () => {
    const model = buildMapModel(makeMission(), 'blue', 'creator');
    const bounds = flightBounds(model, 'blue:1');
    expect(bounds?.contains([42, 42])).toBe(true);
    expect(bounds?.contains([43, 43])).toBe(false);
    expect(flightBounds(model, 'blue:99')).toBeNull();
  });
});

describe('unsupported maps', () => {
  it('lists every DCS point in the table rows and reports the theatre as unsupported', () => {
    const mission = makeMission();
    mission.meta.theatre = 'UnsupportedTestTheatre';
    expect(isSupportedTheatre('UnsupportedTestTheatre')).toBe(false);
    expect(isSupportedTheatre('Caucasus')).toBe(true);
    const rows = buildDcsRows(buildMapModel(mission, 'blue', 'creator'));
    expect(rows.some(row => row.name === 'BLUE1: WP1' && row.xy[0] === 1000)).toBe(true);
  });
});

describe('solo flight and route keys', () => {
  it('keeps only the solo flight when one is named, and drops the other flights from the off-map list', () => {
    const mission = makeMission();
    const solo = buildMapModel(mission, 'blue', 'creator', 'blue:1');
    expect(solo.flights.map(entry => entry.routeKey)).toEqual(['blue:1']);
    // BLUE1 has an unresolved point, so it stays in the off-map list; the points of other flights do not.
    const offMap = solo.unresolved.map(entry => entry.label);
    expect(offMap).toContain('BLUE1: WP2');
    expect(offMap.some(label => label.startsWith('RED1'))).toBe(false);
    const all = buildMapModel(mission, 'blue', 'creator', null);
    expect(all.flights.map(entry => entry.routeKey)).toEqual(['blue:1', 'red:2']);
  });

  it('names a solo flight that is not in the view by no flight at all', () => {
    const model = buildMapModel(makeMission(), 'blue', 'creator', 'red:99');
    expect(model.flights).toEqual([]);
  });

  it('gives neutral flights a route key while keeping them unselectable', () => {
    const mission = makeMission();
    mission.coalitions.neutral.flights = [flight(7, 'NEUT7', [point(1, [42, 42])])];
    const entry = buildMapModel(mission, 'blue', 'creator').flights.find(candidate => candidate.side === 'neutral');
    expect(entry?.routeKey).toBe('neutral:7');
    expect(entry?.key).toBeNull();
    expect(flightBounds(buildMapModel(mission, 'blue', 'creator'), 'neutral:7')).not.toBeNull();
  });
});

describe('layers', () => {
  it('uses the default when the stored layer state has no entry, so missing ids keep their default', () => {
    expect(isLayerOn({}, 'detection')).toBe(false);
    expect(isLayerOn({}, 'flights')).toBe(true);
    expect(isLayerOn({ detection: true }, 'detection')).toBe(true);
  });

  it('offers creator-only layers in creator view only', () => {
    expect(isLayerAvailable('threats', 'pilot')).toBe(false);
    expect(isLayerAvailable('zones', 'pilot')).toBe(false);
    expect(isLayerAvailable('support', 'pilot')).toBe(true);
    const pilotIds = layerGroupsFor('pilot').flatMap(group => group.layers);
    expect(pilotIds).not.toContain('threats');
    expect(pilotIds).not.toContain('enemies');
    expect(pilotIds).toContain('flights');
  });
});

describe('geometry helpers', () => {
  it('never treats the [0, 0] placeholder or an unresolved flag as a position', () => {
    expect(isResolvedLatLon([0, 0])).toBe(false);
    expect(isResolvedLatLon([42, 43], false)).toBe(false);
    expect(isResolvedLatLon([42, 43])).toBe(true);
    expect(isResolvedLatLon(undefined)).toBe(false);
  });

  it('converts DCS colours and rejects unusable values', () => {
    expect(dcsColorToCss([1, 0, 0])).toBe('rgb(255, 0, 0)');
    expect(dcsColorToCss([255, 0, 0, 128])).toBe('rgba(255, 0, 0, 0.5019607843137255)');
    expect(dcsColorToCss(['x', 0, 0])).toBeNull();
    expect(dcsColorToCss(undefined)).toBeNull();
  });
});

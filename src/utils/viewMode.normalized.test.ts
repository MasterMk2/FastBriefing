import { describe, expect, it } from 'vitest';
import { normalizeMission } from '../core/MissionNormalizer';
import { normalizedMissionJson } from '../export/exportModel';
import { applyViewMode } from './viewMode';

// D1 checks that start from a raw mission table, so the issues and lists are made by the normalizer itself
// (the other view tests build MissionData by hand and cannot see what the normalizer adds).

const settings = { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' };

interface GroupOptions {
  hidden?: boolean;
  lateActivation?: boolean;
}

function samGroup(groupId: number, type: string, options: GroupOptions = {}): Record<string, unknown> {
  return {
    groupId,
    hidden: options.hidden === true,
    lateActivation: options.lateActivation === true,
    units: [{ type, skill: 'Excellent', x: 100, y: 200, unitId: groupId * 10, name: type }],
  };
}

function clientFlight(groupId: number, clsid: string, options: GroupOptions = {}): Record<string, unknown> {
  return {
    groupId,
    hidden: options.hidden === true,
    task: 'CAP',
    callsign: { name: `Flight${groupId}` },
    frequency: 251000000,
    units: [{
      type: 'F-15C', skill: 'Client', x: 0, y: 0, unitId: groupId * 10, name: `Flight${groupId}`,
      payload: { fuel: 1000, chaff: 0, flare: 0, gun: 0, pylons: [{ n: 1, CLSID: clsid }] },
    }],
    route: { points: [] },
  };
}

function rawMission(options: {
  blueVehicles?: Record<string, unknown>[];
  bluePlanes?: Record<string, unknown>[];
  redPlanes?: Record<string, unknown>[];
  mission?: Record<string, unknown>;
  warehouses?: Record<string, unknown>;
  mapResource?: Record<string, string>;
}) {
  const side = (vehicles: Record<string, unknown>[] = [], planes: Record<string, unknown>[] = []) => ({
    country: [{
      plane: [{ category: 'plane', group: planes }],
      vehicle: [{ category: 'vehicle', group: vehicles }],
    }],
  });
  return {
    mission: {
      date: { Year: 2026, Month: 6, Day: 1 },
      weather: {},
      ...options.mission,
      coalition: {
        blue: side(options.blueVehicles, options.bluePlanes),
        red: side([], options.redPlanes),
        neutrals: {},
      },
    },
    theatre: 'Caucasus',
    warehouses: options.warehouses ?? { airports: {} },
    dictionary: {},
    mapResource: options.mapResource ?? {},
  };
}

const typesOf = (issues: { code: string; params?: Record<string, string | number> }[], code: string) =>
  issues.filter(issue => issue.code === code).map(issue => String(issue.params?.type ?? issue.params?.clsid ?? ''));

describe('pilot view drops the issues of hidden and late-activation groups (D1, G11)', () => {
  it('leaves out the unknown type and the unrecorded threat of a hidden own SAM group', () => {
    const normalized = normalizeMission(rawMission({ blueVehicles: [samGroup(1, 'ZZZ_SECRET_SAM', { hidden: true })] }), settings);
    // The creator still sees them.
    expect(typesOf(normalized.issues, 'unit.unknownType')).toContain('ZZZ_SECRET_SAM');
    const pilot = applyViewMode(normalized, 'pilot', 'blue');
    expect(pilot.coalitions.blue.aiGroups).toHaveLength(0);
    expect(typesOf(pilot.issues, 'unit.unknownType')).not.toContain('ZZZ_SECRET_SAM');
    expect(typesOf(pilot.issues, 'threat.rangeUnrecorded')).not.toContain('ZZZ_SECRET_SAM');
  });

  it('leaves out the issues of a late-activation own AI group', () => {
    const normalized = normalizeMission(rawMission({ blueVehicles: [samGroup(1, 'ZZZ_LATE_SAM', { lateActivation: true })] }), settings);
    const pilot = applyViewMode(normalized, 'pilot', 'blue');
    expect(typesOf(pilot.issues, 'unit.unknownType')).not.toContain('ZZZ_LATE_SAM');
  });

  it('leaves out the unknown weapon of a hidden own flight', () => {
    const normalized = normalizeMission(rawMission({ bluePlanes: [clientFlight(1, '{ZZZ_SECRET_POD}', { hidden: true })] }), settings);
    expect(typesOf(normalized.issues, 'weapon.unknownClsid')).toContain('{ZZZ_SECRET_POD}');
    const pilot = applyViewMode(normalized, 'pilot', 'blue');
    expect(typesOf(pilot.issues, 'weapon.unknownClsid')).not.toContain('{ZZZ_SECRET_POD}');
  });

  it.each([
    ['the hidden group comes first', true],
    ['the visible group comes first', false],
  ])('keeps an issue that a visible group also reports (%s)', (_label, hiddenFirst) => {
    const hidden = samGroup(1, 'ZZZ_SHARED_SAM', { hidden: true });
    const visible = samGroup(2, 'ZZZ_SHARED_SAM');
    const normalized = normalizeMission(rawMission({ blueVehicles: hiddenFirst ? [hidden, visible] : [visible, hidden] }), settings);
    const pilot = applyViewMode(normalized, 'pilot', 'blue');
    expect(typesOf(pilot.issues, 'unit.unknownType')).toEqual(['ZZZ_SHARED_SAM']);
    expect(pilot.issues.some(issue => issue.hiddenSource)).toBe(false);
  });
});

describe('pilot view withholds the opposing airbase list and briefing images (D1)', () => {
  it('empties the airbase list made from the opposing groups, also in the normalized JSON', () => {
    // A red CAP flight (hidden) takes off from a neutral field: the list would show where red flies from.
    const redCap = {
      ...clientFlight(7, '{RED_CAP_POD}', { hidden: true }),
      route: { points: [{ x: 5000, y: 6000, airdromeId: 21, alt: 0, speed: 0 }] },
    };
    const normalized = normalizeMission(rawMission({
      redPlanes: [redCap],
      warehouses: { airports: { 21: { coalition: 'NEUTRAL' } } },
    }), settings);
    expect(normalized.coalitions.red.airbases.map(item => item.id)).toEqual([21]);

    const pilot = applyViewMode(normalized, 'pilot', 'blue');
    expect(pilot.coalitions.red.airbases).toEqual([]);
    expect(normalizedMissionJson(pilot, 'pilot').coalitions.red.airbases).toEqual([]);
    // The displayed side's own list is not touched by this rule.
    expect(applyViewMode(normalized, 'pilot', 'red').coalitions.red.airbases.map(item => item.id)).toEqual([21]);
  });

  it('keeps only the displayed side, the neutral and the server briefing images', () => {
    const normalized = normalizeMission(rawMission({
      mission: {
        pictureFileNameB: ['ResKey_blue'],
        pictureFileNameR: ['ResKey_red'],
        pictureFileNameN: ['ResKey_neutral'],
        pictureFileNameServer: ['ResKey_server'],
      },
      mapResource: {
        ResKey_blue: 'blue.png', ResKey_red: 'red.png', ResKey_neutral: 'neutral.png', ResKey_server: 'server.png',
      },
    }), settings);
    expect(normalized.meta.images).toEqual(['blue.png', 'red.png', 'neutral.png', 'server.png']);

    const pilot = applyViewMode(normalized, 'pilot', 'blue');
    expect(pilot.meta.images).toEqual(['blue.png', 'neutral.png', 'server.png']);
    expect(pilot.meta.imagesBySide?.red).toEqual([]);
    expect(JSON.stringify(normalizedMissionJson(pilot, 'pilot'))).not.toContain('red.png');
    expect(applyViewMode(normalized, 'pilot', 'red').meta.images).toEqual(['red.png', 'neutral.png', 'server.png']);
  });

  it('keeps no image in pilot view when the images are not listed by side (built by hand)', () => {
    const normalized = normalizeMission(rawMission({}), settings);
    const handMade = { ...normalized, meta: { ...normalized.meta, images: ['unknown.png'], imagesBySide: undefined } };
    expect(applyViewMode(handMade, 'pilot', 'blue').meta.images).toEqual([]);
  });
});

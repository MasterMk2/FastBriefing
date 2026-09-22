import { describe, expect, it } from 'vitest';
import { normalizeMission } from './MissionNormalizer';
import utcOffsetData from '../data/utcOffsets.json';
import { formatTimeHHMM, missionLocalDate, missionZuluDate } from '../utils/time';
import { calculateBearing, calculateDistance } from '../utils/coordinates';

const settings = { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' };

function unit(type: string, skill = 'Excellent', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type, skill, x: 100, y: 200, unitId: 1, name: type, ...extra };
}

function makeMission(overrides: {
  weather?: Record<string, unknown>;
  coalition?: Record<string, unknown>;
  mission?: Record<string, unknown>;
  theatre?: string;
  mapResource?: Record<string, string>;
  dictionary?: Record<string, string>;
  warehouses?: Record<string, unknown>;
} = {}) {
  const samTypes = [
    'S_75M_Volhov', 'Kub', 'Hawk', 'NASAMS', 'Strela-1', 'ZSU-23-4',
    'SA-10', 'SA-11', 'SA-15', 'SA-19', 'Tor', 'Osa', 'Roland', 'Rapier',
    'Gepard', 'Vulcan', 'Shilka', 'ZU-23', 'Igla', 'Stinger', 'UnknownSAM',
  ];
  const vehicleGroups: Record<string, unknown>[] = samTypes.map((type, index) => ({
    groupId: index + 1,
    units: [unit(type)],
    hidden: false,
    lateActivation: false,
  }));

  const beaconTask = {
    id: 'WrappedAction',
    params: {
      action: {
        id: 'ActivateBeacon',
        params: { type: 4, callsign: 'TKR', channel: 11, modeChannel: 'X' },
      },
    },
  };
  const iclsTask = {
    id: 'WrappedAction',
    params: { action: { id: 'ActivateICLS', params: { channel: 12, callsign: 'TKR' } } },
  };
  const link4Task = {
    id: 'WrappedAction',
    params: { action: { id: 'ActivateLink4', params: { frequency: 305000000, channel: 4 } } },
  };
  const tanker = {
    task: 'Tanker',
    callsign: { name: 'Texaco' },
    frequency: 251000000,
    units: [unit('CVN_71', 'Excellent', { x: 1000, y: 2000 })],
    route: { points: [{ x: 1000, y: 2000, alt: 6000, speed: 180, task: { id: 'ComboTask', params: { tasks: [beaconTask, iclsTask, link4Task] } } }] },
  };
  const refueling = {
    task: 'Refueling',
    callsign: { name: 'Texaco Refueling' },
    frequency: 252000000,
    units: [unit('KC-135', 'Excellent', { x: 1100, y: 2100 })],
    route: { points: [{ x: 1100, y: 2100, alt: 6000, speed: 180 }] },
  };
  const jtac = {
    task: 'GroundAttack',
    frequency: 305000000,
    units: [unit('JTAC', 'Excellent', { name: 'Axeman', x: 300, y: 400 })],
    route: { points: [{ task: { id: 'ComboTask', params: { tasks: [{ id: 'FAC_EngageGroup', params: { designation: 168 } }] } } }] },
  };
  const payload = {
    fuel: 1000,
    chaff: 120,
    flare: 60,
    gun: 510,
    pylons: [
      { n: 2, CLSID: '{40EF17B7-F508-45de-8566-6FFECC0C1AB8}' },
      { n: 3, CLSID: '{GBU-38}' },
      { n: 4, CLSID: '{CLSID_UNLISTED}' },
    ],
  };
  const flight = {
    task: 'CAS',
    callsign: { name: 'Viper' },
    frequency: 251000000,
    units: [unit('F-15E', 'Client', { payload })],
    route: { points: [] },
  };

  const coalitionSide = {
    country: [{
      plane: [{ category: 'plane', group: [flight, tanker, refueling] }],
      ship: [{ category: 'ship', group: [] }],
      vehicle: [{ category: 'vehicle', group: vehicleGroups.concat([jtac]) }],
    }],
  };

  return {
    mission: {
      date: { Year: 2026, Month: 9, Day: 6 },
      ...overrides.mission,
      weather: {
        qnh: 760,
        season: { temperature: 8, dewPoint: -2 },
        wind: { atGround: { dir: 90, speed: 2 } },
        visibility: { distance: 10000 },
        clouds: { preset: 'Preset1', base: 1500 },
        ...overrides.weather,
      },
      coalition: { blue: coalitionSide, red: {}, neutrals: {}, ...overrides.coalition },
    },
    theatre: overrides.theatre ?? 'Caucasus',
    warehouses: overrides.warehouses ?? { airports: {} },
    dictionary: overrides.dictionary ?? {},
    mapResource: overrides.mapResource ?? {},
  };
}

describe('MissionNormalizer reference-backed layers', () => {
  it('resolves major SAM/AAA threat rings and warns on unknown types', () => {
    const normalized = normalizeMission(makeMission(), settings);
    const groups = normalized.coalitions.blue.aiGroups;
    const expectedTypes = [
      'S_75M_Volhov', 'Kub', 'Hawk', 'NASAMS', 'Strela-1', 'ZSU-23-4',
      'SA-10', 'SA-11', 'SA-15', 'SA-19', 'Tor', 'Osa', 'Roland', 'Rapier',
      'Gepard', 'Vulcan', 'Shilka', 'ZU-23', 'Igla', 'Stinger',
    ];

    for (const type of expectedTypes) {
      expect(groups.find(group => group.type === type)?.threatRange, type).toBeGreaterThan(0);
    }
    expect(normalized.warnings).toContain('脅威半径が未収録のため地図に描画できません: UnknownSAM');
  });

  it('normalizes payload resources, readable weapon names, weight, and warnings', () => {
    const normalized = normalizeMission(makeMission(), settings);
    const normalizedPayload = normalized.coalitions.blue.flights[0].units[0].payload;

    expect(normalizedPayload.fuel).toBe(1000);
    expect(normalizedPayload.chaff).toBe(120);
    expect(normalizedPayload.flare).toBe(60);
    expect(normalizedPayload.gun).toBe(510);
    expect(normalizedPayload.pylons[0].name).toContain('AIM-120C');
    expect(normalizedPayload.pylons[1].name).toContain('GBU-38');
    expect(normalizedPayload.pylons[2].name).toBe('UNLISTED (未収録)');
    expect(normalizedPayload.weight).toBeCloseTo(1402.48, 2);
    expect(normalized.warnings).toContain('未知の兵装 CLSID: {CLSID_UNLISTED}');
  });

  it('returns empty dictionary values instead of leaking raw keys into the UI', () => {
    const normalized = normalizeMission(makeMission({
      mission: {
        sortie: 'DictKey_sortie_5',
        descriptionText: 'DictKey_descriptionText_1',
        pictureFileNameB: ['ResKey_empty', 'ResKey_missing'],
      },
      dictionary: {
        DictKey_sortie_5: '',
        DictKey_descriptionText_1: '',
      },
      mapResource: {
        ResKey_empty: '',
      },
    }), settings);

    expect(normalized.meta.sortie).toBe('');
    expect(normalized.meta.description).toBe('');
    expect(normalized.meta.sortie).not.toMatch(/^DictKey_/);
    expect(normalized.meta.description).not.toMatch(/^DictKey_/);
    expect(normalized.meta.images).toEqual(['', 'ResKey_missing']);
  });

  it('normalizes sparse numeric-key collections and preserves source indexes', () => {
    const flightGroup = {
      groupId: 900,
      name: 'Sparse flight',
      callsign: { name: 'Sparse' },
      units: {
        '1': unit('F-15E', 'Client', {
          payload: {
            pylons: {
              '1': { CLSID: '{AIM-9L}' },
              '3': { CLSID: 'AIM-120C' },
            },
          },
          Radio: {
            channels: {
              '1': { frequency: 251000000, modulation: 0 },
              '3': { frequency: 305000000, modulation: 1 },
            },
          },
        }),
        '3': unit('F-15E', 'Excellent'),
      },
      route: {
        points: {
          '1': { x: 100, y: 200 },
          '3': { x: 300, y: 400 },
        },
      },
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: {
          nav_points: {
            '2': { name: 'Sparse nav', x: 500, y: 600 },
          },
          country: {
            '1': {
              plane: {
                group: {
                  '1': flightGroup,
                },
              },
            },
          },
        },
        red: {},
        neutrals: {},
      },
    }), settings);

    const flight = normalized.coalitions.blue.flights[0];
    expect(flight.units).toHaveLength(2);
    expect(flight.route.map(point => point.index)).toEqual([1, 3]);
    expect(flight.route[1].leg?.distance).toBeCloseTo(calculateDistance(...flight.route[0].latlon, ...flight.route[1].latlon));
    expect(flight.route[1].leg?.trueBearing).toBeCloseTo(calculateBearing(...flight.route[0].latlon, ...flight.route[1].latlon));
    expect(flight.units[0].radios).toEqual([
      { channel: 1, frequency: 251, modulation: 0, name: '' },
      { channel: 3, frequency: 305, modulation: 1, name: '' },
    ]);
    expect(flight.units[0].payload.pylons.map(pylon => pylon.station)).toEqual(['1', '3']);
    expect(flight.units[0].payload.pylons[0].name).toContain('AIM-9L');
    expect(flight.units[0].payload.pylons[1].name).toContain('AIM-120C');
    expect(normalized.coalitions.blue.navPoints.map(point => point.index)).toEqual([2]);
  });

  it('normalizes current DCS multi-radio banks with scalar channels and parallel metadata', () => {
    const bankedRadioFlight = {
      groupId: 901,
      name: 'Banked radio flight',
      callsign: { name: 'Banked' },
      frequency: 251000000,
      units: [unit('AH-64D_BLK_II', 'Client', {
        Radio: {
          '1': {
            channels: {
              '1': 127.5,
              '3': 305000000,
              '5': 0,
            },
            modulations: {
              '1': 0,
              '3': 1,
            },
            channelsNames: {
              '1': 'VHF preset',
              '3': 'UHF preset',
            },
          },
          '2': {
            channels: [225, 240],
            modulations: [0, 1],
            channelsNames: ['Radio two primary', 'Radio two alternate'],
          },
        },
      })],
      route: { points: [] },
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: {
          country: [{ plane: [{ category: 'plane', group: [bankedRadioFlight] }] }],
        },
        red: {},
        neutrals: {},
      },
    }), settings);

    expect(normalized.coalitions.blue.flights[0].units[0].radios).toEqual([
      { radio: 1, channel: 1, frequency: 127.5, modulation: 0, name: 'VHF preset' },
      { radio: 1, channel: 3, frequency: 305, modulation: 1, name: 'UHF preset' },
      { radio: 2, channel: 1, frequency: 225, modulation: 0, name: 'Radio two primary' },
      { radio: 2, channel: 2, frequency: 240, modulation: 1, name: 'Radio two alternate' },
    ]);
  });

  it('keeps radioSet channels as a fallback and accepts MHz scalar values', () => {
    const fallbackRadioFlight = {
      groupId: 902,
      name: 'Fallback radio flight',
      callsign: { name: 'Fallback' },
      frequency: 251000000,
      units: [unit('Legacy module', 'Client', {
        radioSet: {
          channels: {
            '2': 251,
          },
          modulations: {
            '2': 1,
          },
          channelsNames: {
            '2': 'Fallback preset',
          },
        },
      })],
      route: { points: [] },
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: {
          country: [{ plane: [{ category: 'plane', group: [fallbackRadioFlight] }] }],
        },
        red: {},
        neutrals: {},
      },
    }), settings);

    expect(normalized.coalitions.blue.flights[0].units[0].radios).toEqual([
      { channel: 2, frequency: 251, modulation: 1, name: 'Fallback preset' },
    ]);
  });

  it('extracts TACAN and does not duplicate a carrier classified as Tanker', () => {
    const normalized = normalizeMission(makeMission(), settings);
    const support = normalized.coalitions.blue.support;
    const tanker = support.filter(asset => asset.callsign === 'Texaco');

    expect(tanker).toHaveLength(1);
    expect(tanker[0].kind).toBe('tanker');
    expect(tanker[0].tacan?.channel).toBe('11');
    expect(tanker[0].tacan?.mode).toBe('X');
    expect(tanker[0].tacan?.callsign).toBe('TKR');
    expect(tanker[0].icls?.channel).toBe(12);
    expect(tanker[0].link4?.channel).toBe(4);
  });

  it('normalizes a Refueling task as tanker while retaining legacy Tanker support', () => {
    const normalized = normalizeMission(makeMission(), settings);
    const support = normalized.coalitions.blue.support;

    expect(support.find(asset => asset.callsign === 'Texaco')?.kind).toBe('tanker');
    expect(support.find(asset => asset.callsign === 'Texaco Refueling')?.kind).toBe('tanker');
    expect(support.filter(asset => asset.kind === 'tanker')).toHaveLength(2);
  });

  it('detects JTAC/FAC groups and keeps laser code data when present', () => {
    const normalized = normalizeMission(makeMission(), settings);
    const jtac = normalized.coalitions.blue.support.find(asset => asset.kind === 'jtac');

    expect(jtac).toBeDefined();
    expect(jtac?.jtac?.unitType).toBe('JTAC');
    expect(jtac?.laserCode).toBe(168);
  });

  it('resolves cloud presets and warns for unknown presets', () => {
    const known = normalizeMission(makeMission(), settings);
    expect(known.weather.clouds.label).toBe('Light Scattered 1');

    const unknown = normalizeMission(makeMission({ weather: { clouds: { preset: 'RainyPreset99', base: 900 } } }), settings);
    expect(unknown.warnings).toContain('未知の雲プリセット: RainyPreset99');
  });

  it('resolves all briefing image resource keys when DCS provides Lua arrays', () => {
    const normalized = normalizeMission(makeMission({
      mission: {
        pictureFileNameB: ['ResKey_blue_1', 'ResKey_blue_2'],
        pictureFileNameR: ['ResKey_red_1'],
        pictureFileNameN: ['ResKey_neutral_1'],
        pictureFileNameServer: ['ResKey_server_1'],
      },
      mapResource: {
        ResKey_blue_1: 'brief-blue-1.png',
        ResKey_blue_2: 'brief-blue-2.png',
        ResKey_red_1: 'brief-red.png',
        ResKey_neutral_1: 'brief-neutral.png',
        ResKey_server_1: 'brief-server.png',
      },
    }), settings);

    expect(normalized.meta.images).toEqual([
      'brief-blue-1.png',
      'brief-blue-2.png',
      'brief-red.png',
      'brief-neutral.png',
      'brief-server.png',
    ]);
  });

  it('keeps supporting the legacy direct-string briefing image fields', () => {
    const normalized = normalizeMission(makeMission({
      mission: {
        pictureFileNameB: 'ResKey_blue',
        pictureFileNameR: 'ResKey_red',
        pictureFileNameN: 'brief-neutral.png',
        pictureFileNameServer: 'ResKey_server',
      },
      mapResource: {
        ResKey_blue: 'brief-blue.png',
        ResKey_red: 'brief-red.png',
        ResKey_server: 'brief-server.png',
      },
    }), settings);

    expect(normalized.meta.images).toEqual([
      'brief-blue.png',
      'brief-red.png',
      'brief-neutral.png',
      'brief-server.png',
    ]);
  });

  it('returns no briefing images when all image fields are absent', () => {
    const normalized = normalizeMission(makeMission(), settings);

    expect(normalized.meta.images).toEqual([]);
  });

  it('normalizes the actual DCS country category shape, including static groups', () => {
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: {
          country: [{
            plane: {
              group: [{
                groupId: 501,
                name: 'Actual flight',
                callsign: { name: 'Actual' },
                units: [unit('F-16C_50', 'Client', { x: 1000, y: 2000 })],
                route: { points: [{ x: 1000, y: 2000, airdromeId: 77 }] },
              }, {
                groupId: 502,
                task: 'Tanker',
                callsign: { name: 'Texaco actual' },
                units: [unit('KC-135', 'Excellent', { x: 1100, y: 2100 })],
                route: { points: [{ x: 1100, y: 2100 }] },
              }],
            },
            vehicle: {
              group: [{
                groupId: 503,
                units: [unit('SA-10', 'Excellent', { x: 1200, y: 2200 })],
              }],
            },
            static: {
              group: [{
                groupId: 504,
                units: [unit('House1', 'Excellent', { x: 1300, y: 2300 })],
              }],
            },
          }],
        },
        red: {},
        neutrals: {},
      },
      warehouses: {
        airports: {
          77: { x: 1000, y: 2000, name: 'Actual Airbase', coalition: 'BLUE' },
        },
      },
    }), settings);

    expect(normalized.coalitions.blue.flights).toHaveLength(1);
    expect(normalized.coalitions.blue.flights[0].callsign).toBe('Actual');
    expect(normalized.coalitions.blue.support).toHaveLength(1);
    expect(normalized.coalitions.blue.support[0].callsign).toBe('Texaco actual');
    expect(normalized.coalitions.blue.airbases).toHaveLength(1);
    expect(normalized.coalitions.blue.airbases[0].name).toBe('Actual Airbase');
    expect(normalized.coalitions.blue.aiGroups.map(group => group.type)).toContain('SA-10');
    expect(normalized.coalitions.blue.aiGroups.map(group => group.type)).toContain('House1');
  });

  it('emits one airbase per field, positioned from the waypoint, for a real warehouses table', () => {
    // The fixture above hands warehouses.airports a `name` and an `x`/`y`.
    // DCS writes NEITHER: an airports entry holds only supply state
    // (coalition, fuel levels, size, ...), which is why that test passed while
    // every real mission produced nameless airbases stacked on one point.
    // Verified against a real .miz: zero ["name"], zero ["x"], zero ["y"] keys
    // under ["airports"], and 30 airdromeId references for 3 distinct fields.
    const takeoff = (airdromeId: number, x: number, y: number) => ({ x, y, airdromeId });
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: {
          country: [{
            plane: {
              group: [{
                groupId: 601,
                name: 'First',
                callsign: { name: 'First' },
                units: [unit('F-16C_50', 'Client', { x: 5000, y: 6000 })],
                // Same field on departure and recovery, as DCS writes it.
                route: { points: [takeoff(21, 5000, 6000), { x: 9000, y: 9000 }, takeoff(21, 5000, 6000)] },
              }, {
                groupId: 602,
                name: 'Second',
                callsign: { name: 'Second' },
                units: [unit('F-16C_50', 'Client', { x: 5000, y: 6000 })],
                // A different group departing the SAME field must not add a
                // second entry -- dedup has to span groups, not just points.
                route: { points: [takeoff(21, 5000, 6000), takeoff(44, 7000, 8000)] },
              }],
            },
          }],
        },
        red: {},
        neutrals: {},
      },
      warehouses: {
        airports: {
          21: { coalition: 'BLUE', size: 100, speed: 16.666666 },
          44: { coalition: 'BLUE', size: 100, speed: 16.666666 },
        },
      },
    }), settings);

    const airbases = normalized.coalitions.blue.airbases;
    // Five airdromeId references, two fields.
    expect(airbases.map(base => base.id)).toEqual([21, 44]);

    // Each field keeps its own position instead of collapsing onto the
    // projection of x=0, y=0.
    const positions = new Set(airbases.map(base => JSON.stringify(base.latlon)));
    expect(positions.size).toBe(2);
    for (const base of airbases) {
      expect(base.latlon).not.toEqual([0, 0]);
      expect(base.latlonResolved).toBe(true);
    }

    // No name is recoverable from a .miz; the map supplies the fallback label.
    expect(airbases.map(base => base.name)).toEqual(['', '']);
  });

  it('normalizes mission-level zones and drawings once, retaining coalition fields for the UI', () => {
    const missionZone = {
      zoneId: 101,
      name: 'Mission polygon',
      x: 100,
      y: 200,
      radius: 0,
      type: 2,
      verticies: [{ x: 90, y: 190 }, { x: 110, y: 210 }],
      color: [1, 0, 0, 1],
      hidden: false,
    };
    const missionCircle = {
      zoneId: 102,
      name: 'Mission circle',
      x: 300,
      y: 400,
      radius: 500,
      type: 0,
      vertices: [{ x: 300, y: 400 }],
      color: [0, 1, 0, 1],
      hidden: true,
    };
    const coalitionOnlyZone = {
      zoneId: 999,
      name: 'Coalition-only legacy fixture',
      x: 900,
      y: 900,
      radius: 25,
      type: 0,
      color: [0, 0, 1, 1],
      hidden: false,
    };
    const coalitionOnlyDrawing = {
      layers: [{
        name: 'Coalition-only legacy layer',
        visible: true,
        objects: [],
      }],
    };
    const normalized = normalizeMission(makeMission({
      mission: {
        triggers: { zones: [missionZone, missionCircle] },
        drawings: {
          layers: [{
            name: 'Common',
            visible: true,
            objects: [{
              primitiveType: 'Line',
              points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
              colorString: '#00ff00',
              thickness: 2,
              style: 1,
              name: 'Mission line',
            }],
          }],
        },
      },
      coalition: { blue: { zones: [coalitionOnlyZone], drawings: coalitionOnlyDrawing } },
    }), settings);

    expect(normalized.coalitions.blue.zones).toHaveLength(2);
    expect(normalized.coalitions.blue.zones[0].name).toBe('Mission polygon');
    expect(normalized.coalitions.blue.zones[0].vertices).toEqual([[90, 190], [110, 210]]);
    expect(normalized.coalitions.blue.zones).toBe(normalized.coalitions.red.zones);
    expect(normalized.coalitions.red.zones).toBe(normalized.coalitions.neutral.zones);
    expect(normalized.coalitions.blue.drawings).toHaveLength(1);
    expect(normalized.coalitions.blue.drawings[0].objects[0].name).toBe('Mission line');
    expect(normalized.coalitions.blue.drawings).toBe(normalized.coalitions.red.drawings);
    expect(normalized.coalitions.red.drawings).toBe(normalized.coalitions.neutral.drawings);
  });

  it('uses the largest threat radius in a mixed ground group and records its unit type', () => {
    const mixedGroup = {
      group: [{
        groupId: 700,
        units: [unit('S-300PS 54K6 cp'), unit('S-300PS 5P85C ln')],
        hidden: false,
        lateActivation: false,
      }],
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: { country: [{ vehicle: [mixedGroup] }] },
        red: {},
        neutrals: {},
      },
    }), settings);
    const group = normalized.coalitions.blue.aiGroups[0];

    expect(group.type).toBe('S-300PS 54K6 cp');
    expect(group.threatRange).toBe(120000);
    expect(group.threatRangeSource).toBe('reference');
    expect(group.threatRangeUnitType).toBe('S-300PS 5P85C ln');
  });

  it('keeps a larger search radar detection range separate from a launcher threat range', () => {
    const mixedGroup = {
      group: [{
        groupId: 701,
        units: [unit('SNR_75V'), unit('S_75M_Volhov')],
        hidden: false,
        lateActivation: false,
      }],
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: { country: [{ vehicle: [mixedGroup] }] },
        red: {},
        neutrals: {},
      },
    }), settings);
    const group = normalized.coalitions.blue.aiGroups[0];

    expect(group.threatRange).toBe(43000);
    expect(group.threatRangeSource).toBe('reference');
    expect(group.threatRangeUnitType).toBe('S_75M_Volhov');
    expect(group.detectionRange).toBe(100000);
    expect(group.detectionRangeUnitType).toBe('SNR_75V');
  });

  it('does not fall back to a detection-only range for an EWR group', () => {
    const ewrGroup = {
      group: [{
        groupId: 702,
        units: [unit('55G6 EWR')],
        hidden: false,
        lateActivation: false,
      }],
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: { country: [{ vehicle: [ewrGroup] }] },
        red: {},
        neutrals: {},
      },
    }), settings);
    const group = normalized.coalitions.blue.aiGroups[0];

    expect(group.threatRange).toBe(0);
    expect(group.detectionRange).toBe(400000);
    expect(group.detectionRangeUnitType).toBe('55G6 EWR');
    expect(normalized.warnings).not.toContain('脅威半径が未収録のため地図に描画できません: 55G6 EWR');
  });

  it('does not warn about unrecorded threat radii for aircraft groups', () => {
    const aircraftGroup = {
      category: 'plane',
      group: [{ units: [unit('F-16C_50')] }],
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: { country: [{ plane: [aircraftGroup] }] },
        red: {},
        neutrals: {},
      },
    }), settings);

    expect(normalized.warnings).not.toContain('脅威半径が未収録のため地図に描画できません: F-16C_50');
    expect(normalized.coalitions.blue.aiGroups[0].threatRangeSource).toBeUndefined();
  });

  it('recognizes confirmed non-threat vehicles and gives Bradley a weapon range', () => {
    const vehicleGroups = {
      group: [
        { units: [unit('Hummer')] },
        { units: [unit('M978 HEMTT Tanker')] },
        { units: [unit('M 818')] },
        { units: [unit('M-2 Bradley')] },
      ],
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: { country: [{ vehicle: vehicleGroups }] },
        red: {},
        neutrals: {},
      },
    }), settings);
    const groups = normalized.coalitions.blue.aiGroups;

    for (const type of ['Hummer', 'M978 HEMTT Tanker', 'M 818']) {
      expect(groups.find(group => group.type === type)?.threatRange, type).toBe(0);
      expect(normalized.warnings).not.toContain(`脅威半径が未収録のため地図に描画できません: ${type}`);
    }
    expect(groups.find(group => group.type === 'M-2 Bradley')?.threatRange).toBeGreaterThan(0);
    expect(normalized.warnings).not.toContain('脅威半径が未収録のため地図に描画できません: M-2 Bradley');
  });

  it('does not warn for the confirmed non-threat units from the real mission', () => {
    const nonThreatTypes = [
      'house1arm',
      'GAZ-3308',
      'Ural-4320T',
      'ZIL-131 KUNG',
      'ATMZ-5',
      'Ural-4320 APA-5D',
      'ZiL-131 APA-80',
      'Ship_Tilde_Supply',
      'speedboat',
      'ELNYA',
    ];
    const vehicleGroups = {
      group: nonThreatTypes.map((type, index) => ({
        groupId: 800 + index,
        units: [unit(type)],
        hidden: false,
        lateActivation: false,
      })),
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: {
          country: [{
            vehicle: vehicleGroups,
            ship: vehicleGroups,
          }],
        },
        red: {},
        neutrals: {},
      },
    }), settings);
    const groups = normalized.coalitions.blue.aiGroups;

    for (const type of nonThreatTypes) {
      expect(groups.find(group => group.type === type), type).toMatchObject({ threatRange: 0, detectionRange: 0 });
      expect(normalized.warnings).not.toContain(`脅威半径が未収録のため地図に描画できません: ${type}`);
    }
  });

  it('separates unknown-unit warnings from missing-threat-range warnings', () => {
    const unknownGroup = {
      group: [{
        groupId: 900,
        units: [unit('UnknownSAM')],
        hidden: false,
        lateActivation: false,
      }],
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: { country: [{ vehicle: [unknownGroup] }] },
        red: {},
        neutrals: {},
      },
    }), settings);

    expect(normalized.warnings).toContain('参照データに未収録のユニット: UnknownSAM');
    expect(normalized.warnings).toContain('脅威半径が未収録のため地図に描画できません: UnknownSAM');
    expect(normalized.warnings.filter(warning => warning.includes('UnknownSAM'))).toHaveLength(2);
  });

  it('uses the pydcs ship engagement and detection ranges for the four known armed ships', () => {
    const shipTypes = ['CHAP_Project22160_TorM2KM', 'MOSCOW', 'REZKY', 'CV_1143_5'];
    const shipGroups = {
      group: shipTypes.map((type, index) => ({
        groupId: 950 + index,
        units: [unit(type)],
        hidden: false,
        lateActivation: false,
      })),
    };
    const normalized = normalizeMission(makeMission({
      coalition: {
        blue: { country: [{ ship: [shipGroups] }] },
        red: {},
        neutrals: {},
      },
    }), settings);
    const groups = normalized.coalitions.blue.aiGroups;
    const expectedRanges: Record<string, [number, number]> = {
      CHAP_Project22160_TorM2KM: [25000, 80000],
      MOSCOW: [75000, 160000],
      REZKY: [16000, 30000],
      CV_1143_5: [12000, 25000],
    };

    for (const [type, [threatRange, detectionRange]] of Object.entries(expectedRanges)) {
      expect(groups.find(group => group.type === type), type).toMatchObject({ threatRange, detectionRange });
      expect(normalized.warnings).not.toContain(`脅威半径が未収録のため地図に描画できません: ${type}`);
    }
  });

  it('matches all pydcs theatre UTC offsets', () => {
    // Source: pydcs dcs/terrain/<map>/<map>.py utc_offset, checked in 2026-09.
    // Normandy and TheChannel also cross-check ED forum.dcs.world/topic/386890.
    const expectedOffsets: Record<string, number> = {
      Caucasus: 4,
      GermanyCW: 2,
      MarianaIslands: 10,
      Nevada: -8,
      Normandy: 0,
      PersianGulf: 4,
      Sinai: 2,
      Syria: 3,
      Kola: 3,
      Falklands: -3,
      TheChannel: 2,
    };
    const actualOffsets = utcOffsetData as unknown as Record<string, unknown>;

    expect(Object.keys(actualOffsets).filter(key => key !== '_source').sort()).toEqual(Object.keys(expectedOffsets).sort());
    for (const [theatre, expectedOffset] of Object.entries(expectedOffsets)) {
      expect(actualOffsets[theatre], theatre).toBe(expectedOffset);
    }

    const metadataKeyTheatre = normalizeMission(makeMission({ theatre: '_source' }), settings);
    expect(metadataKeyTheatre.meta.utcOffset).toBe(0);
    expect(metadataKeyTheatre.warnings).toContain('UTC オフセット未収録: _source');
  });

  it.each([
    ['GermanyCW', 2, '06:00'],
    ['Normandy', 0, '08:00'],
    ['TheChannel', 2, '06:00'],
  ] as const)('resolves %s UTC offset and calculates Zulu time', (theatre, expectedOffset, expectedZulu) => {
    const normalized = normalizeMission(makeMission({
      mission: {
        date: { Year: 2025, Month: 6, Day: 1 },
        start_time: 28800,
      },
      theatre,
    }), settings);

    expect(normalized.meta.utcOffset).toBe(expectedOffset);
    expect(formatTimeHHMM(missionLocalDate(normalized.meta))).toBe('08:00');
    expect(formatTimeHHMM(missionZuluDate(normalized.meta))).toBe(expectedZulu);
  });

  it('resolves Caucasus UTC offset from the theatre table and produces Zulu 04:00', () => {
    const normalized = normalizeMission(makeMission({
      mission: {
        date: { Year: 2025, Month: 5, Day: 1 },
        start_time: 28800,
      },
      theatre: 'Caucasus',
    }), settings);

    expect(normalized.meta.utcOffset).toBe(4);
    expect(formatTimeHHMM(missionZuluDate(normalized.meta))).toBe('04:00');

    const explicit = normalizeMission(makeMission({
      mission: { utcOffset: 9 },
      theatre: 'Caucasus',
    }), settings);
    expect(explicit.meta.utcOffset).toBe(9);
  });

  it('marks coordinates unresolved and warns once for an unsupported theatre', () => {
    const flightGroup = {
      category: 'plane',
      group: [{
        units: [unit('F-15E', 'Client')],
        route: { points: [{ x: 500, y: 600 }] },
      }],
    };
    const tankerGroup = {
      category: 'plane',
      group: [{
        task: 'Tanker',
        callsign: { name: 'Texaco' },
        units: [unit('KC-135', 'Excellent', { x: 700, y: 800 })],
        route: { points: [] },
      }],
    };
    const groundGroup = {
      category: 'vehicle',
      group: [{ units: [unit('S-300PS 54K6 cp')] }],
    };
    const normalized = normalizeMission(makeMission({
      theatre: 'Afghanistan',
      coalition: {
        blue: {
          nav_points: [{ name: 'Unknown map point', x: 100, y: 200 }],
          country: [{ plane: [flightGroup, tankerGroup], vehicle: [groundGroup] }],
        },
        red: {},
        neutrals: {},
      },
    }), settings);

    expect(normalized.coalitions.blue.bullseye.latlon).toEqual([0, 0]);
    expect(normalized.coalitions.blue.bullseye.latlonResolved).toBe(false);
    expect(normalized.coalitions.blue.navPoints[0].latlon).toEqual([0, 0]);
    expect(normalized.coalitions.blue.navPoints[0].latlonResolved).toBe(false);
    expect(normalized.coalitions.blue.flights[0].route[0].latlonResolved).toBe(false);
    expect(normalized.coalitions.blue.support[0].latlon).toEqual([0, 0]);
    expect(normalized.coalitions.blue.support[0].latlonResolved).toBe(false);
    expect(normalized.coalitions.blue.aiGroups[0].latlon).toEqual([0, 0]);
    expect(normalized.coalitions.blue.aiGroups[0].latlonResolved).toBe(false);
    expect(normalized.warnings.filter(warning => warning === '未対応のマップ: Afghanistan（座標を解決できません）')).toHaveLength(1);
    expect(normalized.warnings.filter(warning => warning === 'UTC オフセット未収録: Afghanistan')).toHaveLength(1);
  });
});

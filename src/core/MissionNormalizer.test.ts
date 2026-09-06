import { describe, expect, it } from 'vitest';
import { normalizeMission } from './MissionNormalizer';

const settings = { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' };

function unit(type: string, skill = 'Excellent', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type, skill, x: 100, y: 200, unitId: 1, name: type, ...extra };
}

function makeMission(overrides: { weather?: Record<string, unknown>; coalition?: Record<string, unknown> } = {}) {
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
      plane: [{ category: 'plane', group: [flight, tanker] }],
      ship: [{ category: 'ship', group: [] }],
      vehicle: [{ category: 'vehicle', group: vehicleGroups.concat([jtac]) }],
    }],
  };

  return {
    mission: {
      date: { Year: 2026, Month: 9, Day: 6 },
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
    theatre: 'Caucasus',
    warehouses: { airports: {} },
    dictionary: {},
    mapResource: {},
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
    expect(normalized.warnings).toContain('未知の脅威半径: UnknownSAM');
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
});

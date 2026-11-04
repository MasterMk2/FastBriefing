// Fixture builders for tests of the analysis rules and the P5 screens. Not used by the app.
import type {
  AIGroup,
  Airbase,
  Coalition,
  Flight,
  MissionData,
  RoutePoint,
  SupportAsset,
  Unit,
} from '../types/mission';

export function makeCoalition(overrides: Partial<Coalition> = {}): Coalition {
  return {
    bullseye: { xy: [0, 0], latlon: [0, 0], latlonResolved: false },
    navPoints: [],
    airbases: [],
    flights: [],
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
    ...overrides,
  };
}

export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    unitId: 1,
    name: 'Unit',
    tailNumber: '',
    skill: 'Client',
    livery: '',
    payload: { pylons: [], fuel: 0, chaff: 0, flare: 0, gun: 0, weight: 0 },
    radios: [],
    props: {},
    ...overrides,
  };
}

export function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    groupId: 1,
    name: 'Viper',
    callsign: 'Viper 1-1',
    type: 'F-16C_50',
    task: 'CAP',
    frequency: 0,
    modulation: 0,
    hidden: false,
    units: [makeUnit()],
    route: [],
    ...overrides,
  };
}

export function makeRoutePoint(overrides: Partial<RoutePoint> = {}): RoutePoint {
  return {
    index: 1,
    name: '',
    action: '',
    xy: [0, 0],
    latlon: [34, 44],
    latlonResolved: true,
    alt: 0,
    altType: 'BARO',
    speed: 0,
    eta: 0,
    tasks: [],
    ...overrides,
  };
}

export function makeSupport(overrides: Partial<SupportAsset> = {}): SupportAsset {
  return {
    kind: 'tanker',
    callsign: 'Texaco',
    hidden: false,
    frequency: 0,
    position: [0, 0],
    latlon: [34, 44],
    latlonResolved: true,
    ...overrides,
  };
}

export function makeAirbase(overrides: Partial<Airbase> = {}): Airbase {
  return {
    id: 1,
    name: 'Test Field',
    latlon: [34, 44],
    latlonResolved: true,
    owner: 'NEUTRAL',
    runways: [],
    atc: [],
    ...overrides,
  };
}

export function makeAIGroup(overrides: Partial<AIGroup> = {}): AIGroup {
  return {
    category: 'vehicle',
    type: 'SA-2',
    count: 1,
    position: [0, 0],
    latlon: [34, 44],
    latlonResolved: true,
    threatRange: 0,
    detectionRange: 0,
    hidden: false,
    lateActivation: false,
    startTime: 0,
    ...overrides,
  };
}

export function makeMission(coalitions: Partial<MissionData['coalitions']> = {}): MissionData {
  return {
    sourceFingerprint: 'test-fingerprint',
    meta: {
      sortie: 'Test',
      description: '',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 11, Day: 3 },
      startTime: 0,
      utcOffset: 4,
      meVersion: 1,
      images: [],
    },
    weather: {
      temperature: 15,
      qnh: { mmHg: 760, hPa: 1013.25, inHg: 29.92 },
      wind: [],
      clouds: { preset: '', label: '', base: 0 },
      visibility: 80000,
      fog: { thickness: 0, visibility: 0, enabled: false },
      dust: { density: 0, enabled: false },
      turbulence: { ground: 0 },
    },
    coalitions: {
      blue: coalitions.blue ?? makeCoalition(),
      red: coalitions.red ?? makeCoalition(),
      neutral: coalitions.neutral ?? makeCoalition(),
    },
    userNotes: {
      missionKey: 'test-key',
      smeac: { situation: '', mission: '', execution: '', adminLogistics: '', commandSignal: '' },
      perFlight: {},
      waypoints: {},
      mapAnnotations: [],
    },
    issues: [],
  };
}

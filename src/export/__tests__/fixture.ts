import type { AIGroup, Coalition, Flight, MissionData, RoutePoint } from '../../types/mission';

/**
 * A two-coalition mission for the export tests. Blue has one visible flight and one
 * hidden flight; red has a flight (callsign "Bandit 1") and a threat group (SA-10).
 * The pilot view of blue must not contain the red flight or the threat (D1).
 */
function emptyCoalition(): Coalition {
  return {
    bullseye: { xy: [0, 0], latlon: [0, 0], latlonResolved: false },
    navPoints: [],
    airbases: [],
    flights: [],
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  } as unknown as Coalition;
}

function route(name: string, latlon: [number, number] = [42, 43]): RoutePoint {
  return {
    index: 1,
    name,
    action: 'Turning Point',
    xy: [1000, 2000],
    latlon,
    latlonResolved: true,
    alt: 5000,
    altType: 'BARO',
    speed: 200,
    eta: 0,
    tasks: [],
  } as unknown as RoutePoint;
}

function flight(groupId: number, callsign: string, type: string, extra: Partial<Flight> = {}): Flight {
  return {
    groupId,
    name: callsign,
    callsign,
    type,
    task: 'CAP',
    frequency: 305_000_000,
    modulation: 0,
    hidden: false,
    units: [],
    route: [route('IP')],
    ...extra,
  } as unknown as Flight;
}

export function fixtureMission(): MissionData {
  const blue = emptyCoalition();
  blue.flights = [
    flight(1, 'Viper 1', 'F-16C_50'),
    flight(2, 'Hidden 1', 'FA-18C_hornet', { hidden: true }),
  ];
  const red = emptyCoalition();
  red.flights = [flight(3, 'Bandit 1', 'MiG-29S')];
  red.aiGroups = [{
    type: 'SA-10',
    count: 1,
    threatRange: 40_000,
    detectionRange: 90_000,
    threatRangeSource: 'reference',
    position: [0, 0],
    latlon: [42, 43],
    latlonResolved: true,
    category: 'sam',
  } as unknown as AIGroup];

  return {
    sourceFingerprint: 'fixture-export',
    meta: {
      sortie: 'Export Test',
      description: 'Briefing text',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 9, Day: 21 },
      startTime: 3600,
      utcOffset: 3,
      meVersion: 1,
      images: [],
    },
    weather: {
      temperature: 20,
      qnh: { hPa: 1013, mmHg: 760, inHg: 29.92 },
      wind: [],
      clouds: { preset: '', label: 'Clear', base: 0 },
      visibility: 10_000,
      fog: { thickness: 0, visibility: 0, enabled: false },
      dust: { density: 0, enabled: false },
      turbulence: { ground: 0 },
    },
    coalitions: { blue, red, neutral: emptyCoalition() },
    userNotes: {
      missionKey: 'fixture-export',
      smeac: { situation: 'Situation text', mission: '', execution: '', adminLogistics: '', commandSignal: '' },
      perFlight: {
        'blue:1': { pilotName: 'Hawk', tot: '', jokerFuel: null, bingoFuel: null, customNotes: '' },
        'red:3': { pilotName: 'Secret pilot', tot: '', jokerFuel: null, bingoFuel: null, customNotes: '' },
      },
      waypoints: {},
      mapAnnotations: [],
    },
    issues: [],
  } as unknown as MissionData;
}

import { describe, expect, it } from 'vitest';
import type { AIGroup, Coalition, Drawing, Flight, MissionData, MissionIssue, SupportAsset, TriggerZone, Unit } from '../types/mission';
import { applyViewMode, defaultSide, resolveSide } from './viewMode';

function makeFlight(hidden: boolean | undefined): Flight {
  const flight = {
    groupId: hidden === true ? 2 : 1,
    name: hidden === true ? 'Hidden flight' : 'Visible flight',
    callsign: 'Viper',
    type: 'F-16C',
    task: 'CAP',
    frequency: 251000000,
    modulation: 0,
    hidden: hidden === true,
    units: [],
    route: [],
  };
  if (hidden === undefined) {
    const { hidden: _hidden, ...withoutHidden } = flight;
    return withoutHidden as unknown as Flight;
  }
  return flight;
}

function makeAIGroup(hidden: boolean | undefined): AIGroup {
  const group = {
    category: 'vehicle',
    type: hidden === true ? 'Hidden SAM' : 'Visible SAM',
    count: 1,
    position: [1, 2] as [number, number],
    hidden: hidden === true,
    lateActivation: false,
    startTime: 0,
  };
  if (hidden === undefined) {
    const { hidden: _hidden, ...withoutHidden } = group;
    return withoutHidden as unknown as AIGroup;
  }
  return group;
}

function makeZone(hidden: boolean | undefined): TriggerZone {
  const zone = {
    zoneId: hidden === true ? 2 : 1,
    name: hidden === true ? 'Hidden zone' : 'Visible zone',
    xy: [1, 2] as [number, number],
    radius: 100,
    type: 0 as const,
    color: [],
    hidden: hidden === true,
  };
  if (hidden === undefined) {
    const { hidden: _hidden, ...withoutHidden } = zone;
    return withoutHidden as unknown as TriggerZone;
  }
  return zone;
}

function makeSupport(hidden: boolean | undefined): SupportAsset {
  const support = {
    kind: 'tanker' as const,
    callsign: hidden === true ? 'Hidden tanker' : 'Visible tanker',
    frequency: 251000000,
    position: [1, 2] as [number, number],
  };
  return hidden === undefined ? support as unknown as SupportAsset : { ...support, hidden: hidden === true } as SupportAsset;
}

function makeDrawing(hidden: boolean | undefined): Drawing {
  const drawing = {
    layer: hidden === true ? 'Neutral' : 'Common',
    visible: true,
    objects: [],
  };
  return hidden === undefined ? drawing : { ...drawing, hidden } as Drawing;
}

function makeCoalition(hidden: boolean | undefined): Coalition {
  return {
    bullseye: { xy: [0, 0], latlon: [35, 135] },
    navPoints: [],
    airbases: [],
    flights: [makeFlight(false), makeFlight(hidden)],
    support: [makeSupport(false), makeSupport(hidden)],
    aiGroups: [makeAIGroup(false), makeAIGroup(hidden)],
    zones: [makeZone(false), makeZone(hidden)],
    drawings: [makeDrawing(false), makeDrawing(hidden)],
  };
}

function makeClientFlight(side: 'blue' | 'red', skill: string): Flight {
  const unit = { unitId: 1, name: `${side}-unit`, tailNumber: '', skill, livery: '', payload: {} as Unit['payload'], radios: [], props: {} } as Unit;
  return { ...makeFlight(false), name: `${side}-client`, units: [unit] };
}

function makeMission(hidden: boolean | undefined): MissionData {
  return {
    sourceFingerprint: 'view-mode-fixture',
    meta: {
      sortie: 'View mode test',
      description: '',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Test',
      date: { Year: 2026, Month: 1, Day: 1 },
      startTime: 0,
      utcOffset: 0,
      meVersion: 1,
      images: [],
    },
    weather: {} as MissionData['weather'],
    coalitions: {
      blue: makeCoalition(hidden),
      red: makeCoalition(hidden),
      neutral: makeCoalition(hidden),
    },
    userNotes: {} as MissionData['userNotes'],
    issues: [],
  };
}

describe('applyViewMode', () => {
  it('returns the original mission unchanged in creator view', () => {
    const mission = makeMission(true);

    const result = applyViewMode(mission, 'creator', 'blue');

    expect(result).toBe(mission);
    expect(result.coalitions.blue.flights).toHaveLength(2);
    expect(result.coalitions.red.aiGroups).toHaveLength(2);
    expect(result.coalitions.neutral.zones).toHaveLength(2);
  });

  it('keeps the displayed side and removes hidden entries there (G11)', () => {
    const mission = makeMission(true);

    const result = applyViewMode(mission, 'pilot', 'blue');
    const own = result.coalitions.blue;

    expect(own.flights.map(item => item.name)).toEqual(['Visible flight']);
    expect(own.support.map(item => item.callsign)).toEqual(['Visible tanker']);
    expect(own.aiGroups.map(item => item.type)).toEqual(['Visible SAM']);
    expect(own.zones).toEqual([]);
    expect(own.drawings.map(item => item.layer)).toEqual(['Common']);
  });

  it('withholds the opposing coalition entirely in pilot view (D1)', () => {
    const mission = makeMission(undefined);

    const result = applyViewMode(mission, 'pilot', 'blue');
    const enemy = result.coalitions.red;

    expect(enemy.flights).toEqual([]);
    expect(enemy.support).toEqual([]);
    expect(enemy.aiGroups).toEqual([]);
    expect(enemy.navPoints).toEqual([]);
    expect(enemy.bullseye.latlonResolved).toBe(false);
  });

  it('keeps the shared drawings for the map when red is displayed (hidden ones removed)', () => {
    const mission = makeMission(true);

    const result = applyViewMode(mission, 'pilot', 'red');

    expect(result.coalitions.blue.drawings.map(item => item.layer)).toEqual(['Common']);
    expect(result.coalitions.red.drawings.map(item => item.layer)).toEqual(['Common']);
  });

  it('removes trigger zones from every coalition copy in pilot view, as the F10 map does (D1)', () => {
    for (const side of ['blue', 'red'] as const) {
      const result = applyViewMode(makeMission(false), 'pilot', side);

      for (const coalition of [result.coalitions.blue, result.coalitions.red, result.coalitions.neutral]) {
        expect(coalition.zones).toEqual([]);
      }
    }
  });

  it('keeps only the drawing layers a player of the displayed side sees (D1)', () => {
    const layer = (name: string, visible = true): Drawing => ({ layer: name, visible, objects: [] });
    const mission = makeMission(false);
    const drawings = [layer('Blue'), layer('Red'), layer('Neutral'), layer('Common'), layer('Author'), layer('Blue', false), layer('Custom')];
    for (const coalition of [mission.coalitions.blue, mission.coalitions.red, mission.coalitions.neutral]) {
      coalition.drawings = drawings;
    }

    const blue = applyViewMode(mission, 'pilot', 'blue');
    const red = applyViewMode(mission, 'pilot', 'red');

    expect(blue.coalitions.blue.drawings.map(item => item.layer)).toEqual(['Blue', 'Neutral', 'Common']);
    expect(red.coalitions.blue.drawings.map(item => item.layer)).toEqual(['Red', 'Neutral', 'Common']);
    expect(applyViewMode(mission, 'creator', 'blue').coalitions.blue.drawings).toHaveLength(7);
  });

  it('removes late-activation AI groups and neutral flights in pilot view', () => {
    const mission = makeMission(undefined);
    mission.coalitions.blue.aiGroups = [{ ...makeAIGroup(false), lateActivation: true }, makeAIGroup(false)];
    mission.coalitions.neutral.flights = [makeFlight(false)];

    const result = applyViewMode(mission, 'pilot', 'blue');

    expect(result.coalitions.blue.aiGroups).toHaveLength(1);
    expect(result.coalitions.neutral.flights).toEqual([]);
  });

  it('keeps the enemy visible in creator view with all hidden entries', () => {
    const mission = makeMission(true);

    const result = applyViewMode(mission, 'creator', 'blue');

    expect(result.coalitions.red.flights).toHaveLength(2);
    expect(result.coalitions.red.support).toHaveLength(2);
  });

  it('does not mutate source arrays while filtering pilot view', () => {
    const mission = makeMission(true);
    const originalLengths = [
      mission.coalitions.blue,
      mission.coalitions.red,
      mission.coalitions.neutral,
    ].map(coalition => [
      coalition.flights.length,
      coalition.support.length,
      coalition.aiGroups.length,
      coalition.zones.length,
      coalition.drawings.length,
    ]);

    applyViewMode(mission, 'pilot', 'blue');

    expect([mission.coalitions.blue, mission.coalitions.red, mission.coalitions.neutral].map(coalition => [
      coalition.flights.length,
      coalition.support.length,
      coalition.aiGroups.length,
      coalition.zones.length,
      coalition.drawings.length,
    ])).toEqual(originalLengths);
  });

  it('handles empty collections and missing hidden flags', () => {
    const mission = makeMission(undefined);
    for (const coalition of [mission.coalitions.blue, mission.coalitions.red, mission.coalitions.neutral]) {
      coalition.flights = [];
      coalition.support = [];
      coalition.aiGroups = [];
      coalition.zones = [];
      coalition.drawings = [];
    }

    expect(() => applyViewMode(mission, 'pilot', 'blue')).not.toThrow();
    expect(applyViewMode(mission, 'pilot', 'blue').coalitions.blue.flights).toEqual([]);
  });

  it('keeps the other side in pilot view when red is chosen', () => {
    const mission = makeMission(undefined);

    const result = applyViewMode(mission, 'pilot', 'red');

    expect(result.coalitions.red.flights).toHaveLength(2);
    expect(result.coalitions.blue.flights).toEqual([]);
  });

  it('removes airbases owned by the opposing side in pilot view', () => {
    const mission = makeMission(undefined);
    const airbase = (owner: string) => ({ id: 1, name: owner, latlon: [0, 0] as [number, number], owner, runways: [], atc: [] });
    mission.coalitions.neutral.airbases = [airbase('RED'), airbase('BLUE'), airbase('NEUTRAL')];

    const result = applyViewMode(mission, 'pilot', 'blue');

    expect(result.coalitions.neutral.airbases.map(item => item.owner)).toEqual(['BLUE', 'NEUTRAL']);
  });
});

describe('issues in view modes (D1)', () => {
  const issue = (code: MissionIssue['code'], type: string | undefined, side?: MissionIssue['side']): MissionIssue => ({
    code,
    severity: 'info',
    ...(type === undefined ? {} : { params: { type } }),
    ...(side === undefined ? {} : { side }),
  });

  function makeIssueMission(): MissionData {
    const mission = makeMission(undefined);
    mission.issues = [
      issue('unit.unknownType', 'OWN-UNKNOWN', 'blue'),
      issue('unit.unknownType', 'SECRET-RED-SAM', 'red'),
      issue('unit.unknownType', 'NEUTRAL-UNKNOWN', 'neutral'),
      { code: 'map.unsupported', severity: 'warning', params: { theatre: 'Test' } },
    ];
    return mission;
  }

  it('keeps only the displayed side and the whole-mission issues in pilot view', () => {
    const result = applyViewMode(makeIssueMission(), 'pilot', 'blue');

    expect(result.issues.map(item => item.params?.type ?? item.code)).toEqual(['OWN-UNKNOWN', 'map.unsupported']);
  });

  it('keeps the red side issues when red is displayed', () => {
    const result = applyViewMode(makeIssueMission(), 'pilot', 'red');

    expect(result.issues.map(item => item.params?.type ?? item.code)).toEqual(['SECRET-RED-SAM', 'map.unsupported']);
  });

  it('keeps every issue in creator view', () => {
    const mission = makeIssueMission();

    expect(applyViewMode(mission, 'creator', 'blue').issues).toHaveLength(4);
  });
});

describe('mission task text in view modes (D1)', () => {
  function makeTaskMission(): MissionData {
    const mission = makeMission(undefined);
    mission.meta.descriptionBlueTask = 'Blue task text';
    mission.meta.descriptionRedTask = 'Red task text';
    mission.meta.descriptionNeutralTask = 'Neutral task text';
    return mission;
  }

  it('clears the red task text in pilot view when blue is displayed', () => {
    const result = applyViewMode(makeTaskMission(), 'pilot', 'blue');

    expect(result.meta.descriptionBlueTask).toBe('Blue task text');
    expect(result.meta.descriptionRedTask).toBe('');
    expect(result.meta.descriptionNeutralTask).toBe('Neutral task text');
  });

  it('clears the blue task text in pilot view when red is displayed', () => {
    const result = applyViewMode(makeTaskMission(), 'pilot', 'red');

    expect(result.meta.descriptionRedTask).toBe('Red task text');
    expect(result.meta.descriptionBlueTask).toBe('');
    expect(result.meta.descriptionNeutralTask).toBe('Neutral task text');
  });

  it('clears the opposing task text when the side is resolved by default (D2)', () => {
    const mission = makeTaskMission();
    mission.coalitions.red.flights = [makeClientFlight('red', 'Client')];

    const result = applyViewMode(mission, 'pilot', null);

    expect(result.meta.descriptionBlueTask).toBe('');
    expect(result.meta.descriptionRedTask).toBe('Red task text');
  });

  it('keeps both task texts in creator view', () => {
    const mission = makeTaskMission();

    const result = applyViewMode(mission, 'creator', 'blue');

    expect(result.meta.descriptionBlueTask).toBe('Blue task text');
    expect(result.meta.descriptionRedTask).toBe('Red task text');
  });

  it('does not mutate the source meta while clearing pilot task text', () => {
    const mission = makeTaskMission();

    applyViewMode(mission, 'pilot', 'blue');

    expect(mission.meta.descriptionRedTask).toBe('Red task text');
  });
});

describe('displayed side default (D2)', () => {
  it('uses the side with more client flights when none is chosen', () => {
    const mission = makeMission(undefined);
    mission.coalitions.red.flights = [makeClientFlight('red', 'Client'), makeClientFlight('red', 'Player')];
    mission.coalitions.blue.flights = [makeClientFlight('blue', 'Client')];

    expect(defaultSide(mission)).toBe('red');
    expect(resolveSide(mission, null)).toBe('red');
    expect(resolveSide(mission, 'blue')).toBe('blue');
  });

  it('keeps blue on a tie and ignores AI-only flights', () => {
    const mission = makeMission(undefined);
    mission.coalitions.red.flights = [makeClientFlight('red', 'AI')];

    expect(defaultSide(mission)).toBe('blue');
  });
});

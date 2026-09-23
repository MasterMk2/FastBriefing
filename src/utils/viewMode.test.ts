import { describe, expect, it } from 'vitest';
import type { AIGroup, Coalition, Drawing, Flight, MissionData, SupportAsset, TriggerZone } from '../types/mission';
import { applyViewMode } from './viewMode';

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
  return hidden === undefined ? support : { ...support, hidden } as SupportAsset;
}

function makeDrawing(hidden: boolean | undefined): Drawing {
  const drawing = {
    layer: hidden === true ? 'Hidden layer' : 'Visible layer',
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
    warnings: [],
  };
}

describe('applyViewMode', () => {
  it('returns the original mission unchanged in creator view', () => {
    const mission = makeMission(true);

    const result = applyViewMode(mission, 'creator');

    expect(result).toBe(mission);
    expect(result.coalitions.blue.flights).toHaveLength(2);
    expect(result.coalitions.red.aiGroups).toHaveLength(2);
    expect(result.coalitions.neutral.zones).toHaveLength(2);
  });

  it('filters hidden flights, groups, zones, drawings, and support in all coalitions', () => {
    const mission = makeMission(true);

    const result = applyViewMode(mission, 'pilot');

    for (const coalition of [result.coalitions.blue, result.coalitions.red, result.coalitions.neutral]) {
      expect(coalition.flights.map(item => item.name)).toEqual(['Visible flight']);
      expect(coalition.support.map(item => item.callsign)).toEqual(['Visible tanker']);
      expect(coalition.aiGroups.map(item => item.type)).toEqual(['Visible SAM']);
      expect(coalition.zones.map(item => item.name)).toEqual(['Visible zone']);
      expect(coalition.drawings.map(item => item.layer)).toEqual(['Visible layer']);
    }
  });

  it('keeps visible and unflagged entities in pilot view', () => {
    const mission = makeMission(undefined);

    const result = applyViewMode(mission, 'pilot');

    for (const coalition of [result.coalitions.blue, result.coalitions.red, result.coalitions.neutral]) {
      expect(coalition.flights).toHaveLength(2);
      expect(coalition.support).toHaveLength(2);
      expect(coalition.aiGroups).toHaveLength(2);
      expect(coalition.zones).toHaveLength(2);
      expect(coalition.drawings).toHaveLength(2);
    }
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

    applyViewMode(mission, 'pilot');

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

    expect(() => applyViewMode(mission, 'pilot')).not.toThrow();
    expect(applyViewMode(mission, 'pilot').coalitions.blue.flights).toEqual([]);
  });
});

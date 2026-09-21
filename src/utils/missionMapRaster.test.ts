import { describe, expect, it } from 'vitest';
import type { MissionData } from '../types/mission';
import { buildMissionMapScene } from './missionMapRaster';

function mission(): MissionData {
  const sharedZones = [{ zoneId: 1, name: 'Target', xy: [10, 20], radius: 5, type: 0, color: [], hidden: false }];
  const sharedDrawings = [{ layer: 'Common', visible: true, objects: [{ primitiveType: 'Line', points: [[1, 2], [3, 4]], color: '#000', thickness: 2, style: 0, name: 'line' }] }];
  const coalition = { bullseye: { xy: [0, 0], latlon: [0, 0] }, navPoints: [], airbases: [], flights: [], support: [], aiGroups: [], zones: sharedZones, drawings: sharedDrawings };
  const flight = (groupId: number, callsign: string) => ({ groupId, callsign, name: callsign, type: 'Jet', task: 'CAP', frequency: 0, modulation: 0, hidden: false, units: [], route: [{ xy: [groupId, groupId + 1] }] });
  return {
    meta: { theatre: 'Caucasus' },
    coalitions: {
      blue: { ...coalition, flights: [flight(1, 'Blue')] },
      red: { ...coalition, flights: [flight(2, 'Red')], aiGroups: [{ type: 'SAM', category: 'vehicle', count: 1, position: [5, 6], hidden: false, lateActivation: false, startTime: 0 }] },
      neutral: { ...coalition, flights: [flight(3, 'Neutral')] },
    },
  } as unknown as MissionData;
}

describe('mission map raster scene', () => {
  it('includes all route coalitions while counting shared mission geometry once', () => {
    const scene = buildMissionMapScene(mission());
    expect(scene.theatre).toBe('Caucasus');
    expect(scene.routes.map(route => route.label)).toEqual(['Blue', 'Red', 'Neutral']);
    expect(scene.zones).toHaveLength(1);
    expect(scene.drawings).toHaveLength(1);
    expect(scene.threats).toHaveLength(1);
  });

  it('filters routes without dropping mission-level overlays', () => {
    const value = mission();
    const selected = [value.coalitions.neutral.flights[0]];
    const scene = buildMissionMapScene(value, selected);
    expect(scene.routes.map(route => route.label)).toEqual(['Neutral']);
    expect(scene.zones).toHaveLength(1);
    expect(scene.threats).toHaveLength(1);
  });
});

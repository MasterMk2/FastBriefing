import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MissionData, SupportAsset } from '../types/mission';
import { buildMissionMapScene, drawMissionMap, type MissionMapLabels } from './missionMapRaster';

/** Records every call on a 2D context by name, and the text it draws. Properties are plain values. */
function recordingContext(calls: string[], texts: string[]): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'start', lineCap: 'butt', lineJoin: 'miter',
  };
  return new Proxy(state, {
    get(target, property) {
      if (typeof property !== 'string') return undefined;
      if (property === 'measureText') return (value: string) => ({ width: Array.from(value).length * 8 });
      if (property in target) return target[property];
      return (...args: unknown[]) => {
        calls.push(property);
        if (property === 'fillText') texts.push(String(args[0]));
      };
    },
    set(target, property, value) {
      target[property as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** An image class whose tile loads (or fails) as soon as the source is set. */
function fakeImages(loads: boolean, requested: string[]) {
  return class FakeImage {
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(value: string) {
      requested.push(value);
      queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
    }
  };
}

const labels: MissionMapLabels = {
  empty: 'empty',
  basemapUnavailable: 'basemap-unavailable',
  basemapDisabled: 'basemap-disabled',
  routes: 'routes',
  support: 'support',
  threats: 'threats',
  zones: 'zones',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    userNotes: {
      waypoints: {},
      mapAnnotations: [
        { id: 'pin_1', kind: 'pin', position: [42, 43], label: 'IP', notes: '', color: '#e53935' },
        { id: 'stroke_1', kind: 'stroke', points: [[42, 43], [42.01, 43.01]], color: '#0066ff', width: 4 },
      ],
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
    expect(scene.userPins).toHaveLength(1);
    expect(scene.userStrokes).toHaveLength(1);
    expect(scene.unprojectableMapAnnotations).toBe(0);
  });

  it('filters routes without dropping mission-level overlays', () => {
    const value = mission();
    const selected = [value.coalitions.neutral.flights[0]];
    const scene = buildMissionMapScene(value, selected);
    expect(scene.routes.map(route => route.label)).toEqual(['Neutral']);
    expect(scene.zones).toHaveLength(1);
    expect(scene.threats).toHaveLength(1);
  });

  it('leaves neutral support off the map and keeps the blue and red support (decision 11)', () => {
    const value = mission();
    const support = (callsign: string) => ({
      kind: 'tanker', callsign, hidden: false, frequency: 251_000_000, position: [1, 2],
    }) as unknown as SupportAsset;
    value.coalitions.blue.support = [support('BlueTanker')];
    value.coalitions.red.support = [support('RedTanker')];
    value.coalitions.neutral.support = [support('NeutralTanker')];
    const scene = buildMissionMapScene(value);
    expect(scene.support.map(item => item.callsign).sort()).toEqual(['BlueTanker', 'RedTanker']);
  });
});

describe('drawing a map: a stale draw never paints (decision 7, isCurrent)', () => {
  it('stops before painting the tiles when a newer draw has replaced it', async () => {
    const requested: string[] = [];
    vi.stubGlobal('Image', fakeImages(true, requested));
    const calls: string[] = [];
    const scene = { ...buildMissionMapScene(mission()), basemap: true };

    const result = await drawMissionMap(recordingContext(calls, []), scene, 0, 0, 1536, 1024, labels, {
      isCurrent: () => false,
    });

    expect(requested.length).toBeGreaterThan(0);
    expect(calls).not.toContain('drawImage');
    expect(calls).not.toContain('fillText');
    expect(result.background).toBe(false);
  });

  it('paints the tiles when the draw is still current', async () => {
    const requested: string[] = [];
    vi.stubGlobal('Image', fakeImages(true, requested));
    const calls: string[] = [];
    const scene = { ...buildMissionMapScene(mission()), basemap: true };
    const result = await drawMissionMap(recordingContext(calls, []), scene, 0, 0, 1536, 1024, labels, {
      isCurrent: () => true,
    });
    expect(calls).toContain('drawImage');
    expect(result.background).toBe(true);
    // Every save has its restore, so no clip or font from this draw is left for the next one.
    expect(calls.filter(call => call === 'restore')).toHaveLength(calls.filter(call => call === 'save').length);
  });
});

describe('drawing a map: the basemap setting (decision 6)', () => {
  it('requests no tile and says so when the basemap is off, instead of reporting a failure', async () => {
    const requested: string[] = [];
    vi.stubGlobal('Image', fakeImages(true, requested));
    const texts: string[] = [];
    const calls: string[] = [];
    const scene = { ...buildMissionMapScene(mission()), basemap: false };

    const result = await drawMissionMap(recordingContext(calls, texts), scene, 0, 0, 1536, 1024, labels);

    expect(requested).toEqual([]);
    expect(calls).not.toContain('drawImage');
    expect(result.background).toBe(false);
    expect(texts).toContain('basemap-disabled');
    expect(texts).not.toContain('basemap-unavailable');
  });
});

describe('drawing a map: a scene that does not say the basemap is wanted', () => {
  it('requests no tile when the basemap is not specified (fail closed, decision 6)', async () => {
    const requested: string[] = [];
    vi.stubGlobal('Image', fakeImages(true, requested));
    const texts: string[] = [];
    const calls: string[] = [];
    const scene = buildMissionMapScene(mission());
    expect(scene.basemap).toBeUndefined();

    const result = await drawMissionMap(recordingContext(calls, texts), scene, 0, 0, 1536, 1024, labels);

    expect(requested).toEqual([]);
    expect(result.background).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { MissionData } from '../types/mission';
import type { KneeboardPage, KneeboardTranslate } from './kneeboard';
import { buildMissionMapScene, type MissionMapScene } from './missionMapRaster';
import {
  assertMissionMapRendered,
  assertKneeboardRenderBudget,
  estimateKneeboardPageCount,
  MAX_KNEEBOARD_PIXELS,
} from './kneeboardRenderer';

const t: KneeboardTranslate = (key, options) => `${key}:${JSON.stringify(options ?? {})}`;

function textPage(title: string, text = 'normal'): KneeboardPage {
  return {
    kind: 'text',
    section: 'flights',
    title,
    sections: [{ heading: title, lines: [text] }],
  };
}

describe('kneeboard render budget', () => {
  it('accepts the normal seven-page maximum-width briefing', () => {
    expect(() => assertKneeboardRenderBudget(7, 3072, t)).not.toThrow();
  });

  it('rejects maximum-width output with many flights and a long valid note before rendering', () => {
    const pages = [
      ...Array.from({ length: 6 }, (_, index) => textPage(`Flight ${index + 1}`)),
      textPage('Long note', '作'.repeat(10_000)),
    ];
    const count = estimateKneeboardPageCount(pages);
    expect(count).toBeGreaterThan(10);
    expect(() => assertKneeboardRenderBudget(count, 3072, t)).toThrow('kneeboard.tooManyPixels');
    expect(count * 3072 * 4096).toBeGreaterThan(MAX_KNEEBOARD_PIXELS);
  });
});

describe('kneeboard map rendering', () => {
  const emptyScene = (): MissionMapScene => ({
    theatre: 'Caucasus',
    routes: [],
    zones: [],
    drawings: [],
    support: [],
    threats: [],
    userPins: [],
    userStrokes: [],
    unprojectableMapAnnotations: 0,
  });

  it('fails closed when an annotation-only map could not be rendered', () => {
    const scene = emptyScene();
    scene.userPins.push({ id: 'pin-1', position: [0, 0], label: 'IP', color: '#ff0000' });

    expect(() => assertMissionMapRendered(scene, false, t)).toThrow('kneeboard.basemapUnavailable');
  });

  it('allows a genuinely empty map page when no map content exists', () => {
    expect(() => assertMissionMapRendered(emptyScene(), false, t)).not.toThrow();
  });

  it('fails closed when source annotations cannot be projected into the raster scene', () => {
    const coalition = {
      flights: [], navPoints: [], airbases: [], support: [], aiGroups: [], zones: [], drawings: [],
    };
    const mission = {
      meta: { theatre: 'Afghanistan' },
      coalitions: { blue: coalition, red: coalition, neutral: coalition },
      userNotes: {
        waypoints: {},
        mapAnnotations: [
          { id: 'pin-unsupported', kind: 'pin', position: [34, 69], label: 'IP', notes: '', color: '#ff0000' },
        ],
      },
    } as unknown as MissionData;
    const scene = buildMissionMapScene(mission);

    expect(scene.userPins).toHaveLength(0);
    expect(scene.unprojectableMapAnnotations).toBe(1);
    expect(() => assertMissionMapRendered(scene, false, t)).toThrow('kneeboard.basemapUnavailable');
  });
});

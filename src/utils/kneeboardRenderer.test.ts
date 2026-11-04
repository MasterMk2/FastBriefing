// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionData } from '../types/mission';
import type { KneeboardPage, KneeboardTranslate } from './kneeboard';
import {
  buildMissionMapScene,
  drawMissionMap,
  hasMissionMapContent,
  mapDrawFailed,
  type MissionMapDrawResult,
  type MissionMapLabels,
  type MissionMapScene,
} from './missionMapRaster';
import {
  assertKneeboardRenderBudget,
  countKneeboardPages,
  createMeasurementContext,
  kneeboardBudget,
  largestFittingWidth,
  MAX_KNEEBOARD_PAGES,
  renderKneeboardPages,
} from './kneeboardRenderer';
import { fixtureMission } from '../export/__tests__/fixture';
import { MAX_WHITEBOARD_NOTES, MAX_WHITEBOARD_STROKES } from '../hooks/useWhiteboard';

const t: KneeboardTranslate = (key, options) => `${key}:${JSON.stringify(options ?? {})}`;

function textPage(title: string, lines: string[] = ['normal']): KneeboardPage {
  return {
    kind: 'text',
    section: 'flights',
    title,
    sections: [{ heading: title, lines }],
  };
}

/** A 2D context that records the text it draws. Methods that are not needed do nothing. */
function fakeCanvasContext(texts: string[]): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'start', lineCap: 'butt', lineJoin: 'miter',
  };
  return new Proxy(state, {
    get(target, property) {
      if (typeof property !== 'string') return undefined;
      if (property === 'measureText') return (value: string) => ({ width: Array.from(value).length * 17 });
      if (property === 'fillText') return (value: string) => { texts.push(value); };
      if (property in target) return target[property];
      return () => undefined;
    },
    set(target, property, value) {
      target[property as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let texts: string[];

beforeEach(() => {
  texts = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCanvasContext(texts));
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
    callback({ arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer } as unknown as Blob);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('kneeboard render budget', () => {
  it('accepts the normal seven-page maximum-width briefing', () => {
    expect(kneeboardBudget(7, 3072)).toEqual({ kind: 'ok' });
  });

  it('reports the page limit separately from the pixel limit, because a smaller width cannot fix it', () => {
    expect(kneeboardBudget(MAX_KNEEBOARD_PAGES + 1, 768)).toEqual({ kind: 'pages', limit: MAX_KNEEBOARD_PAGES });
    expect(kneeboardBudget(41, 1536)).toEqual({ kind: 'pixels', limit: 40 });
  });

  it('suggests the largest width that fits, which matches the SPEC example (22 pages at 2048 px)', () => {
    expect(largestFittingWidth(22, [1536, 2048, 3072])).toBe(2048);
    expect(largestFittingWidth(23, [1536, 2048, 3072])).toBe(1536);
    expect(largestFittingWidth(MAX_KNEEBOARD_PAGES + 1, [1536, 2048, 3072])).toBeNull();
  });

  it('rejects a page count over the limit with the page message, not the pixel message', () => {
    expect(() => assertKneeboardRenderBudget(MAX_KNEEBOARD_PAGES + 1, 1536, t)).toThrow('export:kneeboard.tooManyPages');
  });

  it('rejects maximum-width output with many flights and a long valid note before rendering', () => {
    const pages = [
      ...Array.from({ length: 6 }, (_, index) => textPage(`Flight ${index + 1}`)),
      textPage('Long note', ['作'.repeat(30_000)]),
    ];
    const count = countKneeboardPages(pages, t, createMeasurementContext());
    expect(count).toBeGreaterThan(10);
    expect(() => assertKneeboardRenderBudget(count, 3072, t)).toThrow('export:kneeboard.tooManyPixels');
  });
});

describe('kneeboard page count and rendering', () => {
  it('renders exactly the number of pages the estimate counted', async () => {
    const pages: KneeboardPage[] = [
      textPage('Overview'),
      textPage('Long', Array.from({ length: 80 }, (_, index) => `line ${index}`)),
      { kind: 'whiteboard', section: 'notes', title: 'Whiteboard', data: { notes: 'memo', strokes: [] } },
    ];
    const counted = countKneeboardPages(pages, t, createMeasurementContext());
    const rendered = await renderKneeboardPages(pages, 768, t);
    expect(counted).toBeGreaterThan(pages.length);
    expect(rendered).toHaveLength(counted);
  });

  it('splits maximum whiteboard notes onto continuation pages without dropping the drawing page (old briefingPng)', async () => {
    const notes = 'x'.repeat(MAX_WHITEBOARD_NOTES);
    const pages: KneeboardPage[] = [{
      kind: 'whiteboard',
      section: 'notes',
      title: 'Whiteboard',
      data: {
        notes,
        strokes: Array.from({ length: MAX_WHITEBOARD_STROKES }, (_, index) => ({
          id: `route-${index}`, color: '#175cd3', width: 6, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        })),
      },
    }];
    const counted = countKneeboardPages(pages, t, createMeasurementContext());
    texts = [];
    const rendered = await renderKneeboardPages(pages, 768, t);
    expect(rendered).toHaveLength(counted);
    expect(counted).toBeGreaterThan(1);
    const continued = `Whiteboard (export:label.continued:{})`;
    // The first page is the drawing page (its own title, once); the rest are continuation text pages.
    expect(texts.filter(text => text === 'Whiteboard')).toHaveLength(1);
    expect(texts.filter(text => text.startsWith(continued))).toHaveLength(counted - 1);
    expect(texts.indexOf('Whiteboard')).toBeLessThan(texts.indexOf(continued));
    // Every character of the notes is drawn once, across the drawing page and the continuation pages.
    expect(texts.filter(text => /^x+$/.test(text)).join('')).toBe(notes);
  });

  it('draws a free-text section in a monospaced font, with its blank lines and its leading spaces', async () => {
    const drawn: { font: string; text: string }[] = [];
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => {
      const context = fakeCanvasContext([]);
      return new Proxy(context, {
        get(target, property) {
          if (property === 'fillText') return (value: string) => { drawn.push({ font: String(target.font), text: value }); };
          return Reflect.get(target, property);
        },
      });
    });
    const pages: KneeboardPage[] = [{
      kind: 'text',
      section: 'overview',
      title: 'Overview',
      sections: [
        { heading: 'Mission', lines: ['Theatre: Caucasus'] },
        { heading: 'Description', lines: ['   TITLE', '', 'CALL   FREQ'], preformatted: true },
      ],
    }];
    const rendered = await renderKneeboardPages(pages, 768, t);
    expect(rendered).toHaveLength(countKneeboardPages(pages, t, createMeasurementContext()));
    const fontOf = (text: string) => drawn.find(item => item.text === text)?.font ?? '';
    expect(fontOf('   TITLE')).toContain('monospace');
    expect(fontOf('CALL   FREQ')).toContain('monospace');
    expect(fontOf('Theatre: Caucasus')).toContain('sans-serif');
    const title = drawn.findIndex(item => item.text === '   TITLE');
    // The blank line between them is kept as an empty line, not dropped.
    expect(drawn.slice(title, title + 3).map(item => item.text)).toEqual(['   TITLE', '', 'CALL   FREQ']);
  });

  describe('whiteboard notes as free text', () => {
    function recordDrawn(): { font: string; text: string }[] {
      const drawn: { font: string; text: string }[] = [];
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => {
        const context = fakeCanvasContext([]);
        return new Proxy(context, {
          get(target, property) {
            if (property === 'fillText') return (value: string) => { drawn.push({ font: String(target.font), text: value }); };
            return Reflect.get(target, property);
          },
        });
      });
      return drawn;
    }
    const whiteboard = (notes: string, strokes = 0): KneeboardPage => ({
      kind: 'whiteboard',
      section: 'notes',
      title: 'Whiteboard',
      data: {
        notes,
        strokes: Array.from({ length: strokes }, (_, index) => ({
          id: `s${index}`, color: '#175cd3', width: 6, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        })),
      },
    });

    for (const strokes of [0, 1]) {
      it(`draws the notes in the monospaced font with their leading spaces and blank lines (${strokes} strokes)`, async () => {
        const drawn = recordDrawn();
        const pages = [whiteboard('\n   CALL   FREQ\n\nViper  251.0  \n', strokes)];
        const rendered = await renderKneeboardPages(pages, 768, t);
        expect(rendered).toHaveLength(countKneeboardPages(pages, t, createMeasurementContext()));
        const first = drawn.findIndex(item => item.text === '   CALL   FREQ');
        expect(first).toBeGreaterThanOrEqual(0);
        expect(drawn.slice(first, first + 3)).toEqual([
          { font: expect.stringContaining('monospace'), text: '   CALL   FREQ' },
          { font: expect.stringContaining('monospace'), text: '' },
          { font: expect.stringContaining('monospace'), text: 'Viper  251.0' },
        ]);
      });

      it(`draws notes of white space only as no notes (${strokes} strokes)`, async () => {
        const drawn = recordDrawn();
        await renderKneeboardPages([whiteboard('  \n \t\n', strokes)], 768, t);
        expect(drawn.map(item => item.text)).toContain('export:label.noWhiteboardNotes:{}');
      });
    }
  });

  it('reports progress up to the total', async () => {
    const onProgress = vi.fn();
    const rendered = await renderKneeboardPages([textPage('A'), textPage('B')], 768, t, { onProgress });
    expect(onProgress).toHaveBeenLastCalledWith(rendered.length, rendered.length);
  });

  it('stops between batches when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(renderKneeboardPages([textPage('A')], 768, t, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('kneeboard map without a basemap (offline)', () => {
  it('draws the overlay and reports no background, so the page prints "地図背景なし" instead of failing', async () => {
    // Tiles fail at once, as they do offline; the overlay must still be drawn.
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      crossOrigin = '';
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    });
    const scene = { ...buildMissionMapScene(fixtureMission() as unknown as MissionData), basemap: true };
    const labels: MissionMapLabels = {
      empty: 'empty',
      basemapUnavailable: 'basemap-unavailable',
      routes: 'routes',
      support: 'support',
      threats: 'threats',
      zones: 'zones',
    };
    const result = await drawMissionMap(fakeCanvasContext(texts), scene, 0, 0, 1536, 1024, labels);
    expect(result.background).toBe(false);
    expect(result.drawn).toBeGreaterThan(0);
    expect(texts).toContain('basemap-unavailable');
  });
});

describe('map page outcome (migrated from the old kneeboard map tests)', () => {
  const emptyScene = (): MissionMapScene => ({
    theatre: 'Caucasus',
    basemap: true,
    routes: [],
    zones: [],
    drawings: [],
    support: [],
    threats: [],
    userPins: [],
    userStrokes: [],
    unprojectableMapAnnotations: 0,
  });
  const noBackground: MissionMapDrawResult = { background: false, drawn: 0 };
  const labels: MissionMapLabels = {
    empty: 'empty',
    basemapUnavailable: 'basemap-unavailable',
    routes: 'routes',
    support: 'support',
    threats: 'threats',
    zones: 'zones',
  };

  beforeEach(() => {
    // Tiles fail at once, as they do offline, so the basemap is never drawn in these tests.
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      crossOrigin = '';
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    });
  });

  it('fails when an annotation-only map could not get its basemap', () => {
    const scene = emptyScene();
    scene.userPins.push({ id: 'pin-1', position: [0, 0], label: 'IP', color: '#ff0000' });
    expect(mapDrawFailed(scene, noBackground)).toBe(true);
  });

  it('allows a genuinely empty map page when no map content exists, after a real draw', async () => {
    // The page is drawn through drawMissionMap, so the result comes from the draw, not from a constant.
    const scene = emptyScene();
    const result = await drawMissionMap(fakeCanvasContext(texts), scene, 0, 0, 1536, 1024, labels);
    expect(result.background).toBe(false);
    expect(hasMissionMapContent(scene)).toBe(false);
    expect(mapDrawFailed(scene, result)).toBe(false);
  });

  it('fails when source annotations cannot be projected into the raster scene', () => {
    const coalition = {
      flights: [], navPoints: [], airbases: [], support: [], aiGroups: [], zones: [], drawings: [],
    };
    const mission = {
      meta: { theatre: 'UnsupportedTestTheatre' },
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
    expect(mapDrawFailed(scene, noBackground)).toBe(true);
  });

  it('does not fail a map whose basemap the user turned off, because that is a choice (decision 6)', () => {
    const scene: MissionMapScene = { ...emptyScene(), basemap: false };
    scene.userPins.push({ id: 'pin-1', position: [0, 0], label: 'IP', color: '#ff0000' });
    expect(mapDrawFailed(scene, noBackground)).toBe(false);
  });
});

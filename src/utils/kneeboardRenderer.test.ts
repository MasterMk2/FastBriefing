// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionData } from '../types/mission';
import type { KneeboardPage, KneeboardTranslate } from './kneeboard';
import { buildMissionMapScene, drawMissionMap, type MissionMapLabels } from './missionMapRaster';
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
    const scene = buildMissionMapScene(fixtureMission() as unknown as MissionData);
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

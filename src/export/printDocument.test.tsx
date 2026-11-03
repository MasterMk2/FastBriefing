// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyViewMode } from '../utils/viewMode';
import type { KneeboardPage } from '../utils/kneeboard';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import { MAX_WHITEBOARD_NOTES, MAX_WHITEBOARD_STROKES } from '../hooks/useWhiteboard';
import PrintDocument from './printDocument';
import { buildExportModel } from './exportModel';
import { fixtureMission } from './__tests__/fixture';

const t = (key: string) => key;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(pages: readonly KneeboardPage[], drawMaps = true) {
  await act(async () => {
    root.render(
      <PrintDocument
        pages={pages}
        title="Export Test"
        viewLabel="creator"
        t={t}
        drawMaps={drawMaps}
      />,
    );
  });
  await settle();
}

/** Lets the map draws finish (the fake image fails at once, so only a macrotask is needed). */
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function mapPages(): KneeboardPage[] {
  const view = applyViewMode(fixtureMission(), 'creator', 'blue');
  const model = buildExportModel({
    view,
    settings: { ...DEFAULT_SETTINGS, briefingSections: ['map'], viewMode: 'creator' },
    side: 'blue',
    scope: { kind: 'mission' },
    whiteboard: { notes: '', strokes: [] },
  }, t);
  return model.pages;
}

/** A 2D context that accepts every call. Only measureText returns a value. */
function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'start', lineCap: 'butt', lineJoin: 'miter',
  };
  return new Proxy(state, {
    get(target, property) {
      if (typeof property !== 'string') return undefined;
      if (property === 'measureText') return (value: string) => ({ width: Array.from(value).length * 8 });
      if (property in target) return target[property];
      return () => undefined;
    },
    set(target, property, value) {
      target[property as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('PrintDocument', () => {
  it('prints text pages with their headings, lines and tables', async () => {
    await render([{
      kind: 'text',
      section: 'route',
      title: 'Nav log: Viper 1',
      sections: [{
        heading: 'Viper 1',
        lines: ['1 | IP'],
        table: { header: ['No', 'Name'], rows: [['1', 'IP']] },
      }],
    }]);
    expect(container.querySelector('.print-document h1')?.textContent).toBe('Export Test');
    expect(container.querySelector('.print-page h2')?.textContent).toBe('Nav log: Viper 1');
    const cells = Array.from(container.querySelectorAll('.print-table td')).map(cell => cell.textContent);
    expect(cells).toEqual(['1', 'IP']);
  });

  it('never prints the other side in pilot view', async () => {
    const view = applyViewMode(fixtureMission(), 'pilot', 'blue');
    const model = buildExportModel({
      view,
      settings: { ...DEFAULT_SETTINGS, briefingSections: ['flights', 'route', 'comms', 'support', 'threats'], viewMode: 'pilot' },
      side: 'blue',
      scope: { kind: 'mission' },
      whiteboard: { notes: '', strokes: [] },
    }, t);
    await render(model.pages);
    expect(container.textContent).toContain('Viper 1');
    expect(container.textContent).not.toContain('Bandit 1');
    expect(container.textContent).not.toContain('SA-10');
  });

  it('lists the map pins with their label and memo under the map (old Markdown and PrintView map pins)', async () => {
    const mission = fixtureMission();
    mission.userNotes.mapAnnotations = [
      { id: 'pin_1', kind: 'pin', position: [42, 43], label: 'Rally', notes: 'Orbit west', color: '#e53935' },
      { id: 'pin_2', kind: 'pin', position: [42.1, 43.1], label: 'Tanker', notes: '', color: '#1e88e5' },
    ];
    const view = applyViewMode(mission, 'pilot', 'blue');
    const model = buildExportModel({
      view,
      settings: { ...DEFAULT_SETTINGS, briefingSections: ['map'], viewMode: 'pilot' },
      side: 'blue',
      scope: { kind: 'mission' },
      whiteboard: { notes: '', strokes: [] },
    }, t);
    await render(model.pages, false);
    const list = container.querySelector('.print-map-page .print-map-pins');
    expect(list?.querySelector('h3')?.textContent).toBe('export:label.mapPins');
    expect(Array.from(list?.querySelectorAll('li') ?? []).map(item => item.textContent)).toEqual(['Rally: Orbit west', 'Tanker']);
  });

  it('prints no pin list when the map has no pins', async () => {
    await render(mapPages(), false);
    expect(container.querySelector('.print-map-pins')).toBeNull();
  });
});

describe('PrintDocument maps (decision 7: drawn only when allowed)', () => {
  let contexts = 0;
  let images = 0;

  beforeEach(() => {
    contexts = 0;
    images = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      contexts += 1;
      return fakeContext();
    });
    // The fake image fails as soon as its source is set, so no tile request waits for the timeout.
    vi.stubGlobal('Image', class FakeImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      url = '';

      constructor() {
        images += 1;
      }

      set src(value: string) {
        this.url = value;
        queueMicrotask(() => this.onerror?.());
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the mission without drawing: no canvas, no tile request, and a wait text', async () => {
    await render(mapPages(), false);
    expect(contexts).toBe(0);
    expect(images).toBe(0);
    expect(container.querySelector('.print-map-status')?.textContent).toBe('export:ui.mapDeferred');
  });

  it('draws the map once, and not again for the same content (an unrelated re-render)', async () => {
    const pages = mapPages();
    await render(pages, true);
    const firstDraw = contexts;
    expect(firstDraw).toBeGreaterThan(0);
    // A new object with the same content, as the export model gives after an unrelated setting change.
    await render(JSON.parse(JSON.stringify(pages)) as KneeboardPage[], true);
    expect(contexts).toBe(firstDraw);
  });

  it('draws again when what the map shows changes', async () => {
    const pages = JSON.parse(JSON.stringify(mapPages())) as KneeboardPage[];
    await render(pages, true);
    const firstDraw = contexts;
    const changed = pages.map(page => (page.kind === 'map' ? { ...page, scene: { ...page.scene, basemap: false } } : page));
    await render(changed, true);
    expect(contexts).toBeGreaterThan(firstDraw);
  });

  it('keeps the drawn map when a page is added before it, because the same map is still shown', async () => {
    const pages = mapPages();
    await render(pages, true);
    const firstDraw = contexts;
    expect(firstDraw).toBeGreaterThan(0);
    // A page before the map shifts its position in the list, but not what the map shows.
    const added: KneeboardPage = {
      kind: 'whiteboard',
      section: 'notes',
      title: 'Whiteboard',
      data: { notes: 'Added before the map', strokes: [] },
    };
    await render([added, ...(JSON.parse(JSON.stringify(pages)) as KneeboardPage[])], true);
    expect(contexts).toBe(firstDraw);
  });

  it('says the basemap is unavailable when the canvas cannot be drawn', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await render(mapPages(), true);
    expect(container.querySelector('.print-map-canvas')).not.toBeNull();
    expect(container.querySelector('.print-map-status')?.textContent).toBe('export:label.basemapUnavailable');
  });

  it('shows no map status for a map page with no content, because an empty map is not an error', async () => {
    const empty: KneeboardPage = {
      kind: 'map',
      section: 'map',
      title: 'Map',
      scene: {
        theatre: 'Caucasus',
        routes: [],
        zones: [],
        drawings: [],
        support: [],
        threats: [],
        userPins: [],
        userStrokes: [],
        unprojectableMapAnnotations: 0,
      },
      pins: [],
    };
    await render([empty], true);
    expect(container.querySelector('.print-map-canvas')).not.toBeNull();
    expect(container.querySelector('.print-map-status')).toBeNull();
  });
});

describe('PrintDocument whiteboard (migrated from the old PrintView)', () => {
  it('prints the whiteboard strokes as a drawing, not only the notes', async () => {
    await render([{
      kind: 'whiteboard',
      section: 'notes',
      title: 'Whiteboard',
      data: {
        notes: 'Dodge north',
        strokes: [{ id: 's1', color: '#ff0000', width: 4, points: [{ x: 10, y: 10 }, { x: 80, y: 40 }] }],
      },
    }]);
    expect(container.querySelector('.print-notes')?.textContent).toBe('Dodge north');
    expect(container.querySelector('.print-whiteboard-board polyline')).not.toBeNull();
  });

  it('keeps the drawing and every note character when the notes are at their maximum length (old briefingPng)', async () => {
    // The print has no page split of its own: the notes and the drawing are one section, and the browser
    // breaks the printed page. So a long note can never push the drawing out.
    const notes = 'x'.repeat(MAX_WHITEBOARD_NOTES);
    await render([{
      kind: 'whiteboard',
      section: 'notes',
      title: 'Whiteboard',
      data: {
        notes,
        strokes: Array.from({ length: MAX_WHITEBOARD_STROKES }, (_, index) => ({
          id: `s${index}`, color: '#175cd3', width: 6, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        })),
      },
    }]);
    expect(container.querySelector('.print-notes')?.textContent).toBe(notes);
    expect(container.querySelectorAll('.print-whiteboard-board polyline')).toHaveLength(MAX_WHITEBOARD_STROKES);
  });

  it('prints no drawing when the whiteboard has no strokes', async () => {
    await render([{
      kind: 'whiteboard',
      section: 'notes',
      title: 'Whiteboard',
      data: { notes: '', strokes: [] },
    }]);
    expect(container.querySelector('.print-whiteboard-board')).toBeNull();
    expect(container.querySelector('.print-notes')?.textContent).toBe('export:label.noWhiteboardNotes');
  });
});

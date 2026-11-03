// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyViewMode } from '../utils/viewMode';
import type { KneeboardPage } from '../utils/kneeboard';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import PrintDocument, { type PrintMapState } from './printDocument';
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

async function render(pages: readonly KneeboardPage[], onMapStateChange?: (state: PrintMapState) => void) {
  await act(async () => {
    root.render(
      <PrintDocument
        pages={pages}
        title="Export Test"
        viewLabel="creator"
        t={t}
        onMapStateChange={onMapStateChange}
      />,
    );
  });
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

  it('reports ready when there is no map page', async () => {
    const onMapStateChange = vi.fn();
    await render([], onMapStateChange);
    expect(onMapStateChange).toHaveBeenLastCalledWith('ready');
  });

  it('reports an error for a map when the canvas cannot be drawn', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const onMapStateChange = vi.fn();
    const view = applyViewMode(fixtureMission(), 'creator', 'blue');
    const model = buildExportModel({
      view,
      settings: { ...DEFAULT_SETTINGS, briefingSections: ['map'], viewMode: 'creator' },
      side: 'blue',
      scope: { kind: 'mission' },
      whiteboard: { notes: '', strokes: [] },
    }, t);
    await render(model.pages, onMapStateChange);
    expect(onMapStateChange).toHaveBeenLastCalledWith('error');
    expect(container.querySelector('.print-map-canvas')).not.toBeNull();
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

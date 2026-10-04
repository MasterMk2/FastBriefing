// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RevisionMap from './RevisionMap';
import { i18nReady } from '../i18n';
import type { RevisionPoint } from '../utils/missionRevision';

const mocks = vi.hoisted(() => ({ fitBounds: vi.fn() }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children, center }: { children: ReactNode; center: number[] }) => <div data-testid="marker" data-position={JSON.stringify(center)}>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Polyline: ({ positions }: { positions: number[][] }) => <div data-testid="line" data-positions={JSON.stringify(positions)} />,
  useMap: () => mocks,
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const point = (index: number, data: RevisionPoint['data']): RevisionPoint => ({ index, name: 'IP', data });
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); await i18nReady; mocks.fitBounds.mockClear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('revision map rendering contract', () => {
  it('projects and labels both revisions with separate route segments', async () => {
    await act(async () => root.render(<RevisionMap theatre="Iraq" routes={[{ name: 'A',
      before: [point(1, { x: 0, y: 0 }), point(2, { x: 100000, y: 50000 })],
      after: [point(1, { x: 1000, y: 0 }), point(2, { x: 100000, y: 50000 })],
    }]} />));
    expect(container.querySelectorAll('[data-testid=line]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid=marker]')).toHaveLength(4);
    expect(container.textContent).toContain('変更前: A'); expect(container.textContent).toContain('変更後: A');
    expect(mocks.fitBounds).toHaveBeenCalled();
  });
  it('never bridges a missing coordinate with an invented segment', async () => {
    await act(async () => root.render(<RevisionMap theatre="Afghanistan" routes={[{ name: 'A',
      before: [point(1, { x: 0, y: 0 }), point(2, {}), point(3, { x: 100000, y: 50000 })], after: [],
    }]} />));
    expect(container.querySelectorAll('[data-testid=line]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid=marker]')).toHaveLength(2);
  });
  it('shows an explicit fallback for unsupported maps', async () => {
    await act(async () => root.render(<RevisionMap theatre="UnsupportedTestTheatre" routes={[{ name: 'A',
      before: [point(1, { x: 0, y: 0 })], after: [],
    }]} />));
    expect(container.querySelector('[data-testid=map]')).toBeNull();
    expect(container.textContent).toContain('緯度経度を解決できません');
  });
});

// @vitest-environment jsdom
// Drawn-output checks with the real react-leaflet and Leaflet (no fake components). jsdom still has no
// layout, so the container size is stubbed; the checks read the SVG attributes and classes Leaflet writes.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flight, MapAnnotation, MissionData, RoutePoint } from '../types/mission';
import { i18nReady } from '../i18n';
import { WorkspaceProvider } from '../shell/workspace';
import { MapPanel } from './MapPanel';

const mocks = vi.hoisted(() => ({
  mission: null as unknown as MissionData,
  setNotes: vi.fn(),
}));

vi.mock('../shell/MissionContext', () => ({
  useMission: () => ({
    mission: mocks.mission,
    view: mocks.mission,
    settings: { viewMode: 'creator', side: 'blue', mapBackground: false, briefingSections: [], language: 'ja' },
    side: 'blue',
    viewMode: 'creator',
    notes: mocks.mission?.userNotes,
    setNotes: mocks.setNotes,
    whiteboard: {},
    sourceFile: null,
    storageFailed: false,
    revisions: null,
    closeRevisions: () => undefined,
  }),
}));

const point = (index: number, latlon: [number, number]): RoutePoint => ({
  index,
  name: `WP${index}`,
  action: 'Turning Point',
  xy: [index * 1000, 0],
  latlon,
  latlonResolved: true,
  alt: 1000,
  altType: 'BARO',
  speed: 200,
  eta: index * 60,
  tasks: [],
}) as RoutePoint;

const emptySide = () => ({
  bullseye: { xy: [0, 0] as [number, number], latlon: [0, 0] as [number, number], latlonResolved: false },
  navPoints: [],
  airbases: [],
  flights: [],
  support: [],
  aiGroups: [],
  zones: [],
  drawings: [],
});

function makeMission(annotations: MapAnnotation[]): MissionData {
  const flight = {
    groupId: 1,
    name: 'BLUE1',
    callsign: 'BLUE1',
    type: 'F-16C_50',
    task: 'CAS',
    frequency: 251,
    modulation: 0,
    hidden: false,
    units: [],
    route: [point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])],
  } as unknown as Flight;
  const second = {
    ...flight,
    groupId: 2,
    name: 'BLUE2',
    callsign: 'BLUE2',
    route: [point(1, [43.5, 43.5]), point(2, [43.6, 43.6])],
  } as unknown as Flight;
  return {
    sourceFingerprint: 'fp-leaflet-test',
    meta: { theatre: 'Caucasus', descriptionBlueTask: '', descriptionRedTask: '' },
    weather: {},
    coalitions: {
      blue: { ...emptySide(), flights: [flight, second] },
      red: emptySide(),
      neutral: emptySide(),
    },
    userNotes: { missionKey: 'k', smeac: {} as never, perFlight: {}, waypoints: {}, mapAnnotations: annotations },
    issues: [],
  } as unknown as MissionData;
}

const stroke = (color: string, width: number): MapAnnotation => ({
  id: 'stroke-1',
  kind: 'stroke',
  points: [[42, 42], [42.1, 42.1], [42.2, 42.1]],
  color,
  width,
}) as MapAnnotation;

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Leaflet sizes the map from the container; jsdom reports zero, which leaves the map without a usable zoom.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  mocks.setNotes.mockClear();
  await i18nReady;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  // Remove the stubs so other test files see jsdom's own values.
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  vi.unstubAllGlobals();
});

const render = async (mission: MissionData) => {
  mocks.mission = mission;
  await act(async () => root.render(<WorkspaceProvider><MapPanel /></WorkspaceProvider>));
};

const buttonByText = (text: string) => [...host.querySelectorAll('button')]
  .find(button => button.textContent?.trim() === text) as HTMLButtonElement | undefined;

/** Pointer event on the map container, or on an element inside it. jsdom has no PointerEvent. */
function pointer(type: 'pointerdown' | 'pointerup', x: number, y: number, target: Element | null): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  target?.dispatchEvent(event);
}

/** SVG paths Leaflet drew with the given stroke colour. */
const pathsWithStroke = (colour: string) => [...host.querySelectorAll<SVGPathElement>('path')]
  .filter(node => node.getAttribute('stroke') === colour);

describe('drawn map (real react-leaflet)', () => {
  it('a saved stroke is drawn with its new colour and width, not the old ones', async () => {
    await render(makeMission([stroke('#123456', 4)]));
    const before = pathsWithStroke('#123456');
    expect(before).toHaveLength(1);
    expect(before[0].getAttribute('stroke-width')).toBe('4');

    await render(makeMission([stroke('#abcdef', 12)]));
    expect(pathsWithStroke('#123456')).toHaveLength(0);
    const after = pathsWithStroke('#abcdef');
    expect(after).toHaveLength(1);
    expect(after[0].getAttribute('stroke-width')).toBe('12');
  });

  it('the own side first flight is selected at mount, and a click on another flight line picks that flight', async () => {
    await render(makeMission([]));
    const routeClasses = () => [...host.querySelectorAll<SVGPathElement>('path.map-route-blue')]
      .map(node => node.getAttribute('class') ?? '');
    expect(routeClasses()).toHaveLength(2);
    expect(routeClasses()[0]).toContain('is-selected');
    expect(routeClasses()[1]).not.toContain('is-selected');

    // Picking a flight on the map: a click on its route line (Leaflet's own click handler selects the flight).
    const line = host.querySelectorAll<SVGPathElement>('path.map-route-blue')[1];
    await act(async () => line?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(routeClasses()[1]).toContain('is-selected');
    expect(routeClasses()[0]).not.toContain('is-selected');
  });

  it('a press on a route marker in pin mode opens nothing and adds no pin; a press on empty map adds one', async () => {
    await render(makeMission([]));
    await act(async () => buttonByText('ピン')?.click());

    const marker = host.querySelector<HTMLElement>('.leaflet-marker-icon');
    expect(marker).not.toBeNull();
    const container = host.querySelector<HTMLElement>('.leaflet-container');
    expect(container).not.toBeNull();

    await act(async () => {
      pointer('pointerdown', 100, 100, marker);
      pointer('pointerup', 100, 100, marker);
    });
    expect(mocks.setNotes).not.toHaveBeenCalled();

    // Positive control: the same gesture on empty map does add a pin, so the event path is live.
    await act(async () => {
      pointer('pointerdown', 300, 300, container);
      pointer('pointerup', 300, 300, container);
    });
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
  });
});

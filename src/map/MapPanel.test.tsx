// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIGroup, Flight, MapAnnotation, MissionData, RoutePoint } from '../types/mission';
import { i18nReady } from '../i18n';
import { applyViewMode } from '../utils/viewMode';
import { WorkspaceProvider, useWorkspace } from '../shell/workspace';
import { MAX_MAP_STROKE_POINTS } from '../utils/notes';
import { MapPanel } from './MapPanel';

const mocks = vi.hoisted(() => ({
  mission: null as unknown as MissionData,
  view: null as unknown as MissionData,
  side: 'blue' as 'blue' | 'red',
  viewMode: 'creator' as 'creator' | 'pilot',
  settings: {} as Record<string, unknown>,
  storageFailed: false,
  setNotes: vi.fn(),
  fitBounds: vi.fn(),
  setView: vi.fn(),
  panTo: vi.fn(),
  inView: true,
  dragEnable: vi.fn(),
  dragDisable: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  tileError: null as null | (() => void),
  tileLoad: null as null | (() => void),
  container: null as null | HTMLElement,
}));

// Leaflet itself needs a real browser layout, so the components are replaced by plain elements
// (the same approach as RevisionMap.test.tsx). The fake map records fits and gives pointer input a container.
vi.mock('react-leaflet', () => {
  const fakeMap = {
    fitBounds: (...args: unknown[]) => mocks.fitBounds(...args),
    setView: (...args: unknown[]) => mocks.setView(...args),
    distance: (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 111_000,
    getContainer: () => mocks.container,
    getCenter: () => ({ lat: 40, lng: 41 }),
    getBounds: () => ({ contains: () => mocks.inView }),
    panTo: (...args: unknown[]) => mocks.panTo(...args),
    mouseEventToLatLng: (event: { clientX: number; clientY: number }) => ({
      lat: 40 + event.clientY / 1000,
      lng: 40 + event.clientX / 1000,
    }),
    dragging: { enable: () => mocks.dragEnable(), disable: () => mocks.dragDisable() },
    zoomIn: () => mocks.zoomIn(),
    zoomOut: () => mocks.zoomOut(),
  };
  return {
    // The rendered div is the map container: markers sit inside it, so a press on a marker reaches the pointer code.
    MapContainer: ({ children, className }: { children: unknown; className?: string }) => (
      <div data-testid="map" className={className} ref={node => { if (node) mocks.container = node; }}>
        {children as never}
      </div>
    ),
    TileLayer: ({ eventHandlers }: { eventHandlers?: { tileerror?: () => void; tileload?: () => void } }) => {
      mocks.tileError = eventHandlers?.tileerror ?? null;
      mocks.tileLoad = eventHandlers?.tileload ?? null;
      return <div data-testid="tile" />;
    },
    // Leaflet gives an interactive marker the class leaflet-marker-icon, which the pointer code relies on.
    // A click on a marker or a line runs its eventHandlers, as Leaflet does; the panel's route picks rely on it.
    Marker: ({ children, title, eventHandlers, icon }: {
      children?: unknown;
      title?: string;
      eventHandlers?: { click?: () => void };
      icon?: { options?: { className?: string } };
    }) => (
      <div
        data-testid="marker"
        className={`leaflet-marker-icon ${icon?.options?.className ?? ''}`}
        data-title={title}
        onClick={() => eventHandlers?.click?.()}
      >
        {children as never}
      </div>
    ),
    Popup: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
    // Stroke colour and width arrive as pathOptions, as in the real panel; the fake shows them as data attributes.
    Polyline: ({ positions, className, children, pathOptions, eventHandlers }: {
      positions: unknown[];
      className?: string;
      children?: unknown;
      pathOptions?: { color?: string; weight?: number };
      eventHandlers?: { click?: () => void };
    }) => (
      <div
        data-testid="polyline"
        className={className}
        data-count={positions.length}
        data-color={pathOptions?.color}
        data-weight={pathOptions?.weight}
        onClick={() => eventHandlers?.click?.()}
      >
        {children as never}
      </div>
    ),
    Polygon: ({ positions, className, children }: { positions: unknown[]; className?: string; children?: unknown }) => (
      <div data-testid="polygon" className={className} data-count={positions.length}>{children as never}</div>
    ),
    Circle: ({ children, className, radius }: { children?: unknown; className?: string; radius?: number }) => (
      <div data-testid="circle" className={className} data-radius={radius}>{children as never}</div>
    ),
    LayerGroup: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
    useMap: () => fakeMap,
  };
});

vi.mock('../shell/MissionContext', () => ({
  useMission: () => ({
    mission: mocks.mission,
    view: mocks.view,
    settings: mocks.settings,
    side: mocks.side,
    viewMode: mocks.viewMode,
    notes: mocks.mission?.userNotes,
    setNotes: mocks.setNotes,
    whiteboard: {},
    sourceFile: null,
    storageFailed: mocks.storageFailed,
    revisions: null,
    closeRevisions: () => undefined,
  }),
}));

const point = (index: number, latlon: [number, number], resolved = true): RoutePoint => ({
  index,
  name: `WP${index}`,
  action: 'Turning Point',
  xy: [index * 1000, 0],
  latlon,
  latlonResolved: resolved,
  alt: 1000,
  altType: 'BARO',
  speed: 200,
  eta: index * 60,
  tasks: [],
}) as RoutePoint;

const flight = (groupId: number, callsign: string, route: RoutePoint[]): Flight => ({
  groupId,
  name: callsign,
  callsign,
  type: 'F-16C_50',
  task: 'CAS',
  frequency: 251,
  modulation: 0,
  hidden: false,
  units: [],
  route,
}) as Flight;

const aiGroup = (type: string, latlon: [number, number], threatRange: number): AIGroup => ({
  category: 'SAM',
  type,
  count: 1,
  position: [0, 0],
  latlon,
  latlonResolved: true,
  threatRange,
  hidden: false,
  lateActivation: false,
  startTime: 0,
}) as AIGroup;

const coalition = (overrides: Partial<MissionData['coalitions']['blue']> = {}) => ({
  bullseye: { xy: [0, 0] as [number, number], latlon: [0, 0] as [number, number], latlonResolved: false },
  navPoints: [],
  airbases: [],
  flights: [],
  support: [],
  aiGroups: [],
  zones: [],
  drawings: [],
  ...overrides,
});

const pin = (id: string): MapAnnotation => ({ id, kind: 'pin', position: [42, 43], label: id, notes: '', color: '#123456' });

function makeMission(options: { theatre?: string; annotations?: MapAnnotation[] } = {}): MissionData {
  return {
    sourceFingerprint: 'fp-map-test',
    meta: { theatre: options.theatre ?? 'Caucasus', descriptionBlueTask: 'blue task', descriptionRedTask: 'red task' },
    weather: {},
    coalitions: {
      blue: coalition({
        flights: [flight(1, 'BLUE1', [point(1, [42, 42]), point(2, [42.1, 42.1], false)])],
        aiGroups: [aiGroup('BLUE-SAM', [42.2, 42.2], 20000)],
        bullseye: { xy: [1, 1], latlon: [42, 43], latlonResolved: true },
      }),
      red: coalition({
        flights: [flight(2, 'RED1', [point(1, [43, 43]), point(2, [43.1, 43.1])])],
        aiGroups: [aiGroup('RED-SAM', [43.2, 43.2], 30000)],
      }),
      neutral: coalition(),
    },
    userNotes: {
      missionKey: 'k',
      smeac: {} as never,
      perFlight: {},
      waypoints: {},
      mapAnnotations: options.annotations ?? [],
    },
    issues: [],
  } as unknown as MissionData;
}

function setContext(
  mission: MissionData,
  options: { viewMode?: 'creator' | 'pilot'; side?: 'blue' | 'red'; mapBackground?: boolean } = {},
): void {
  const viewMode = options.viewMode ?? 'creator';
  const side = options.side ?? 'blue';
  mocks.mission = mission;
  mocks.viewMode = viewMode;
  mocks.side = side;
  mocks.view = applyViewMode(mission, viewMode, side);
  mocks.settings = {
    viewMode,
    side,
    mapBackground: options.mapBackground ?? true,
    briefingSections: [],
    language: 'ja',
  };
}

/** Stands in for the flight list: selects a flight key in the workspace, as a click on a flight does. */
function FlightPicker({ value }: { value: string }) {
  const { setFlightKey } = useWorkspace();
  return <button type="button" onClick={() => setFlightKey(value)}>フライト選択</button>;
}

/**
 * Stands in for the flight list and the route table: each button sets one workspace value, as a click there does.
 */
function WorkspaceControls() {
  const { setFlightKey, setRouteFocus, setMapUi } = useWorkspace();
  return (
    <>
      <button type="button" onClick={() => setFlightKey(null)}>選択なし</button>
      <button type="button" onClick={() => setRouteFocus({ flightKey: 'blue:1', routeIndex: 1 })}>経路点を選ぶ</button>
      <button type="button" onClick={() => setRouteFocus({ flightKey: 'red:2', routeIndex: 1 })}>赤の経路点を選ぶ</button>
      <button type="button" onClick={() => setMapUi(previous => ({ ...previous, soloFlightKey: 'blue:1' }))}>この機だけ</button>
    </>
  );
}

/** Keeps the map mounted or unmounted from outside, the way a screen change does. */
function Harness({ readOnly = false, focusFlightKey }: { readOnly?: boolean; focusFlightKey?: string | null }) {
  const [visible, setVisible] = useState(true);
  return (
    <WorkspaceProvider>
      <button type="button" onClick={() => setVisible(value => !value)}>切替</button>
      <FlightPicker value="blue:1" />
      <WorkspaceControls />
      {visible && <MapPanel readOnly={readOnly} focusFlightKey={focusFlightKey} />}
    </WorkspaceProvider>
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await i18nReady;
  mocks.fitBounds.mockClear();
  mocks.setView.mockClear();
  mocks.panTo.mockClear();
  mocks.inView = true;
  mocks.zoomIn.mockClear();
  mocks.zoomOut.mockClear();
  mocks.setNotes.mockClear();
  mocks.dragEnable.mockClear();
  mocks.dragDisable.mockClear();
  mocks.tileError = null;
  mocks.tileLoad = null;
  mocks.storageFailed = false;
  mocks.container = document.createElement('div');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = async (element = <Harness />) => {
  await act(async () => root.render(element));
};

const buttonByText = (text: string) => [...host.querySelectorAll('button')]
  .find(button => button.textContent?.trim() === text) as HTMLButtonElement | undefined;

const layerCheckbox = (text: string) => [...host.querySelectorAll<HTMLLabelElement>('.map-layer-toggle')]
  .find(label => label.textContent?.trim() === text)?.querySelector('input') as HTMLInputElement | undefined;

/**
 * Pointer event on the map container, or on a element inside it (a marker) when `target` is given.
 * jsdom has no PointerEvent, so the fields are attached to a MouseEvent.
 */
function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  id: number,
  x: number,
  y: number,
  target: Element | null = mocks.container,
): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: id });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  target?.dispatchEvent(event);
}

/** Sets a controlled input's value the way a user's typing does, so React sees the change. */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('map panel state and screen changes', () => {
  it('keeps the layer toggles when the map is left and come back to', async () => {
    setContext(makeMission());
    await render();
    await act(async () => layerCheckbox('AI 群')?.click());
    expect(layerCheckbox('AI 群')?.checked).toBe(false);

    await act(async () => buttonByText('切替')?.click());
    await act(async () => buttonByText('切替')?.click());

    expect(layerCheckbox('AI 群')?.checked).toBe(false);
  });

  it('keeps the chosen annotation tool when the map is left and come back to', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('ピン')?.click());
    await act(async () => buttonByText('切替')?.click());
    await act(async () => buttonByText('切替')?.click());
    expect(buttonByText('ピン')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('fits the map on mount and again only when asked with 全体表示', async () => {
    setContext(makeMission());
    await render();
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    await act(async () => buttonByText('全体表示')?.click());
    expect(mocks.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('fits the map to the selected flight at mount, and again when the selection changes', async () => {
    setContext(makeMission());
    await render();
    // The own side's first flight is selected by default (T7), so the mount fits that flight.
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    await act(async () => buttonByText('選択なし')?.click());
    expect(mocks.fitBounds).toHaveBeenCalledTimes(2);
    await act(async () => buttonByText('フライト選択')?.click());
    expect(mocks.fitBounds).toHaveBeenCalledTimes(3);
  });

  it('a route pick marks its point and never refits the view', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render();
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    await act(async () => buttonByText('経路点を選ぶ')?.click());
    const ring = host.querySelectorAll('.map-icon-focus');
    expect(ring).toHaveLength(1);
    expect(ring[0].getAttribute('data-title')).toBe('BLUE1: WP2');
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    expect(mocks.panTo).not.toHaveBeenCalled();
  });

  it('a route pick on another flight marks that route too, and the selected flight stays marked', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render();
    const fitsBefore = mocks.fitBounds.mock.calls.length;
    await act(async () => buttonByText('赤の経路点を選ぶ')?.click());
    expect(host.querySelector('[data-testid="polyline"].map-route-red.is-selected')).not.toBeNull();
    expect(host.querySelector('[data-testid="polyline"].map-route-blue.is-selected')).not.toBeNull();
    const ring = host.querySelectorAll('.map-icon-focus');
    expect(ring).toHaveLength(1);
    expect(ring[0].getAttribute('data-title')).toBe('RED1: WP2');
    expect(mocks.fitBounds).toHaveBeenCalledTimes(fitsBefore);
  });

  it('a route pick pans to its point only when the point is out of view', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    mocks.inView = false;
    await render();
    await act(async () => buttonByText('経路点を選ぶ')?.click());
    expect(mocks.panTo).toHaveBeenCalledTimes(1);
    expect(mocks.panTo).toHaveBeenCalledWith([42.1, 42.1]);
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('this flight only keeps its own route on the map, and the banner shows every flight again', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render();
    expect(host.querySelectorAll('[data-testid="polyline"].map-route-red').length).toBeGreaterThan(0);
    await act(async () => buttonByText('この機だけ')?.click());
    expect(host.querySelector('[data-testid="polyline"].map-route-red')).toBeNull();
    expect(host.querySelector('[data-testid="polyline"].map-route-blue')).not.toBeNull();
    expect(host.querySelector('.map-solo')?.textContent).toContain('BLUE1 だけを表示中');
    await act(async () => buttonByText('全機を表示に戻す')?.click());
    expect(host.querySelector('[data-testid="polyline"].map-route-red')).not.toBeNull();
    expect(host.querySelector('.map-solo')).toBeNull();
  });

  it('a route pick on the read-only map changes no flight selection and offers no flight link', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render(<Harness readOnly />);
    await act(async () => buttonByText('選択なし')?.click());
    const line = host.querySelector<HTMLElement>('[data-testid="polyline"].map-route-blue');
    expect(line).not.toBeNull();
    await act(async () => line?.click());
    expect(host.querySelector('[data-testid="polyline"].map-route-blue.is-selected')).toBeNull();
    expect(buttonByText('この機のナビログを開く')).toBeUndefined();
  });

  it('a read-only map ignores the solo flight of the map screen, so a briefing with no focus shows every flight', async () => {
    setContext(makeMission());
    await render(<Harness readOnly focusFlightKey={null} />);
    await act(async () => buttonByText('この機だけ')?.click());
    expect(host.querySelector('[data-testid="polyline"].map-route-red')).not.toBeNull();
    expect(host.querySelector('.map-solo')).toBeNull();
  });

  it('a briefing map focused on one flight fits it and dims the others', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render(<Harness focusFlightKey="blue:1" />);
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="polyline"].map-route-blue')?.className).not.toContain('is-dim');
    expect(host.querySelector('[data-testid="polyline"].map-route-red')?.className).toContain('is-dim');
  });

  it('a briefing map with no focused flight shows every flight, with none dimmed', async () => {
    setContext(makeMission());
    await render(<Harness focusFlightKey={null} />);
    expect(host.querySelector('.is-dim')).toBeNull();
    expect(host.querySelector('.map-route-red')).not.toBeNull();
  });

  it('a read-only briefing map with no focus argument fits every flight, as null does, and picking a flight does not refit it', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render(<Harness readOnly focusFlightKey={null} />);
    const allFlightsBounds = mocks.fitBounds.mock.calls[0][0];

    // A fresh mount of the same map, this time without the focusFlightKey prop.
    await act(async () => root.unmount());
    root = createRoot(host);
    mocks.fitBounds.mockClear();
    await render(<Harness readOnly />);
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    expect(mocks.fitBounds.mock.calls[0][0]).toEqual(allFlightsBounds);

    await act(async () => buttonByText('選択なし')?.click());
    await act(async () => buttonByText('フライト選択')?.click());
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.is-dim')).toBeNull();
  });

  it('picking the same route row again pans to its point again when that point is still out of view', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    mocks.inView = false;
    await render();
    await act(async () => buttonByText('経路点を選ぶ')?.click());
    expect(mocks.panTo).toHaveBeenCalledTimes(1);
    await act(async () => buttonByText('経路点を選ぶ')?.click());
    expect(mocks.panTo).toHaveBeenCalledTimes(2);
    expect(mocks.panTo).toHaveBeenLastCalledWith([42.1, 42.1]);
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe('legend', () => {
  it('pilot view names only the displayed side: no opposing route and no opposing shape', async () => {
    setContext(makeMission(), { viewMode: 'pilot', side: 'blue' });
    await render();
    const legend = host.querySelector('.map-legend')?.textContent ?? '';
    expect(legend).toContain('青の経路');
    expect(legend).not.toContain('赤の経路');
    expect(legend).not.toContain('赤（ひし形）');
    expect(host.querySelector('.map-legend .map-mark-red')).toBeNull();
  });

  it('creator view names both sides, each with its own shape', async () => {
    setContext(makeMission(), { viewMode: 'creator', side: 'blue' });
    await render();
    const legend = host.querySelector('.map-legend')?.textContent ?? '';
    expect(legend).toContain('赤の経路');
    expect(legend).toContain('赤（ひし形）');
    expect(host.querySelector('.map-legend .map-mark-red')).not.toBeNull();
  });

  it('the solo flight legend names only its own route', async () => {
    setContext(makeMission(), { viewMode: 'creator', side: 'blue' });
    await render();
    expect(host.querySelector('.map-legend')?.textContent).toContain('赤の経路');
    await act(async () => buttonByText('この機だけ')?.click());
    const legend = host.querySelector('.map-legend')?.textContent ?? '';
    expect(legend).toContain('青の経路');
    expect(legend).not.toContain('赤の経路');
  });

  it('pilot view titles the units group as support only, without threats', async () => {
    setContext(makeMission(), { viewMode: 'pilot', side: 'blue' });
    await render();
    const headings = [...host.querySelectorAll('.map-layers-panel legend')].map(node => node.textContent);
    expect(headings).toContain('支援');
    expect(headings).not.toContain('支援と脅威');
  });
});

describe('annotations', () => {
  it('places a pin and keeps the pin tool, and a new annotation does not refit the map', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('ピン')?.click());
    await act(async () => {
      pointer('pointerdown', 1, 100, 100);
      pointer('pointerup', 1, 100, 100);
    });
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }];
    expect(notes.mapAnnotations).toHaveLength(1);
    expect(notes.mapAnnotations[0].kind).toBe('pin');

    // The parent now holds the new annotation; the map re-renders with it.
    setContext({ ...makeMission(), userNotes: { ...makeMission().userNotes, mapAnnotations: notes.mapAnnotations } } as MissionData);
    await render();
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    expect(buttonByText('ピン')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('draws a line with one finger', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('線')?.click());
    await act(async () => {
      pointer('pointerdown', 1, 100, 100);
      pointer('pointermove', 1, 200, 100);
      pointer('pointermove', 1, 300, 100);
      pointer('pointerup', 1, 300, 100);
    });
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }];
    expect(notes.mapAnnotations[0].kind).toBe('stroke');
  });

  it('drops a line when a second finger touches, so the two fingers move the map instead', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('線')?.click());
    await act(async () => {
      pointer('pointerdown', 1, 100, 100);
      pointer('pointermove', 1, 200, 100);
      pointer('pointerdown', 2, 300, 100);
      pointer('pointermove', 1, 400, 100);
      pointer('pointerup', 1, 400, 100);
      pointer('pointerup', 2, 300, 100);
    });
    expect(mocks.setNotes).not.toHaveBeenCalled();
  });

  it('refuses a pin at the annotation limit and says why', async () => {
    const full = Array.from({ length: 200 }, (_, index) => pin(`p${index}`));
    setContext(makeMission({ annotations: full }));
    await render();
    await act(async () => buttonByText('ピン')?.click());
    await act(async () => {
      pointer('pointerdown', 1, 100, 100);
      pointer('pointerup', 1, 100, 100);
    });
    expect(mocks.setNotes).not.toHaveBeenCalled();
    expect(host.textContent).toContain('注釈は上限の 200 件に達しています');
    expect(host.textContent).toContain('注釈 200 / 200');
  });

  it('undoes the last pin by its name, and restores it with 元に戻す', async () => {
    const existing = pin('p-only');
    setContext(makeMission({ annotations: [existing] }));
    await render();
    await act(async () => buttonByText('直前のピンを取り消す')?.click());
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
    expect((mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }])[0].mapAnnotations).toEqual([]);

    setContext(makeMission({ annotations: [] }));
    await render();
    await act(async () => buttonByText('元に戻す')?.click());
    const restored = (mocks.setNotes.mock.calls[1] as [{ mapAnnotations: MapAnnotation[] }])[0].mapAnnotations;
    expect(restored).toEqual([existing]);
  });

  it('Escape returns the tool to 移動', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('ピン')?.click());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(buttonByText('移動')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('readOnly shows no tools and ignores pointer input, even when the pin tool was left on', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('ピン')?.click());
    await render(<Harness readOnly />);
    expect(host.querySelector('.map-tools')).toBeNull();
    await act(async () => {
      pointer('pointerdown', 1, 100, 100);
      pointer('pointerup', 1, 100, 100);
    });
    expect(mocks.setNotes).not.toHaveBeenCalled();
  });

  it('ends a line at the point limit, keeps it, and says so', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('線')?.click());
    const last = MAX_MAP_STROKE_POINTS + 50;
    await act(async () => {
      pointer('pointerdown', 1, 0, 0);
      for (let x = 1; x <= last; x += 1) pointer('pointermove', 1, x, 0);
      pointer('pointerup', 1, last, 0);
    });
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: { kind: string; points: unknown[] }[] }];
    expect(notes.mapAnnotations).toHaveLength(1);
    expect(notes.mapAnnotations[0].kind).toBe('stroke');
    expect(notes.mapAnnotations[0].points).toHaveLength(MAX_MAP_STROKE_POINTS);
    expect(host.textContent).toContain('ここで線を終えました');
  });

  it('places a pin at the map centre with the button, and not elsewhere', async () => {
    setContext(makeMission());
    await render();
    expect(buttonByText('地図の中心に置く')).toBeUndefined();
    await act(async () => buttonByText('ピン')?.click());
    await act(async () => buttonByText('地図の中心に置く')?.click());
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: { kind: string; position: number[] }[] }];
    expect(notes.mapAnnotations[0]).toMatchObject({ kind: 'pin', position: [40, 41] });
  });

  it('says so next to the tools when this device cannot save', async () => {
    setContext(makeMission());
    await render();
    expect(host.textContent).not.toContain('この端末に保存できません');
    mocks.storageFailed = true;
    await render();
    expect(host.textContent).toContain('この端末に保存できません');
    mocks.storageFailed = false;
  });
});

describe('base map loading', () => {
  it('shows the loading state until a tile arrives, then clears it', async () => {
    setContext(makeMission());
    await render();
    expect(host.textContent).toContain('地図を準備中');
    await act(async () => mocks.tileLoad?.());
    expect(host.textContent).not.toContain('地図を準備中');
    expect(host.textContent).not.toContain('地図背景なし');
  });

  it('a failed base map comes back when the background is turned off and on again', async () => {
    setContext(makeMission());
    await render();
    await act(async () => mocks.tileError?.());
    expect(host.textContent).toContain('地図背景なし');

    setContext(makeMission(), { mapBackground: false });
    await render();
    expect(host.textContent).not.toContain('地図背景なし');
    expect(host.textContent).toContain('地図背景は非表示');

    setContext(makeMission(), { mapBackground: true });
    await render();
    expect(host.textContent).not.toContain('地図背景なし');
    expect(host.textContent).toContain('地図を準備中');
  });
});

describe('pilot and creator data', () => {
  it('pilot view offers no threat or enemy controls and shows none of the opposing side', async () => {
    setContext(makeMission(), { viewMode: 'pilot', side: 'blue' });
    await render();
    expect(layerCheckbox('脅威の圏')).toBeUndefined();
    expect(layerCheckbox('AI 群')).toBeUndefined();
    expect(host.textContent).not.toContain('RED1');
    expect(host.textContent).not.toContain('RED-SAM');
    expect(host.textContent).not.toContain('BLUE-SAM');
    expect(document.querySelectorAll('.map-range-threat')).toHaveLength(0);
  });

  it('pilot view counts only the displayed side unresolved points, so the opposing bullseye is not counted', async () => {
    setContext(makeMission(), { viewMode: 'pilot', side: 'blue' });
    await render();
    expect(host.textContent).toContain('地図外 1 件');
    setContext(makeMission(), { viewMode: 'creator', side: 'blue' });
    await render();
    expect(host.textContent).toContain('地図外 2 件');
    expect(host.textContent).toContain('未解決');
  });

  it('threat circles are the opposing side only, and follow the displayed side', async () => {
    setContext(makeMission(), { viewMode: 'creator', side: 'blue' });
    await render();
    const circles = () => [...document.querySelectorAll('.map-range-threat')].map(node => node.textContent ?? '');
    expect(circles().join('|')).toContain('RED-SAM');
    expect(circles().join('|')).not.toContain('BLUE-SAM');

    setContext(makeMission(), { viewMode: 'creator', side: 'red' });
    await render();
    expect(circles().join('|')).toContain('BLUE-SAM');
    expect(circles().join('|')).not.toContain('RED-SAM');
  });
});

describe('map background and unsupported maps', () => {
  it('hides the base map when the display setting is off', async () => {
    setContext(makeMission(), { mapBackground: false });
    await render();
    expect(host.querySelector('[data-testid=tile]')).toBeNull();
    expect(host.textContent).toContain('地図背景は非表示');
  });

  it('says so when the base map tiles fail to load, and keeps the overlays', async () => {
    setContext(makeMission());
    await render();
    expect(host.querySelector('[data-testid=tile]')).not.toBeNull();
    await act(async () => mocks.tileError?.());
    expect(host.textContent).toContain('地図背景なし');
    expect(host.querySelector('[data-testid=marker]')).not.toBeNull();
  });

  it('an unsupported theatre draws no map and lists the DCS coordinates instead', async () => {
    setContext(makeMission({ theatre: 'UnsupportedTestTheatre' }));
    await render();
    expect(host.querySelector('[data-testid=map]')).toBeNull();
    expect(host.textContent).toContain('未対応マップ: DCS UnsupportedTestTheatre');
    const rows = [...host.querySelectorAll('tbody tr')].map(row => row.textContent ?? '');
    expect(rows.some(row => row.includes('BLUE1: WP1'))).toBe(true);
    expect(mocks.fitBounds).not.toHaveBeenCalled();
  });
});

/** The blue flight, with a route the test chooses. */
function missionWithBlueRoute(route: RoutePoint[]): MissionData {
  const mission = makeMission();
  mission.coalitions.blue.flights[0].route = route;
  return mission;
}

describe('marker presses, zoom, route lines and empty states', () => {
  it('a press on an existing marker adds no pin, so the marker can open its popup', async () => {
    setContext(makeMission());
    await render();
    await act(async () => buttonByText('ピン')?.click());
    const marker = host.querySelector<HTMLElement>('.leaflet-marker-icon');
    expect(marker).not.toBeNull();
    await act(async () => {
      pointer('pointerdown', 1, 100, 100, marker);
      pointer('pointerup', 1, 100, 100, marker);
    });
    expect(mocks.setNotes).not.toHaveBeenCalled();
  });

  it('a saved stroke shows its new colour and width on the line', async () => {
    const stroke = { id: 's1', kind: 'stroke', points: [[42, 42], [42.1, 42.1]], color: '#123456', width: 4 } as MapAnnotation;
    setContext(makeMission({ annotations: [stroke] }));
    await render();
    const line = () => host.querySelector<HTMLElement>('[data-color="#123456"]');
    expect(line()?.dataset.weight).toBe('4');

    const colorInput = line()?.querySelector<HTMLInputElement>('input[type="color"]');
    const widthInput = line()?.querySelector<HTMLInputElement>('input[type="number"]');
    if (!colorInput || !widthInput) throw new Error('stroke editor is not shown');
    await act(async () => {
      typeInto(colorInput, '#abcdef');
      typeInto(widthInput, '99');
    });
    await act(async () => buttonByText('保存')?.click());

    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }];
    expect(notes.mapAnnotations[0]).toMatchObject({ color: '#abcdef', width: 12 });
    setContext(makeMission({ annotations: notes.mapAnnotations }));
    await render();
    expect(host.querySelector('[data-color="#abcdef"]')?.getAttribute('data-weight')).toBe('12');
  });

  it('an empty width field keeps the stored width when the stroke is saved', async () => {
    const stroke = { id: 's1', kind: 'stroke', points: [[42, 42], [42.1, 42.1]], color: '#123456', width: 4 } as MapAnnotation;
    setContext(makeMission({ annotations: [stroke] }));
    await render();
    const widthInput = host.querySelector<HTMLInputElement>('[data-color="#123456"] input[type="number"]');
    if (!widthInput) throw new Error('stroke editor is not shown');
    await act(async () => typeInto(widthInput, ''));
    await act(async () => buttonByText('保存')?.click());
    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }];
    expect(notes.mapAnnotations[0]).toMatchObject({ width: 4 });
  });

  it('the zoom buttons zoom the map in and out', async () => {
    setContext(makeMission());
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="拡大"]')?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="縮小"]')?.click());
    expect(mocks.zoomIn).toHaveBeenCalledTimes(1);
    expect(mocks.zoomOut).toHaveBeenCalledTimes(1);
  });

  it('a point without coordinates breaks the route line, so no line bridges the gap', async () => {
    setContext(missionWithBlueRoute([
      point(1, [42, 42]),
      point(2, [42.1, 42.1], false),
      point(3, [42.2, 42.2]),
      point(4, [42.3, 42.3]),
    ]));
    await render();
    const counts = [...host.querySelectorAll<HTMLElement>('[data-testid="polyline"].map-route-blue')].map(node => node.dataset.count);
    expect(counts).toEqual(['2']);
  });

  it('the selected flight route is marked as selected when the flight is picked', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render();
    // The own side's first flight is selected at mount, so its route is marked before any click.
    expect(host.querySelector('[data-testid="polyline"].map-route-blue.is-selected')).not.toBeNull();
    await act(async () => buttonByText('選択なし')?.click());
    expect(host.querySelector('[data-testid="polyline"].is-selected')).toBeNull();
    await act(async () => buttonByText('フライト選択')?.click());
    expect(host.querySelector('[data-testid="polyline"].map-route-blue.is-selected')).not.toBeNull();
  });

  it('a press on a route line selects the flight with the move tool', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render();
    await act(async () => buttonByText('選択なし')?.click());
    await act(async () => host.querySelector<HTMLElement>('[data-testid="polyline"].map-route-blue')?.click());
    expect(host.querySelector('[data-testid="polyline"].map-route-blue.is-selected')).not.toBeNull();
  });

  it('with the pin tool a press on a route line places a pin and leaves the flight selection alone', async () => {
    setContext(missionWithBlueRoute([point(1, [42, 42]), point(2, [42.1, 42.1]), point(3, [42.2, 42.2])]));
    await render();
    await act(async () => buttonByText('選択なし')?.click());
    await act(async () => buttonByText('ピン')?.click());
    const line = host.querySelector<HTMLElement>('[data-testid="polyline"].map-route-blue');
    expect(line).not.toBeNull();
    await act(async () => {
      pointer('pointerdown', 1, 100, 100, line);
      pointer('pointerup', 1, 100, 100, line);
    });
    await act(async () => line?.click());
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }];
    expect(notes.mapAnnotations[0].kind).toBe('pin');
    expect(host.querySelector('.map-route.is-selected')).toBeNull();
    expect(mocks.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('with every layer off the map says so and restores the layers on request', async () => {
    setContext(makeMission());
    await render();
    const boxes = () => [...host.querySelectorAll<HTMLInputElement>('.map-layer-toggle input')];
    for (const box of boxes()) {
      if (box.checked) await act(async () => box.click());
    }
    expect(boxes().every(box => !box.checked)).toBe(true);
    expect(host.textContent).toContain('表示中のレイヤーがありません');

    await act(async () => buttonByText('レイヤーを戻す')?.click());
    expect(layerCheckbox('フライトの経路')?.checked).toBe(true);
    expect(host.textContent).not.toContain('表示中のレイヤーがありません');
  });

  it('with the annotations layer off, the tools say so and allow no drawing', async () => {
    setContext(makeMission());
    await render();
    await act(async () => layerCheckbox('注釈')?.click());
    expect(host.querySelector('.map-tools')?.textContent).toContain('注釈のレイヤーが非表示');
    expect(buttonByText('ピン')).toBeUndefined();
    await act(async () => {
      pointer('pointerdown', 1, 100, 100);
      pointer('pointerup', 1, 100, 100);
    });
    expect(mocks.setNotes).not.toHaveBeenCalled();
  });

  it('the untouched default ink is the theme colour 1, and the colour swatches pick the others', async () => {
    const root = document.documentElement.style;
    root.setProperty('--ink-1', '#ffd166');
    root.setProperty('--ink-2', '#7fe0c4');
    try {
      setContext(makeMission());
      await render();
      expect(host.querySelector('button[aria-label="色 1"]')?.getAttribute('aria-pressed')).toBe('true');
      await act(async () => buttonByText('ピン')?.click());
      await act(async () => {
        pointer('pointerdown', 1, 100, 100);
        pointer('pointerup', 1, 100, 100);
      });
      expect((mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }])[0].mapAnnotations[0].color).toBe('#ffd166');

      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="色 2"]')?.click());
      expect(host.querySelector('button[aria-label="色 2"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(host.querySelector('button[aria-label="色 1"]')?.getAttribute('aria-pressed')).toBe('false');
      await act(async () => {
        pointer('pointerdown', 2, 120, 120);
        pointer('pointerup', 2, 120, 120);
      });
      const second = mocks.setNotes.mock.calls[1] as [{ mapAnnotations: MapAnnotation[] }];
      expect(second[0].mapAnnotations.at(-1)?.color).toBe('#7fe0c4');
    } finally {
      root.removeProperty('--ink-1');
      root.removeProperty('--ink-2');
    }
  });

  it('a new pin takes the next number after the largest default name, renamed pins do not count', async () => {
    const annotations = [pin('ピン 1'), pin('ピン 3'), pin('my note')];
    setContext(makeMission({ annotations }));
    await render();
    await act(async () => buttonByText('ピン')?.click());
    await act(async () => {
      pointer('pointerdown', 1, 100, 100);
      pointer('pointerup', 1, 100, 100);
    });
    const [notes] = mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }];
    expect(notes.mapAnnotations.at(-1)).toMatchObject({ kind: 'pin', label: 'ピン 4' });
  });

  it('clears every annotation only after a confirmation, and one step of 元に戻す brings them all back', async () => {
    const existing = [pin('ピン 1'), pin('ピン 2')];
    setContext(makeMission({ annotations: existing }));
    await render();
    await act(async () => buttonByText('注釈をすべて消す')?.click());
    expect(mocks.setNotes).not.toHaveBeenCalled();
    expect(host.querySelector('.map-confirm')?.textContent).toContain('注釈 2 件をすべて消します');
    await act(async () => buttonByText('消す')?.click());
    expect(mocks.setNotes).toHaveBeenCalledTimes(1);
    expect((mocks.setNotes.mock.calls[0] as [{ mapAnnotations: MapAnnotation[] }])[0].mapAnnotations).toEqual([]);

    setContext(makeMission({ annotations: [] }));
    await render();
    expect(host.textContent).toContain('注釈 2 件をすべて消しました');
    await act(async () => buttonByText('元に戻す')?.click());
    const restored = (mocks.setNotes.mock.calls[1] as [{ mapAnnotations: MapAnnotation[] }])[0].mapAnnotations;
    expect(restored).toEqual(existing);
  });

  it('keeping the annotations after the confirmation changes nothing', async () => {
    setContext(makeMission({ annotations: [pin('ピン 1')] }));
    await render();
    await act(async () => buttonByText('注釈をすべて消す')?.click());
    await act(async () => buttonByText('やめる')?.click());
    expect(mocks.setNotes).not.toHaveBeenCalled();
    expect(host.querySelector('.map-confirm')).toBeNull();
  });

  it('the clear confirmation starts on やめる, its 消す is styled as dangerous, and Escape closes it back to the opening button', async () => {
    setContext(makeMission({ annotations: [pin('ピン 1')] }));
    await render();
    const clearButton = buttonByText('注釈をすべて消す');
    await act(async () => clearButton?.click());
    expect(buttonByText('消す')?.className).toContain('map-danger');
    expect(document.activeElement).toBe(buttonByText('やめる'));

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(host.querySelector('.map-confirm')).toBeNull();
    expect(mocks.setNotes).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(clearButton);
  });
});

describe('drawings and layers', () => {
  it('an ME polygon is drawn closed, as a polygon and not as an open line', async () => {
    const mission = makeMission();
    mission.coalitions.blue.drawings = [{
      layer: 'Common',
      visible: true,
      objects: [{
        primitiveType: 'Polygon',
        points: [[1000, 1000], [2000, 1000], [2000, 2000]],
        color: '#336699',
        thickness: 2,
        style: 0,
        name: 'area',
      }],
    }];
    setContext(mission);
    await render();
    expect(host.querySelector('[data-testid="polygon"]')).not.toBeNull();
    expect(host.querySelector('.map-drawing')).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="polyline"].map-drawing')).toHaveLength(0);
  });
});

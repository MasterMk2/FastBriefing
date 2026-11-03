// @vitest-environment jsdom
import { act, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '../../hooks/useSettings';
import { i18nReady } from '../../i18n';
import flightJa from '../../i18n/locales/ja/flight.json';
import { MissionProvider } from '../../shell/MissionContext';
import { WorkspaceProvider, routeAnchor, useWorkspace } from '../../shell/workspace';
import type { WorkspaceValue } from '../../shell/workspace';
import type { Coalition, Flight, MissionData, RoutePoint, Unit, UserNotes } from '../../types/mission';
import { calculateRouteLegs, formatLegDuration } from '../../utils/routeLegs';
import { emptyUserNotes, updateFlightNotes } from '../../utils/notes';
import { writeWingmanSlot } from '../../utils/wingmanSlot';
import FlightScreen from '../FlightScreen';
import FlightRow from './FlightRow';

// The real function, with a spy: the limit test makes it refuse one save.
vi.mock('../../utils/notes', async importOriginal => {
  const actual = await importOriginal<typeof import('../../utils/notes')>();
  return { ...actual, updateFlightNotes: vi.fn(actual.updateFlightNotes) };
});

type ViewMode = 'creator' | 'pilot';

function unit(overrides: Partial<Unit> & { unitId: number; skill: string }): Unit {
  return {
    name: 'F-15C',
    tailNumber: `10${overrides.unitId}`,
    livery: 'Default',
    payload: { pylons: [], fuel: 3000, chaff: 30, flare: 60, gun: 100, weight: 0 },
    radios: [],
    props: {},
    ...overrides,
  };
}

function point(overrides: Partial<RoutePoint> & { index: number }): RoutePoint {
  return {
    name: `WP${overrides.index}`,
    action: 'Turning Point',
    xy: [overrides.index * 1000, 0],
    latlon: [42 + overrides.index * 0.1, 41],
    latlonResolved: true,
    alt: 6000,
    altType: 'BARO',
    speed: 200,
    eta: overrides.index * 300,
    tasks: [],
    ...overrides,
  };
}

/** A blue flight with a lead and a wingman (one radio channel and the Link16 flight lead differ), plus a red flight. */
function makeFlights(): { blue: Flight[]; red: Flight[] } {
  const blue: Flight = {
    groupId: 1,
    name: 'Enfield 1-1',
    callsign: 'Enfield11',
    type: 'F-15C',
    task: 'CAP',
    frequency: 251_000_000,
    modulation: 0,
    hidden: false,
    units: [
      unit({
        unitId: 1,
        skill: 'Client',
        radios: [
          { channel: 1, frequency: 251, modulation: 0, name: 'Guard' },
          { channel: 2, frequency: 305.5, modulation: 1, name: 'Tac' },
        ],
        datalink: { link16: { flightLead: true, team: 1 } },
      }),
      unit({
        unitId: 2,
        skill: 'Client',
        radios: [
          { channel: 1, frequency: 251, modulation: 0, name: 'Guard' },
          { channel: 2, frequency: 306, modulation: 1, name: 'Tac' },
        ],
        datalink: { link16: { flightLead: false, team: 1 } },
      }),
    ],
    route: [
      point({ index: 1, name: 'Start', action: 'Takeoff', eta: 0, altType: 'BARO' }),
      point({
        index: 2,
        name: 'Ingress',
        altType: 'RADIO',
        leg: { distance: 15_000, trueBearing: 45, magneticBearing: undefined, time: 300, cumulativeDistance: 15_000, cumulativeTime: 300 },
      }),
      point({
        index: 3,
        name: 'Unknown point',
        latlon: [0, 0],
        latlonResolved: false,
        leg: { distance: 4000, trueBearing: 90, magneticBearing: 84, time: 60, cumulativeDistance: 19_000, cumulativeTime: 360 },
      }),
    ],
  };
  const red: Flight = {
    groupId: 2,
    name: 'Bandit 2-1',
    callsign: 'Bandit21',
    type: 'Su-27',
    task: 'CAP',
    frequency: 130_000_000,
    modulation: 0,
    hidden: false,
    units: [unit({ unitId: 3, skill: 'AI', name: 'Su-27' })],
    route: [point({ index: 1, name: 'Red start' })],
  };
  return { blue: [blue], red: [red] };
}

let missionCount = 0;

function makeMission(blue: Flight[], red: Flight[]): MissionData {
  const coalition = (flights: Flight[]): Coalition => ({
    bullseye: { xy: [0, 0], latlon: [0, 0], latlonResolved: false },
    navPoints: [],
    airbases: [],
    flights,
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  });
  // A fingerprint per mission: the unsaved drafts are kept per mission, so each test gets its own.
  const fingerprint = `test-fingerprint-${++missionCount}`;
  return {
    sourceFingerprint: fingerprint,
    meta: {
      sortie: 'Flight screen test',
      description: '',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 11, Day: 3 },
      startTime: 0,
      utcOffset: 9,
      meVersion: 0,
      images: [],
    },
    weather: {} as MissionData['weather'],
    coalitions: { blue: coalition(blue), red: coalition(red), neutral: coalition([]) },
    userNotes: emptyUserNotes(fingerprint),
    issues: [],
  };
}

/**
 * Sets the view mode and the selected flight once mounted, the way the shell and the rail do. An undefined
 * selectedKey is not applied at all, so the workspace's default selection (T7) is what the screen shows.
 */
function Setup({ viewMode, selectedKey, probe }: { viewMode: ViewMode; selectedKey: string | null | undefined; probe?: Probe }) {
  const { setViewMode } = useSettings();
  const workspace = useWorkspace();
  const { setFlightKey } = workspace;
  // Applied once on mount: the settings setter is not stable across renders, so an effect keyed on it would loop.
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    setViewMode(viewMode);
    if (selectedKey !== undefined) setFlightKey(selectedKey);
  }, [selectedKey, setFlightKey, setViewMode, viewMode]);
  useEffect(() => {
    if (probe) probe.current = workspace;
  });
  return null;
}

/** Test handle on the workspace state (the screen and the selected flight). */
type Probe = { current: WorkspaceValue | null };
/** Test handle that changes the notes from outside the screen, as another part of the app would. */
type Controls = { updateNotes: ((update: (notes: UserNotes) => UserNotes) => void) | null };

interface HarnessProps {
  initial: MissionData;
  viewMode: ViewMode;
  /** undefined leaves the selection to the workspace's default (T7). */
  selectedKey?: string | null;
  onNotesChange?: (notes: UserNotes) => void;
  storageFailed?: boolean;
  controls?: Controls;
  probe?: Probe;
  /** False unmounts the flight screen while the providers stay mounted, as a change of screen does. */
  showScreen?: boolean;
  /** Rendered inside the providers beside the screen (for example the rail row). */
  extra?: ReactNode;
}

/** Keeps the mission in state so a saved note is read back through the provider, as the app does. */
function Harness({ initial, viewMode, selectedKey, onNotesChange, storageFailed = false, controls, probe, showScreen = true, extra }: HarnessProps) {
  const [mission, setMission] = useState(initial);
  useEffect(() => {
    if (controls) {
      controls.updateNotes = update => setMission(current => ({ ...current, userNotes: update(current.userNotes) }));
    }
  });
  return (
    <SettingsProvider>
      <MissionProvider
        mission={mission}
        sourceFile={null}
        storageFailed={storageFailed}
        revisions={null}
        onNotesChange={notes => {
          onNotesChange?.(notes);
          setMission(current => ({ ...current, userNotes: notes }));
        }}
        onCloseRevisions={() => {}}
      >
        <WorkspaceProvider>
          <Setup viewMode={viewMode} selectedKey={selectedKey} probe={probe} />
          {showScreen && <FlightScreen />}
          {extra}
        </WorkspaceProvider>
      </MissionProvider>
    </SettingsProvider>
  );
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  await i18nReady;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function render(props: HarnessProps) {
  await act(async () => {
    root.render(<Harness {...props} />);
  });
  await settle();
}

async function settle() {
  // The map pane and the other lazily loaded parts resolve on a later macrotask.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent?.trim() === text);
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
}

/** Sets a controlled input or textarea value and fires the event React listens for. */
async function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function headerCount(): number {
  return container.querySelectorAll('.route-table thead th').length;
}

function routeRowCount(): number {
  return container.querySelectorAll('.route-table tbody tr').length;
}

/** The Joker and Bingo inputs (the first two fields of the notes grid). */
function fuelInputs(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('.flight-notes-grid input')).slice(0, 2);
}

const EMPTY_NOTE: UserNotes['perFlight'][string] = { jokerFuel: null, bingoFuel: null, tot: '', pilotName: '', customNotes: '' };

describe('flight screen: navigation log (F3)', () => {
  it('shows the eight default columns and one row per route point', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    expect(headerCount()).toBe(8);
    expect(routeRowCount()).toBe(3);
    expect(container.textContent).toContain(flightJa.route.col.bearing);
  });

  it('shows an unresolved point with the Unresolved mark and never a [0, 0] coordinate', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    const rows = container.querySelectorAll('.route-table tbody tr');
    const unresolvedRow = rows[2];
    expect(unresolvedRow.querySelector('.route-col-coord .unresolved')).not.toBeNull();
    expect(unresolvedRow.querySelector('.route-col-coord .unresolved-xy')?.textContent).toContain('3000');
    // A formatted position always carries a degree sign; the unresolved cell must not show one (no [0, 0] drawn).
    expect(unresolvedRow.querySelector('.route-col-coord')?.textContent).not.toContain('°');
  });

  it('writes "true only" when the theatre has no magnetic table (the first leg)', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    expect(container.textContent).toContain(flightJa.route.trueOnly.replace('{{bearing}}', '45'));
    expect(container.textContent).toContain('84°');
  });

  it('adds an optional column from the column menu', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    const checkbox = container.querySelector<HTMLInputElement>('.route-columns-option input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    await act(async () => {
      checkbox?.click();
    });
    expect(headerCount()).toBe(9);
  });

  it('offers the leg time as an optional column, hidden by default', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });
    expect(container.querySelector('.route-col-legTime')).toBeNull();

    const legTimeOption = Array.from(container.querySelectorAll<HTMLLabelElement>('.route-columns-option'))
      .find(label => label.textContent?.trim() === flightJa.route.col.legTime);
    await click(legTimeOption!.querySelector('input')!);

    expect(container.querySelector('.route-col-legTime')).not.toBeNull();
    // The leg that arrives at the second point takes 300 s in the fixture: the cell shows it as a duration.
    expect(container.querySelector('.route-table tbody tr:nth-child(2) .route-col-legTime')?.textContent).toBe(formatLegDuration(300));
  });

  it('selects a route point and saves its waypoint note through setNotes', async () => {
    const { blue, red } = makeFlights();
    const saved: UserNotes[] = [];
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      onNotesChange: notes => saved.push(notes),
    });

    const select = container.querySelectorAll<HTMLButtonElement>('.route-select')[1];
    await click(select);
    expect(select.getAttribute('aria-pressed')).toBe('true');

    const purpose = container.querySelector<HTMLInputElement>('.route-annotation .waypoint-editor input');
    expect(purpose).not.toBeNull();
    await typeInto(purpose!, 'IP');
    await click(buttonByText('保存'));

    expect(saved.at(-1)?.waypoints['blue:1:1']?.purpose).toBe('IP');
  });

  it('keeps the saved waypoint note and the selected point when the subview changes', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    await click(container.querySelectorAll<HTMLButtonElement>('.route-select')[1]);
    await typeInto(container.querySelector<HTMLInputElement>('.route-annotation .waypoint-editor input')!, 'IP');
    await click(buttonByText('保存'));

    await click(buttonByText(flightJa.subview.comms));
    await click(buttonByText(flightJa.subview.nav));

    expect(container.querySelector<HTMLButtonElement>('.route-select[aria-pressed="true"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('.route-annotation .waypoint-editor input')?.value).toBe('IP');
  });

  it('selects a route point when its row is clicked, and clears the selection on a second click', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });
    const nameCell = () => container.querySelector<HTMLTableCellElement>('.route-table tbody tr:nth-child(2) .route-col-name')!;

    await click(nameCell());
    expect(container.querySelector('.route-table tbody tr.is-selected')).not.toBeNull();
    expect(container.querySelector('.route-annotation .waypoint-editor')).not.toBeNull();

    await click(nameCell());
    expect(container.querySelector('.route-table tbody tr.is-selected')).toBeNull();
  });

  it('shows no waypoint note editor, and saves nothing, while the browser store has failed', async () => {
    const { blue, red } = makeFlights();
    const saved: UserNotes[] = [];
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      storageFailed: true,
      onNotesChange: notes => saved.push(notes),
    });

    await click(container.querySelectorAll<HTMLButtonElement>('.route-select')[1]);

    expect(container.querySelector('.route-annotation .waypoint-editor')).toBeNull();
    expect(container.querySelector('.route-annotation')?.textContent).toContain(flightJa.notes.storageFailedTitle);
    expect(saved).toHaveLength(0);
  });

  it('builds a route with no magnetic table from calculateRouteLegs and shows the true bearing only', async () => {
    const { blue, red } = makeFlights();
    const mission = makeMission(blue, red);
    // An unmapped theatre gives no magnetic variation, so the normalizer leaves magneticBearing undefined.
    const legs = calculateRouteLegs(blue[0].route, { ...mission.meta, theatre: 'UnmappedTheatre' });
    mission.coalitions.blue.flights = [{ ...blue[0], route: legs }];
    await render({ initial: mission, viewMode: 'creator', selectedKey: 'blue:1' });

    expect(container.textContent).toMatch(/真のみ \d+°/);
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('null');
  });
});

describe('flight screen: notes', () => {
  it('keeps an unsaved draft when the notes of another flight change', async () => {
    const { blue, red } = makeFlights();
    const controls: Controls = { updateNotes: null };
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1', controls });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '12');
    await act(async () => {
      controls.updateNotes?.(notes => ({ ...notes, perFlight: { ...notes.perFlight, 'red:2': { ...EMPTY_NOTE, jokerFuel: 500 } } }));
    });

    expect(fuelInputs()[0].value).toBe('12');
  });

  it('keeps an unsaved field and shows a field saved elsewhere for the same flight, and saves both (W1)', async () => {
    const { blue, red } = makeFlights();
    const controls: Controls = { updateNotes: null };
    const saved: UserNotes[] = [];
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      controls,
      onNotesChange: notes => saved.push(notes),
    });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '12');
    await act(async () => {
      controls.updateNotes?.(notes => ({
        ...notes,
        perFlight: { ...notes.perFlight, 'blue:1': { ...EMPTY_NOTE, customNotes: 'Saved elsewhere' } },
      }));
    });

    expect(fuelInputs()[0].value).toBe('12');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Saved elsewhere');
    await click(buttonByText(flightJa.notes.save));
    expect(saved.at(-1)?.perFlight['blue:1']).toMatchObject({ jokerFuel: 12, customNotes: 'Saved elsewhere' });
  });

  it('keeps an unsaved draft when the selection moves to another flight and back', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '12');

    const select = container.querySelector<HTMLSelectElement>('#flight-screen-select')!;
    await act(async () => {
      select.value = 'red:2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      select.value = 'blue:1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(buttonByText(flightJa.subview.notes));

    expect(fuelInputs()[0].value).toBe('12');
    expect(buttonByText(flightJa.notes.save).disabled).toBe(false);
  });

  it('blocks saving while the browser store has failed and does not report success', async () => {
    const { blue, red } = makeFlights();
    const saved: UserNotes[] = [];
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      storageFailed: true,
      onNotesChange: notes => saved.push(notes),
    });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '1200');

    expect(buttonByText(flightJa.notes.save).disabled).toBe(true);
    expect(container.textContent).toContain(flightJa.notes.storageFailedTitle);
    expect(saved).toHaveLength(0);
    expect(container.textContent).not.toContain(flightJa.notes.saved);
  });

  it('keeps an unsaved draft when the screen is left and shown again', async () => {
    const { blue, red } = makeFlights();
    const mission = makeMission(blue, red);
    await render({ initial: mission, viewMode: 'creator', selectedKey: 'blue:1' });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '12');

    await render({ initial: mission, viewMode: 'creator', selectedKey: 'blue:1', showScreen: false });
    expect(container.querySelector('.flight-screen')).toBeNull();

    await render({ initial: mission, viewMode: 'creator', selectedKey: 'blue:1' });
    await click(buttonByText(flightJa.subview.notes));

    expect(fuelInputs()[0].value).toBe('12');
    expect(buttonByText(flightJa.notes.save).disabled).toBe(false);
  });

  it('shows the limit reason and keeps the draft when a new note cannot be added', async () => {
    const { blue, red } = makeFlights();
    const saved: UserNotes[] = [];
    vi.mocked(updateFlightNotes).mockReturnValueOnce(null);
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      onNotesChange: notes => saved.push(notes),
    });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '12');
    await click(buttonByText(flightJa.notes.save));

    expect(container.textContent).toContain(flightJa.notes.limit);
    expect(saved).toHaveLength(0);
    expect(fuelInputs()[0].value).toBe('12');
  });

  it('refuses an incomplete fuel value with a reason and never saves it', async () => {
    const { blue, red } = makeFlights();
    const saved: UserNotes[] = [];
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      onNotesChange: notes => saved.push(notes),
    });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '-');

    expect(container.textContent).toContain(flightJa.notes.notNumber);
    expect(fuelInputs()[0].getAttribute('aria-invalid')).toBe('true');
    expect(buttonByText(flightJa.notes.save).disabled).toBe(true);
    expect(saved).toHaveLength(0);
  });

  it('points the export action at the selected flight', async () => {
    const { blue, red } = makeFlights();
    const probe: Probe = { current: null };
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1', probe });

    await click(buttonByText(flightJa.header.export));

    expect(probe.current?.screen).toBe('export');
    expect(probe.current?.flightKey).toBe('blue:1');
    // The export screen reads this anchor to take the selected flight as its target (the flight screen leaves it alone).
    expect(probe.current?.focusAnchor).toBe('export:flight');
  });

  it('never shows a hidden own flight in pilot view', async () => {
    const { blue, red } = makeFlights();
    const hidden = blue.map(flight => ({ ...flight, callsign: 'Ghost11', hidden: true }));
    await render({ initial: makeMission(hidden, red), viewMode: 'pilot', selectedKey: null });

    expect(container.textContent).not.toContain('Ghost11');
    // The hidden flights are gone from the view, so nothing can be chosen and no picker is drawn.
    expect(container.querySelector('#flight-screen-select')).toBeNull();
  });
});

describe('flight screen: other subviews', () => {
  it('marks the wingman radio and Link16 that differ from the lead, with a symbol and words', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    await click(buttonByText(flightJa.subview.comms));
    expect(container.querySelectorAll('.flight-comms tr.is-diff')).toHaveLength(1);
    expect(container.querySelectorAll('.flight-diff')).toHaveLength(2);
    expect(container.querySelector('.flight-diff')?.textContent).toContain(flightJa.comms.differs);
  });

  it('shows the lineup card for the lead and the roster of all aircraft on request', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    await click(buttonByText(flightJa.subview.lineup));
    expect(container.querySelector('.flight-lineup .lineup-card')).not.toBeNull();
    expect(container.querySelector('.flight-roster')).toBeNull();

    await click(buttonByText(flightJa.lineup.showRoster.replace('{{count}}', '2')));
    expect(container.querySelectorAll('.flight-roster tbody tr')).toHaveLength(2);
  });

  it('refuses a negative Joker value with a reason and never saves it', async () => {
    const { blue, red } = makeFlights();
    const saved: UserNotes[] = [];
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      onNotesChange: notes => saved.push(notes),
    });

    await click(buttonByText(flightJa.subview.notes));
    const joker = fuelInputs()[0];
    expect(joker).toBeDefined();
    await typeInto(joker, '-5');

    expect(container.textContent).toContain(flightJa.notes.negative);
    expect(buttonByText(flightJa.notes.save).disabled).toBe(true);
    expect(saved).toHaveLength(0);
  });

  it('saves a valid Joker value through updateFlightNotes and shows the saved state', async () => {
    const { blue, red } = makeFlights();
    const saved: UserNotes[] = [];
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: 'blue:1',
      onNotesChange: notes => saved.push(notes),
    });

    await click(buttonByText(flightJa.subview.notes));
    await typeInto(fuelInputs()[0], '1200');
    await click(buttonByText(flightJa.notes.save));

    expect(saved.at(-1)?.perFlight['blue:1']?.jokerFuel).toBe(1200);
    expect(container.textContent).toContain(flightJa.notes.saved);
  });
});

describe('flight screen: displayed side (D1)', () => {
  it('does not show an opposing flight in pilot view, even when its key is still selected', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'pilot', selectedKey: 'red:2' });

    // The opposing key is no longer in the view, so the selection is chosen again (the own side's first flight).
    expect(container.textContent).not.toContain('Bandit21');
    expect(container.textContent).not.toContain('Su-27');
    expect(container.querySelector('.route-table')).not.toBeNull();
    expect(container.textContent).toContain('Enfield11');
  });

  it('shows an opposing flight in creator view', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'red:2' });

    expect(container.textContent).toContain('Bandit21');
    expect(container.querySelector('.route-table')).not.toBeNull();
  });
});

describe('flight screen: states', () => {
  it('shows the no-flight state when the displayed side has no flights', async () => {
    const { red } = makeFlights();
    await render({ initial: makeMission([], red), viewMode: 'pilot', selectedKey: null });

    expect(container.textContent).toContain(flightJa.screen.noFlights);
  });

  it('tells the user when the displayed side has no client aircraft, and still shows the flight', async () => {
    const { blue, red } = makeFlights();
    const aiOnly = blue.map(flight => ({ ...flight, units: [unit({ unitId: 9, skill: 'AI' })] }));
    await render({ initial: makeMission(aiOnly, red), viewMode: 'pilot', selectedKey: 'blue:1' });

    expect(container.textContent).toContain(flightJa.screen.noClient);
    expect(container.querySelector('.route-table')).not.toBeNull();
  });

  it('shows the map pane beside the flight at 1600px and wider only', async () => {
    const { blue, red } = makeFlights();
    const matchMedia = vi.fn((query: string) => ({
      matches: query === '(min-width: 1600px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });
    expect(container.querySelector('.flight-map-pane')).not.toBeNull();
    expect(container.querySelector('.flight-screen-body.is-wide')).not.toBeNull();
  });

  it('keeps the map pane out of the screen below 1600px', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1' });

    expect(container.querySelector('.flight-map-pane')).toBeNull();
  });
});

describe('flight row (rail)', () => {
  it('shows the callsign, type and main frequency in MHz, and reports its pressed state', async () => {
    const { blue, red } = makeFlights();
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: null,
      showScreen: false,
      extra: <FlightRow flight={blue[0]} side="blue" selected onSelect={() => {}} />,
    });

    const row = container.querySelector<HTMLButtonElement>('.flight-row');
    expect(row?.getAttribute('aria-pressed')).toBe('true');
    expect(row?.textContent).toContain('Enfield11');
    expect(row?.textContent).toContain('251.000 MHz AM');
  });

  it('shows the side name beside the mark, not only the shape', async () => {
    const { blue, red } = makeFlights();
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: null,
      showScreen: false,
      extra: <FlightRow flight={blue[0]} side="blue" selected={false} onSelect={() => {}} />,
    });

    expect(container.querySelector('.flight-row .side-mark-label')?.textContent).toBe('青');
  });
});

describe('flight screen: default selection and the wingman card (T7)', () => {
  afterEach(() => {
    // The chosen aircraft is kept in memory by the wingman store: clear it so the next test starts without one.
    writeWingmanSlot(null);
  });

  it('opens on the saved wingman flight, with its card, without any click', async () => {
    const { blue, red } = makeFlights();
    const mission = makeMission(blue, red);
    // The card is found by the flight object of the view, so the saved choice must point at this mission.
    writeWingmanSlot({ missionKey: mission.userNotes.missionKey, flightKey: 'blue:1', unitId: 2 });
    await render({ initial: mission, viewMode: 'pilot' });

    expect(container.querySelector('.wingman-card')).not.toBeNull();
    expect(container.querySelector('.wingman-card')?.textContent).toContain('Enfield11');
    expect(container.querySelector('.route-table')).not.toBeNull();
  });

  it('opens on the first flight of the displayed side when no aircraft is chosen', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator' });

    expect(container.querySelector('.wingman-card')).toBeNull();
    expect(container.textContent).toContain('Enfield11');
  });

  it('keeps "none" chosen by the user, and says so with a hint instead of an empty state', async () => {
    const { blue, red } = makeFlights();
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: null });

    expect(container.querySelector('.route-table')).toBeNull();
    expect(container.textContent).toContain(flightJa.screen.pickFlightBody);
    expect(container.textContent).not.toContain(flightJa.screen.noFlights);
  });
});

describe('flight screen: anchors and jumps', () => {
  it('moves to a route point named by an anchor: selects it, shows the navigation log and clears the anchor', async () => {
    const { blue, red } = makeFlights();
    const probe: Probe = { current: null };
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1', probe });
    await click(buttonByText(flightJa.subview.comms));

    // The anchor carries the DCS point index (2 = "Ingress"), which is the second row of the table.
    await act(async () => {
      probe.current?.jumpTo('flights', { anchor: routeAnchor('blue:1', 2) });
    });
    await settle();

    expect(container.querySelector('.route-table')).not.toBeNull();
    const row = container.querySelector<HTMLTableRowElement>('.route-table tbody tr[data-route-index="1"]');
    expect(row?.classList.contains('is-selected')).toBe(true);
    expect(row?.getAttribute('data-anchor')).toBe('route:blue:1:2');
    expect(document.activeElement).toBe(row?.querySelector('.route-select'));
    expect(probe.current?.focusAnchor).toBeNull();
  });

  it('ignores a route anchor for another flight, and still clears it', async () => {
    const { blue, red } = makeFlights();
    const probe: Probe = { current: null };
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1', probe });

    await act(async () => {
      probe.current?.jumpTo('flights', { anchor: routeAnchor('red:2', 1) });
    });
    await settle();

    expect(container.querySelector('.route-table tbody tr.is-selected')).toBeNull();
    expect(probe.current?.focusAnchor).toBeNull();
  });

  it('does not take the focus back to the row when the subview is left and shown again', async () => {
    const { blue, red } = makeFlights();
    const probe: Probe = { current: null };
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1', probe });

    await act(async () => {
      probe.current?.jumpTo('flights', { anchor: routeAnchor('blue:1', 2) });
    });
    await settle();
    expect(document.activeElement).toBe(container.querySelector('.route-table tbody tr[data-route-index="1"] .route-select'));

    await click(buttonByText(flightJa.subview.comms));
    const navButton = buttonByText(flightJa.subview.nav);
    navButton.focus();
    await click(navButton);
    await settle();

    expect(document.activeElement).toBe(navButton);
    expect(container.querySelector('.route-table tbody tr[data-route-index="1"]')?.classList.contains('is-selected')).toBe(true);
  });
});

describe('flight screen: wingman clear result (F4)', () => {
  afterEach(() => {
    writeWingmanSlot(null);
  });

  it('removes the clear result when the selection moves to another flight', async () => {
    const { blue, red } = makeFlights();
    const second: Flight = { ...blue[0], groupId: 3, name: 'Enfield 1-2', callsign: 'Enfield12' };
    const mission = makeMission([blue[0], second], red);
    writeWingmanSlot({ missionKey: mission.userNotes.missionKey, flightKey: 'blue:1', unitId: 2 });
    const probe: Probe = { current: null };
    await render({ initial: mission, viewMode: 'creator', selectedKey: 'blue:1', probe });

    await click(container.querySelector<HTMLButtonElement>('.wingman-clear')!);
    expect(container.querySelector('.wingman-save-notice')).not.toBeNull();

    await act(async () => {
      probe.current?.setFlightKey('blue:3');
    });
    await settle();

    expect(container.textContent).toContain('Enfield12');
    expect(container.querySelector('.wingman-save-notice')).toBeNull();
  });
});

describe('flight screen: row menu "この機だけ地図に" (T12)', () => {
  it('from the flight header: limits the map to this flight and shows the map', async () => {
    const { blue, red } = makeFlights();
    const probe: Probe = { current: null };
    await render({ initial: makeMission(blue, red), viewMode: 'creator', selectedKey: 'blue:1', probe });

    await click(buttonByText(flightJa.header.mapMenu));
    expect(buttonByText(flightJa.header.mapMenu).getAttribute('aria-expanded')).toBe('true');
    await click(buttonByText(flightJa.row.soloMap));

    expect(probe.current?.screen).toBe('map');
    expect(probe.current?.mapUi.soloFlightKey).toBe('blue:1');
    expect(probe.current?.flightKey).toBe('blue:1');
  });

  it('from the rail row: opens with the disclosure, closes with Escape and returns the focus', async () => {
    const { blue, red } = makeFlights();
    const probe: Probe = { current: null };
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: null,
      showScreen: false,
      probe,
      extra: <FlightRow flight={blue[0]} side="blue" selected={false} onSelect={() => {}} />,
    });
    const toggle = () => container.querySelector<HTMLButtonElement>('.flight-row-menu-toggle')!;

    await click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.solo-map-action')).not.toBeNull();

    await act(async () => {
      container.querySelector('.solo-map-menu')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
    expect(probe.current?.screen).toBe('overview');

    await click(toggle());
    await click(container.querySelector<HTMLButtonElement>('.solo-map-action')!);
    expect(probe.current?.screen).toBe('map');
    expect(probe.current?.mapUi.soloFlightKey).toBe('blue:1');
  });
});

describe('flight screen: row menu closes outside (T12)', () => {
  async function renderRailRow(probe: Probe) {
    const { blue, red } = makeFlights();
    await render({
      initial: makeMission(blue, red),
      viewMode: 'creator',
      selectedKey: null,
      showScreen: false,
      probe,
      extra: <FlightRow flight={blue[0]} side="blue" selected={false} onSelect={() => {}} />,
    });
  }
  const toggle = () => container.querySelector<HTMLButtonElement>('.flight-row-menu-toggle')!;

  it('gives the row menu button an accessible name that contains its visible text (label in name)', async () => {
    await renderRailRow({ current: null });

    const visibleText = toggle().textContent?.trim() ?? '';
    const accessibleName = toggle().getAttribute('aria-label') ?? toggle().textContent ?? '';
    expect(visibleText).not.toBe('');
    expect(accessibleName).toContain(visibleText);
  });

  it('closes when the pointer goes down outside the menu, and does not change the screen', async () => {
    const probe: Probe = { current: null };
    await renderRailRow(probe);
    await click(toggle());
    expect(container.querySelector('.solo-map-action')).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });

    expect(container.querySelector('.solo-map-action')).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(probe.current?.screen).toBe('overview');
  });

  it('closes when the focus moves to a control outside the menu', async () => {
    const probe: Probe = { current: null };
    await renderRailRow(probe);
    await click(toggle());
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      await act(async () => {
        outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      });

      expect(container.querySelector('.solo-map-action')).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    } finally {
      outside.remove();
    }
  });

  it('stays open for a press on its own action, so the action still runs', async () => {
    const probe: Probe = { current: null };
    await renderRailRow(probe);
    await click(toggle());
    const action = container.querySelector<HTMLButtonElement>('.solo-map-action')!;

    await act(async () => {
      action.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(container.querySelector('.solo-map-action')).toBe(action);

    await click(action);
    expect(probe.current?.screen).toBe('map');
    expect(probe.current?.mapUi.soloFlightKey).toBe('blue:1');
  });
});

describe('flight screen: one thing at a time (empty states)', () => {
  it('does not show the no-flight state next to an opposing flight that was chosen', async () => {
    const { red } = makeFlights();
    await render({ initial: makeMission([], red), viewMode: 'creator', selectedKey: 'red:2' });

    expect(container.querySelector('.route-table')).not.toBeNull();
    expect(container.textContent).toContain('Bandit21');
    expect(container.textContent).not.toContain(flightJa.screen.noFlights);
  });
});

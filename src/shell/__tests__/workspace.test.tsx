// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsProvider, useSettings } from '../../hooks/useSettings';
import { i18nReady } from '../../i18n';
import type { Coalition, Flight, MissionData, RoutePoint, Unit } from '../../types/mission';
import { emptyUserNotes } from '../../utils/notes';
import { writeWingmanSlot } from '../../utils/wingmanSlot';
import { MissionProvider } from '../MissionContext';
import {
  DEFAULT_MAP_UI,
  EXPORT_FLIGHT_ANCHOR,
  parseFocusAnchor,
  routeAnchor,
  supportAnchor,
  threatsAnchor,
  WorkspaceProvider,
  useWorkspace,
} from '../workspace';
import type { WorkspaceValue } from '../workspace';

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

function flight(groupId: number, skill: string): Flight {
  return {
    groupId,
    name: `Flight ${groupId}`,
    callsign: `Call${groupId}`,
    type: 'F-15C',
    task: 'CAP',
    frequency: 251_000_000,
    modulation: 0,
    hidden: false,
    units: [unit({ unitId: groupId * 10, skill })],
    route: [point({ index: 1 })],
  };
}

let missionCount = 0;

/** Two blue flights (one Client), one red flight, one neutral flight. Each call gets its own fingerprint. */
function makeMission(): MissionData {
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
  const fingerprint = `workspace-test-${++missionCount}`;
  return {
    sourceFingerprint: fingerprint,
    meta: {
      sortie: 'Workspace test',
      description: '',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 11, Day: 4 },
      startTime: 0,
      utcOffset: 9,
      meVersion: 0,
      images: [],
    },
    weather: {} as MissionData['weather'],
    coalitions: {
      blue: coalition([flight(1, 'Client'), flight(2, 'AI')]),
      red: coalition([flight(3, 'AI')]),
      neutral: coalition([flight(9, 'AI')]),
    },
    userNotes: emptyUserNotes(fingerprint),
    issues: [],
  };
}

interface Handle {
  workspace: WorkspaceValue;
  settings: ReturnType<typeof useSettings>;
}

function Probe({ handle }: { handle: { current: Handle | null } }) {
  const workspace = useWorkspace();
  const settings = useSettings();
  handle.current = { workspace, settings };
  return null;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  localStorage.clear();
  await i18nReady;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  writeWingmanSlot(null);
  localStorage.clear();
});

async function mount(mission: MissionData): Promise<{ handle: { current: Handle | null } }> {
  const handle: { current: Handle | null } = { current: null };
  await act(async () => {
    root.render(
      <SettingsProvider>
        <MissionProvider
          mission={mission}
          sourceFile={null}
          storageFailed={false}
          revisions={null}
          onNotesChange={() => {}}
          onCloseRevisions={() => {}}
        >
          <WorkspaceProvider>
            <Probe handle={handle} />
          </WorkspaceProvider>
        </MissionProvider>
      </SettingsProvider>,
    );
  });
  return { handle };
}

/** Runs one change of the shell state inside act and returns the workspace after it. */
async function update(handle: { current: Handle | null }, change: (current: Handle) => void): Promise<WorkspaceValue> {
  await act(async () => {
    change(handle.current!);
  });
  return handle.current!.workspace;
}

describe('workspace flight selection (T7)', () => {
  it('opens on the first flight of the displayed side, with no action', async () => {
    const { handle } = await mount(makeMission());
    await update(handle, current => current.settings.setViewMode('creator'));
    await update(handle, current => current.settings.setSide('blue'));

    expect(handle.current!.workspace.flightKey).toBe('blue:1');
  });

  it('selects the wingman flight saved for this mission', async () => {
    const mission = makeMission();
    writeWingmanSlot({ missionKey: mission.userNotes.missionKey, flightKey: 'blue:2', unitId: 20 });
    const { handle } = await mount(mission);
    await update(handle, current => current.settings.setSide('blue'));

    expect(handle.current!.workspace.flightKey).toBe('blue:2');
  });

  it('ignores a wingman flight saved for another mission', async () => {
    writeWingmanSlot({ missionKey: 'another-mission', flightKey: 'blue:2', unitId: 20 });
    const { handle } = await mount(makeMission());
    await update(handle, current => current.settings.setSide('blue'));

    expect(handle.current!.workspace.flightKey).toBe('blue:1');
  });

  it('moves to the own side first flight when the selected flight leaves the view', async () => {
    const { handle } = await mount(makeMission());
    await update(handle, current => current.settings.setViewMode('creator'));
    await update(handle, current => current.settings.setSide('blue'));
    const selected = await update(handle, current => current.workspace.setFlightKey('red:3'));
    expect(selected.flightKey).toBe('red:3');

    // Pilot view keeps only the displayed side, so the red flight is no longer in the view.
    const after = await update(handle, current => current.settings.setViewMode('pilot'));
    expect(after.flightKey).toBe('blue:1');
  });

  it('keeps "none" chosen by the user across a side change', async () => {
    const { handle } = await mount(makeMission());
    await update(handle, current => current.settings.setViewMode('creator'));
    await update(handle, current => current.settings.setSide('blue'));
    await update(handle, current => current.workspace.setFlightKey(null));

    const after = await update(handle, current => current.settings.setSide('red'));
    expect(after.flightKey).toBeNull();
  });

  it('keeps a neutral flight key when the neutral flight is in the view', async () => {
    const { handle } = await mount(makeMission());
    await update(handle, current => current.settings.setViewMode('creator'));
    const after = await update(handle, current => current.workspace.setFlightKey('neutral:9'));

    expect(after.flightKey).toBe('neutral:9');
  });
});

describe('workspace navigation', () => {
  it('jumpTo moves the screen, selects the flight and sets the anchor; a plain setScreen clears the anchor', async () => {
    const { handle } = await mount(makeMission());
    await update(handle, current => current.settings.setViewMode('creator'));
    const anchor = routeAnchor('blue:2', 2);

    const jumped = await update(handle, current => current.workspace.jumpTo('flights', { flightKey: 'blue:2', anchor }));
    expect(jumped.screen).toBe('flights');
    expect(jumped.flightKey).toBe('blue:2');
    expect(jumped.focusAnchor).toBe('route:blue:2:2');

    const cleared = await update(handle, current => current.workspace.clearFocusAnchor());
    expect(cleared.focusAnchor).toBeNull();

    await update(handle, current => current.workspace.jumpTo('map', { anchor: supportAnchor('blue', 0) }));
    const navigated = await update(handle, current => current.workspace.setScreen('comms'));
    expect(navigated.screen).toBe('comms');
    expect(navigated.focusAnchor).toBeNull();
  });

  it('keeps the screen left as the previous screen, and not when the screen does not change', async () => {
    const { handle } = await mount(makeMission());
    expect(handle.current!.workspace.previousScreen).toBeNull();

    await update(handle, current => current.workspace.setScreen('flights'));
    expect(handle.current!.workspace.previousScreen).toBe('overview');

    await update(handle, current => current.workspace.setScreen('flights'));
    expect(handle.current!.workspace.previousScreen).toBe('overview');

    await update(handle, current => current.workspace.setScreen('briefing'));
    expect(handle.current!.workspace.previousScreen).toBe('flights');
  });

  it('clears the solo flight when that flight leaves the view and keeps it while it is in the view', async () => {
    const { handle } = await mount(makeMission());
    await update(handle, current => current.settings.setViewMode('creator'));
    await update(handle, current => current.settings.setSide('blue'));
    await update(handle, current => current.workspace.setMapUi(previous => ({ ...previous, soloFlightKey: 'red:3' })));
    await update(handle, current => current.workspace.setMapUi(previous => ({ ...previous, soloFlightKey: 'blue:2' })));
    expect(handle.current!.workspace.mapUi.soloFlightKey).toBe('blue:2');

    await update(handle, current => current.workspace.setMapUi(previous => ({ ...previous, soloFlightKey: 'red:3' })));
    const after = await update(handle, current => current.settings.setViewMode('pilot'));
    expect(after.mapUi.soloFlightKey).toBeNull();
  });

  it('starts with no solo flight', async () => {
    const { handle } = await mount(makeMission());
    expect(handle.current!.workspace.mapUi).toEqual(DEFAULT_MAP_UI);
    expect(DEFAULT_MAP_UI.soloFlightKey).toBeNull();
  });
});

describe('focus anchor formats', () => {
  it('reads the route, support, threats, conflict and export anchors back into their parts', () => {
    expect(parseFocusAnchor(routeAnchor('blue:12', 3))).toEqual({ kind: 'route', flightKey: 'blue:12', index: 3 });
    expect(parseFocusAnchor(routeAnchor('neutral:9', 1))).toEqual({ kind: 'route', flightKey: 'neutral:9', index: 1 });
    expect(parseFocusAnchor(supportAnchor('red', 4))).toEqual({ kind: 'support', side: 'red', index: 4 });
    expect(parseFocusAnchor(threatsAnchor('blue', 0))).toEqual({ kind: 'threats', side: 'blue', index: 0 });
    expect(parseFocusAnchor('comms:conflict:AM:251.000')).toEqual({
      kind: 'comms-conflict',
      modulation: 'AM',
      frequencyMHz: '251.000',
    });
    expect(parseFocusAnchor(EXPORT_FLIGHT_ANCHOR)).toEqual({ kind: 'export-flight' });
  });

  it('returns null for anything else', () => {
    expect(parseFocusAnchor('')).toBeNull();
    expect(parseFocusAnchor('route:blue:x:1')).toBeNull();
    expect(parseFocusAnchor('support:green:1')).toBeNull();
    expect(parseFocusAnchor('comms:conflict:AM:251')).toBeNull();
    expect(parseFocusAnchor('export:other')).toBeNull();
  });
});

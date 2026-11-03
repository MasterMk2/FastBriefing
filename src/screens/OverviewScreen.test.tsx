// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lintMission } from '../analysis/lint';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SETTINGS_VERSION, SettingsProvider } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import { MissionProvider } from '../shell/MissionContext';
import { useWorkspace, WorkspaceProvider } from '../shell/workspace';
import type { DisplaySettings, Flight, MissionData, RoutePoint } from '../types/mission';
import type { LintFinding } from '../types/lint';
import OverviewScreen from './OverviewScreen';

// The readiness flag belongs to lint.ts (P5); the test switches it through this state.
const lintState = vi.hoisted(() => ({ ready: false }));
vi.mock('../analysis/lint', () => ({
  lintMission: vi.fn(() => []),
  get LINT_RULES_READY() {
    return lintState.ready;
  },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function point(index: number, eta: number, xy: [number, number]): RoutePoint {
  return {
    index,
    name: `WP${index}`,
    action: 'Turning Point',
    xy,
    latlon: [42 + index * 0.01, 42 + index * 0.01],
    latlonResolved: true,
    alt: 6000,
    altType: 'BARO',
    speed: 200,
    eta,
    tasks: [],
  };
}

function flight(groupId: number, callsign: string, route: RoutePoint[]): Flight {
  return {
    groupId,
    name: callsign,
    callsign,
    type: 'FA-18C_hornet',
    task: 'CAP',
    frequency: 251,
    modulation: 0,
    hidden: false,
    units: [],
    route,
  };
}

function makeMission(options: { blueFlights?: Flight[]; redFlights?: Flight[]; blueBullseyeResolved?: boolean } = {}): MissionData {
  const coalition = (flights: Flight[], resolved = true) => ({
    bullseye: { xy: [1000, 2000] as [number, number], latlon: [42, 42] as [number, number], latlonResolved: resolved },
    navPoints: [],
    airbases: [],
    flights,
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  });
  return {
    sourceFingerprint: 'overview-screen-fixture',
    meta: {
      sortie: 'Overview screen test',
      description: '',
      descriptionBlueTask: 'Blue task text',
      descriptionRedTask: 'Red task text',
      descriptionNeutralTask: 'Neutral task text',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 1, Day: 1 },
      startTime: 0,
      utcOffset: 0,
      meVersion: 1,
      images: [],
    },
    weather: {
      temperature: 15,
      qnh: { mmHg: 760, hPa: 1013, inHg: 29.92 },
      wind: [{ level: 'ground', from: 90, to: 270, speed: 4 }],
      clouds: { preset: 'clear', label: 'Clear', base: 0 },
      visibility: 10000,
      fog: { thickness: 0, visibility: 0, enabled: false },
      dust: { density: 0, enabled: false },
      turbulence: { ground: 0 },
    },
    coalitions: {
      blue: coalition(options.blueFlights ?? [], options.blueBullseyeResolved ?? true),
      red: coalition(options.redFlights ?? []),
      neutral: coalition([]),
    },
    userNotes: {
      missionKey: 'overview-screen-fixture',
      smeac: { situation: '', mission: '', execution: '', adminLogistics: '', commandSignal: '' },
      perFlight: {},
      waypoints: {},
      mapAnnotations: [],
    },
    issues: [],
  } as unknown as MissionData;
}

function Probe() {
  const { screen, flightKey } = useWorkspace();
  return <output data-testid="workspace" data-screen={screen} data-flight={flightKey ?? ''} />;
}

function workspaceState(): { screen: string; flight: string } {
  const probe = container.querySelector('[data-testid="workspace"]');
  return { screen: probe?.getAttribute('data-screen') ?? '', flight: probe?.getAttribute('data-flight') ?? '' };
}

async function renderOverview(mission: MissionData, settings: Partial<DisplaySettings> = {}) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
    ...DEFAULT_SETTINGS,
    settingsVersion: SETTINGS_VERSION,
    viewMode: 'creator',
    side: 'blue',
    ...settings,
  }));
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
            <Probe />
            <OverviewScreen />
          </WorkspaceProvider>
        </MissionProvider>
      </SettingsProvider>,
    );
  });
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

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  vi.mocked(lintMission).mockReturnValue([]);
  lintState.ready = false;
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

describe('OverviewScreen task text (D1)', () => {
  it('shows only the own side task text in pilot view', async () => {
    await renderOverview(makeMission(), { viewMode: 'pilot', side: 'blue' });

    expect(container.textContent).toContain('Blue task text');
    expect(container.textContent).not.toContain('Red task text');
  });

  it('shows only the own side task text in creator view too (SPEC 1.3)', async () => {
    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });

    expect(container.textContent).toContain('Blue task text');
    expect(container.textContent).not.toContain('Red task text');
  });

  it('falls back to the neutral task text when the own side has none', async () => {
    const mission = makeMission();
    mission.meta.descriptionBlueTask = '';

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });

    expect(container.textContent).toContain('Neutral task text');
    expect(container.textContent).not.toContain('Red task text');
  });
});

describe('OverviewScreen issues (D1)', () => {
  it('does not show the opposing side issue text in pilot view', async () => {
    const mission = makeMission();
    mission.issues = [
      { code: 'unit.unknownType', severity: 'info', params: { type: 'SECRET-RED-SAM' }, side: 'red' },
      { code: 'unit.unknownType', severity: 'info', params: { type: 'OWN-UNKNOWN' }, side: 'blue' },
    ];

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });

    expect(container.textContent).toContain('OWN-UNKNOWN');
    expect(container.textContent).not.toContain('SECRET-RED-SAM');
  });

  it('hides the own side threat range notice in pilot view, and shows it in creator view', async () => {
    const mission = makeMission();
    mission.issues = [
      { code: 'threat.rangeUnrecorded', severity: 'info', params: { type: 'OWN-SAM-HIDDEN' }, side: 'blue' },
    ];

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });
    expect(container.textContent).not.toContain('OWN-SAM-HIDDEN');

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderOverview(mission, { viewMode: 'creator', side: 'blue' });
    expect(container.textContent).toContain('OWN-SAM-HIDDEN');
  });
});

describe('OverviewScreen bullseye and counts', () => {
  it('shows an unresolved own bullseye as unresolved, never as a coordinate', async () => {
    await renderOverview(makeMission({ blueBullseyeResolved: false }), { viewMode: 'pilot', side: 'blue' });

    const bullseye = container.querySelector('.overview-bullseye');
    expect(bullseye?.textContent).toContain('未解決');
  });

  it('shows the flight count of the displayed side only in pilot view', async () => {
    const mission = makeMission({
      blueFlights: [flight(1, 'Viper 1', [point(1, 600, [0, 0])])],
      redFlights: [flight(2, 'Bandit 1', [point(1, 600, [0, 0])])],
    });

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });

    expect(container.querySelector('.overview-counts')?.textContent).toContain('1 件');
    expect(container.querySelectorAll('.overview-count')).toHaveLength(1);
  });
});

describe('OverviewScreen pre-distribution check (F5 list)', () => {
  it('says the check has not run instead of a false all-clear while the rules are not ready', async () => {
    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });

    expect(container.textContent).toContain('配布前チェックはまだ実装されていないため');
    expect(container.textContent).not.toContain('問題はありません');
  });

  it('says there are no problems only when the rules are ready and find nothing', async () => {
    lintState.ready = true;

    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });

    expect(container.textContent).toContain('問題はありません');
    expect(container.textContent).not.toContain('まだ実装');
  });

  it('shows a finding instead of the all-clear when the rules are ready and find something', async () => {
    lintState.ready = true;
    const finding: LintFinding = { id: 'L9-4', code: 'L9', severity: 'warning', side: 'blue', screen: 'comms', params: {} };
    vi.mocked(lintMission).mockReturnValue([finding]);

    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });

    expect(container.querySelector('.overview-lint-text')?.textContent).toBe('L9');
    expect(container.textContent).not.toContain('問題はありません');
  });

  it('hides the threat checks from the pilot list, and keeps them in creator view', async () => {
    lintState.ready = true;
    const finding: LintFinding = { id: 'L8-2', code: 'L8', severity: 'info', side: 'neutral', screen: 'threats', params: {} };
    vi.mocked(lintMission).mockReturnValue([finding]);

    await renderOverview(makeMission(), { viewMode: 'pilot', side: 'blue' });
    expect(container.querySelector('.overview-lint-list')).toBeNull();
    expect(container.textContent).not.toContain('L8');
    expect(container.textContent).toContain('問題はありません');

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });
    expect(container.querySelector('.overview-lint-text')?.textContent).toBe('L8');
  });

  it('hides the L8 threat-range check in pilot view even when it is routed to another screen', async () => {
    lintState.ready = true;
    const finding: LintFinding = { id: 'L8-3', code: 'L8', severity: 'info', side: 'blue', screen: 'overview', params: {} };
    vi.mocked(lintMission).mockReturnValue([finding]);

    await renderOverview(makeMission(), { viewMode: 'pilot', side: 'blue' });

    expect(container.querySelector('.overview-lint-list')).toBeNull();
    expect(container.textContent).toContain('問題はありません');
  });

  it('shows the rule code when a finding has no message yet, not a raw i18n key', async () => {
    const finding: LintFinding = { id: 'L9-2', code: 'L9', severity: 'warning', side: 'blue', screen: 'comms', params: {} };
    vi.mocked(lintMission).mockReturnValue([finding]);

    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });

    expect(container.querySelector('.overview-lint-text')?.textContent).toBe('L9');
    expect(container.textContent).not.toContain('lint:L9');
  });

  it('gives each jump button its place in the accessible name', async () => {
    const finding: LintFinding = { id: 'L9-3', code: 'L9', severity: 'warning', side: 'blue', screen: 'comms', params: {} };
    vi.mocked(lintMission).mockReturnValue([finding]);

    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });

    expect(buttonByText('この箇所へ').getAttribute('aria-label')).toBe('この箇所へ（L9）');
  });

  it('moves to the place of a finding with its screen and flight key', async () => {
    const finding: LintFinding = {
      id: 'L9-1',
      code: 'L9',
      severity: 'warning',
      side: 'blue',
      screen: 'comms',
      flightKey: 'blue:1',
      params: {},
    };
    vi.mocked(lintMission).mockReturnValue([finding]);

    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });
    await click(buttonByText('この箇所へ'));

    expect(workspaceState()).toEqual({ screen: 'comms', flight: 'blue:1' });
  });

  it('does not offer a jump to the threat screen in pilot view', async () => {
    const finding: LintFinding = {
      id: 'L8-1',
      code: 'L8',
      severity: 'info',
      side: 'neutral',
      screen: 'threats',
      params: {},
    };
    vi.mocked(lintMission).mockReturnValue([finding]);

    await renderOverview(makeMission(), { viewMode: 'pilot', side: 'blue' });

    expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent === 'この箇所へ')).toBe(false);
  });
});

describe('OverviewScreen actions and TOT (F7)', () => {
  it('moves to the briefing from the next-action button', async () => {
    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });
    await click(buttonByText('ブリーフィングを開始'));

    expect(workspaceState().screen).toBe('briefing');
  });

  it('lists the time over target rows and expands past the first ten rows', async () => {
    const route = Array.from({ length: 12 }, (_, index) => point(index + 1, (index + 1) * 120, [0, index * 5000]));
    const mission = makeMission({ blueFlights: [flight(1, 'Viper 1', route)] });

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });

    const rowCount = () => container.querySelectorAll('.overview-tot tbody tr').length;
    expect(rowCount()).toBe(10);
    await click(buttonByText('すべて見る（12 行）'));
    expect(rowCount()).toBe(12);
  });

  it('reports the points at time 0 that are left out of the TOT list', async () => {
    const route = [point(0, 0, [0, 0]), point(1, 600, [0, 5000])];
    const mission = makeMission({ blueFlights: [flight(1, 'Viper 1', route)] });

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });

    expect(container.textContent).toContain('時刻が 0 の点 1 件は一覧から外しています');
  });
});

describe('OverviewScreen weather', () => {
  it('reports a failed METAR copy in words, with the METAR still on screen', async () => {
    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });
    await click(buttonByText('METAR をコピーする'));

    expect(container.textContent).toContain('コピーできません');
    expect(container.querySelector('.overview-metar code')?.textContent).toBeTruthy();
  });

  it('shows fog when it is set, and the ground turbulence as none when it is zero', async () => {
    const mission = makeMission();
    mission.weather.fog = { thickness: 300, visibility: 800, enabled: true };
    mission.weather.turbulence = { ground: 0 };

    await renderOverview(mission, { viewMode: 'creator', side: 'blue' });

    const weatherDetails = container.querySelector('#overview-weather-title')?.parentElement?.textContent ?? '';
    expect(weatherDetails).toContain('霧');
    expect(weatherDetails).toContain('地上乱気流');
    expect(weatherDetails).not.toContain('砂塵');
  });

  it('shows the Mission Editor version in the header', async () => {
    await renderOverview(makeMission(), { viewMode: 'creator', side: 'blue' });

    expect(container.querySelector('.overview-meta')?.textContent).toContain('ME の版: 1');
  });

  it('shows a not-set row instead of an empty wind table when there are no wind layers', async () => {
    const mission = makeMission();
    mission.weather.wind = [];

    await renderOverview(mission, { viewMode: 'creator', side: 'blue' });

    expect(container.querySelector('.overview-table tbody')?.textContent).toContain('未設定');
  });
});

describe('OverviewScreen load notices (warnings from the file)', () => {
  it('lists a warning from the file with its severity mark and text', async () => {
    const mission = makeMission();
    mission.issues = [{ code: 'time.utcOffsetUnknown', severity: 'warning', params: { theatre: 'Nowhere' } }];

    await renderOverview(mission, { viewMode: 'creator', side: 'blue' });

    const notices = container.querySelector('.overview-load-list');
    expect(notices?.textContent).toContain('注意');
    expect(notices?.textContent).toContain('UTC オフセット未収録: Nowhere');
  });

  it('lists a defaulted weather value once, in the defaults section only', async () => {
    const mission = makeMission();
    mission.issues = [{ code: 'weather.qnhDefaulted', severity: 'warning' }];

    await renderOverview(mission, { viewMode: 'creator', side: 'blue' });

    const text = 'QNH が既定値で補われました';
    expect(container.textContent?.split(text).length).toBe(2);
    expect(container.querySelector('.overview-load-list')).toBeNull();
  });

  it('lists an info item in the defaults section and not among the load notices', async () => {
    const mission = makeMission();
    mission.issues = [{ code: 'unit.unknownType', severity: 'info', params: { type: 'UNKNOWN-TYPE-X' } }];

    await renderOverview(mission, { viewMode: 'creator', side: 'blue' });

    const defaults = container.querySelector('#overview-defaults-title')?.parentElement;
    expect(defaults?.textContent).toContain('UNKNOWN-TYPE-X');
    expect(container.querySelector('.overview-load-list')).toBeNull();
  });

  it('does not list a warning of the opposing side in pilot view', async () => {
    const mission = makeMission();
    mission.issues = [{ code: 'parse.unknownNode', severity: 'warning', params: { type: 'SECRET-RED-NODE' }, side: 'red' }];

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });
    expect(container.textContent).not.toContain('SECRET-RED-NODE');
  });

  it('lists the opposing side warning in creator view, with its side mark', async () => {
    const mission = makeMission();
    mission.issues = [{ code: 'parse.unknownNode', severity: 'warning', params: { type: 'RED-NODE' }, side: 'red' }];

    await renderOverview(mission, { viewMode: 'creator', side: 'blue' });

    expect(container.querySelector('.overview-load-list')?.textContent).toContain('RED-NODE');
  });
});

describe('OverviewScreen TOT date mark (F7)', () => {
  it('marks a point whose clock falls on the next day', async () => {
    // 25 hours after a midnight start: the local clock is on the next day.
    const mission = makeMission({ blueFlights: [flight(1, 'Viper 1', [point(1, 90000, [0, 5000])])] });

    await renderOverview(mission, { viewMode: 'pilot', side: 'blue' });

    expect(container.querySelector('.overview-day-shift')?.textContent).toContain('+1 日');
  });
});

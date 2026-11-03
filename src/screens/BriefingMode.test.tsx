// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SETTINGS_VERSION, SettingsProvider } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import { MissionProvider } from '../shell/MissionContext';
import { useWorkspace, WorkspaceProvider } from '../shell/workspace';
import type { DisplaySettings, Flight, MissionData, RoutePoint } from '../types/mission';
import BriefingMode from './BriefingMode';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function point(index: number, eta: number): RoutePoint {
  return {
    index,
    name: `WP${index}`,
    action: 'Turning Point',
    xy: [0, index * 5000],
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

function makeMission(): MissionData {
  const coalition = (flights: Flight[]) => ({
    bullseye: { xy: [0, 0] as [number, number], latlon: [42, 42] as [number, number], latlonResolved: true },
    navPoints: [],
    airbases: [],
    flights,
    support: [],
    aiGroups: [
      {
        category: 'SAM',
        type: 'SA-10',
        count: 1,
        position: [0, 0] as [number, number],
        threatRange: 40000,
        threatRangeSource: 'reference' as const,
        hidden: false,
        lateActivation: false,
        startTime: 0,
      },
    ],
    zones: [],
    drawings: [],
  });
  return {
    sourceFingerprint: 'briefing-mode-fixture',
    meta: {
      sortie: 'Briefing test',
      description: '',
      descriptionBlueTask: 'Blue task text',
      descriptionRedTask: 'Red task text',
      descriptionNeutralTask: '',
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
      blue: coalition([flight(1, 'Viper 1', [point(0, 0), point(1, 600), point(2, 1200)])]),
      red: coalition([]),
      neutral: coalition([]),
    },
    userNotes: {
      missionKey: 'briefing-mode-fixture',
      smeac: { situation: 'Clear skies', mission: '', execution: '', adminLogistics: '', commandSignal: '' },
      perFlight: {},
      waypoints: {},
      mapAnnotations: [],
    },
    issues: [],
  } as unknown as MissionData;
}

function Probe() {
  const { screen } = useWorkspace();
  return <output data-testid="workspace" data-screen={screen} />;
}

function screenNow(): string {
  return container.querySelector('[data-testid="workspace"]')?.getAttribute('data-screen') ?? '';
}

async function renderBriefing(settings: Partial<DisplaySettings>) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
    ...DEFAULT_SETTINGS,
    settingsVersion: SETTINGS_VERSION,
    viewMode: 'creator',
    side: 'blue',
    briefingSections: ['overview', 'flights', 'comms'],
    ...settings,
  }));
  await act(async () => {
    root.render(
      <SettingsProvider>
        <MissionProvider
          mission={makeMission()}
          sourceFile={null}
          storageFailed={false}
          revisions={null}
          onNotesChange={() => {}}
          onCloseRevisions={() => {}}
        >
          <WorkspaceProvider>
            <Probe />
            <BriefingMode />
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

async function pressKey(key: string, target: EventTarget = window) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function counter(): string {
  return container.querySelector('.briefing-bar-count')?.textContent ?? '';
}

async function startShow() {
  await click(buttonByText('開始'));
}

function checkboxFor(label: string): HTMLInputElement {
  const row = Array.from(container.querySelectorAll<HTMLLabelElement>('.briefing-check'))
    .find(item => item.textContent === label);
  const input = row?.querySelector<HTMLInputElement>('input');
  if (!input) throw new Error(`checkbox not found: ${label}`);
  return input;
}

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

describe('BriefingMode start step (F8)', () => {
  it('starts with the weather and navlog included, though the saved list does not hold them yet', async () => {
    await renderBriefing({ briefingSections: ['overview', 'flights', 'comms'] });

    expect(checkboxFor('天候').checked).toBe(true);
    expect(checkboxFor('ナビログ').checked).toBe(true);
  });

  it('follows the saved list for a section that the list can hold', async () => {
    await renderBriefing({ briefingSections: ['overview', 'map'] });

    expect(checkboxFor('地図').checked).toBe(true);
    expect(checkboxFor('記入').checked).toBe(false);
  });

  it('offers the threats choice in creator view', async () => {
    await renderBriefing({ viewMode: 'creator', briefingSections: ['overview', 'threats'] });

    const labels = Array.from(container.querySelectorAll('.briefing-check')).map(item => item.textContent);
    expect(labels).toContain('脅威');
  });

  it('explains that threats are not included in pilot view and offers no threats choice', async () => {
    await renderBriefing({ viewMode: 'pilot', briefingSections: ['overview', 'threats'] });

    expect(container.textContent).toContain('脅威はパイロット表示には含まれません');
    const labels = Array.from(container.querySelectorAll('.briefing-check')).map(item => item.textContent);
    expect(labels).not.toContain('脅威');
  });

  it('returns to the overview from the back button', async () => {
    await renderBriefing({});
    await click(buttonByText('戻る'));

    expect(screenNow()).toBe('overview');
  });
});

describe('BriefingMode slide show (F8)', () => {
  it('starts at the first slide and moves with the arrow, Home and End keys', async () => {
    await renderBriefing({});
    await startShow();

    expect(counter()).toBe('1 / 5');
    await pressKey('ArrowRight');
    expect(counter()).toBe('2 / 5');
    await pressKey('End');
    expect(counter()).toBe('5 / 5');
    await pressKey('ArrowRight');
    expect(counter()).toBe('5 / 5');
    await pressKey('Home');
    expect(counter()).toBe('1 / 5');
    await pressKey('ArrowLeft');
    expect(counter()).toBe('1 / 5');
  });

  it('moves with the on-screen next and previous buttons', async () => {
    await renderBriefing({});
    await startShow();

    await click(buttonByText('次へ'));
    expect(counter()).toBe('2 / 5');
    await click(buttonByText('前へ'));
    expect(counter()).toBe('1 / 5');
  });

  it('shows the slide number in the footer too, as SPEC 1.3 places it', async () => {
    await renderBriefing({});
    await startShow();

    expect(container.querySelector('.briefing-footer-count')?.textContent).toBe('1 / 5');
  });

  it('moves keyboard focus into the show when it starts', async () => {
    await renderBriefing({});
    await startShow();

    expect(document.activeElement).toBe(container.querySelector('.briefing'));
  });

  it('ignores the keys while a field has the focus', async () => {
    await renderBriefing({});
    await startShow();
    const field = document.createElement('input');
    document.body.append(field);

    await pressKey('ArrowRight', field);

    expect(counter()).toBe('1 / 5');
    field.remove();
  });

  it('leaves the show with Escape', async () => {
    await renderBriefing({});
    await startShow();

    await pressKey('Escape');

    expect(screenNow()).toBe('overview');
  });

  it('does not break when the browser has no full-screen API', async () => {
    await renderBriefing({});
    await startShow();

    await pressKey('f');

    expect(counter()).toBe('1 / 5');
  });

  it('asks the browser for full screen with F', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: requestFullscreen, configurable: true });
    try {
      await renderBriefing({});
      await startShow();

      await pressKey('f');
      expect(requestFullscreen).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });

  it('never shows the threats slide or the threats contents entry in pilot view', async () => {
    await renderBriefing({ viewMode: 'pilot', briefingSections: ['overview', 'threats', 'flights'] });
    await startShow();

    const contents = container.querySelector('.briefing-toc')?.textContent ?? '';
    expect(contents).not.toContain('脅威');
    expect(container.textContent).not.toContain('SA-10');
  });

  it('shows the map slide for all flights, and puts the slide in the 16:9 frame', async () => {
    await renderBriefing({ briefingSections: ['overview', 'map'] });
    await startShow();
    await pressKey('End');

    expect(container.querySelector('.briefing-map-caption')?.textContent).toBe('全機');
    expect(container.querySelector('.briefing-stage .briefing-canvas .briefing-slide')).not.toBeNull();
  });

  it('shows an empty-state message when no section is selected', async () => {
    await renderBriefing({ briefingSections: [] });
    await click(checkboxFor('天候'));
    await click(checkboxFor('ナビログ'));
    await startShow();

    expect(container.textContent).toContain('表示する項目がありません');
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { readFile } from 'node:fs/promises';
// @ts-expect-error Vitest executes this test in Node; this project intentionally omits @types/node.
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMission } from '../core/MissionNormalizer';
import App from '../App';
import { SettingsProvider, SETTINGS_STORAGE_KEY } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import en from '../i18n/locales/en/settings.json';
import ja from '../i18n/locales/ja/settings.json';
import type { MissionData } from '../types/mission';
import { formatCoordinate } from '../utils/coordinates';
import { formatEtaLocal, formatEtaZulu } from '../utils/time';
import { pressureValuesFromMmHg } from '../utils/units';
import AppShell from './AppShell';
import { MissionProvider } from './MissionContext';
import SettingsDrawer from './SettingsDrawer';
import { useUnits } from './units';

function makeMission(): MissionData {
  return normalizeMission({
    mission: { sortie: 'Settings drawer test', start_time: 0, weather: {} },
    theatre: 'Caucasus',
    warehouses: {},
    dictionary: {},
    mapResource: {},
  }, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' });
}

/** Shows what the rest of the screens display for each setting, to check that a change reaches them. */
function UnitsProbe() {
  const units = useUnits();
  return (
    <div>
      <p data-testid="probe-alt">{units.alt(1000)}</p>
      <p data-testid="probe-wind">{units.wind(90)}</p>
      <p data-testid="probe-coord">{units.coord([42.5, 43.25])}</p>
      <p data-testid="probe-distance">{units.distance(10000)}</p>
      <p data-testid="probe-pressure">{units.pressure(pressureValuesFromMmHg(760))}</p>
      <p data-testid="probe-temp">{units.temp(15)}</p>
      <p data-testid="probe-time">{units.time(0)}</p>
    </div>
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
  vi.restoreAllMocks();
  localStorage.clear();
});

async function renderDrawer(open: boolean, onClose: () => void = () => {}) {
  await act(async () => {
    root.render(
      <SettingsProvider>
        <SettingsDrawer open={open} onClose={onClose} />
      </SettingsProvider>,
    );
  });
}

async function renderWithMission(mission: MissionData, onClose: () => void = () => {}) {
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
          <UnitsProbe />
          <SettingsDrawer open onClose={onClose} />
        </MissionProvider>
      </SettingsProvider>,
    );
  });
}

/** Renders the whole shell, as App does, so the settings trigger and its focus return are the real ones. */
async function renderShell(mission: MissionData | null) {
  await act(async () => {
    root.render(
      <SettingsProvider>
        <AppShell
          mission={mission}
          sourceFile={null}
          storageFailed={false}
          revisions={null}
          loading={false}
          isDragging={false}
          onNotesChange={() => {}}
          onPickFiles={() => {}}
          onCloseRevisions={() => {}}
          onCloseMission={() => {}}
        />
      </SettingsProvider>,
    );
  });
  // Lazily loaded screens resolve on a later macrotask.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
}

/** The group for a setting row, found by the name it has from its label. */
function group(label: string): HTMLElement {
  const element = Array.from(container.querySelectorAll<HTMLElement>('.settings-row[role="group"]'))
    .find(item => document.getElementById(item.getAttribute('aria-labelledby') ?? '')?.textContent === label);
  if (!element) throw new Error(`group not found: ${label}`);
  return element;
}

async function pick(groupLabel: string, optionLabel: string) {
  const button = Array.from(group(groupLabel).querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent === optionLabel);
  if (!button) throw new Error(`option not found: ${groupLabel} / ${optionLabel}`);
  await act(async () => { button.click(); });
}

async function chooseCoordinate(value: string) {
  const select = container.querySelector<HTMLSelectElement>('.settings-select');
  if (!select) throw new Error('coordinate select not found');
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function examples(): string[] {
  return Array.from(container.querySelectorAll('.settings-row .field-hint, .field .field-hint')).map(item => item.textContent ?? '');
}

function storedSettings(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
}

function probeText(testId: string): string | null {
  return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;
}

function settingsTrigger(): HTMLButtonElement {
  const trigger = document.getElementById('shell-settings-trigger');
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('settings trigger not found');
  return trigger;
}

function dialog(): Element | null {
  return container.querySelector('[role="dialog"]');
}

describe('SettingsDrawer visibility and closing', () => {
  it('renders nothing while closed', async () => {
    await renderDrawer(false);
    expect(container.querySelector('.settings-drawer')).toBeNull();
  });

  it('opens as a labelled dialog and focuses the close button', async () => {
    await renderDrawer(true);
    const opened = dialog();
    expect(opened).not.toBeNull();
    expect(opened?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe(ja.close);
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    await renderDrawer(true, onClose);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose from the close button', async () => {
    const onClose = vi.fn();
    await renderDrawer(true, onClose);
    const close = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent === ja.close);
    await act(async () => { close?.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on a control when the parent re-renders with a new onClose', async () => {
    await renderDrawer(true, () => {});
    await pick(ja.altitude, 'ft');
    const pressed = group(ja.altitude).querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(pressed?.textContent).toBe('ft');
    pressed?.focus();

    // A parent passing a new callback must not pull focus back to the close button.
    await renderDrawer(true, () => {});
    expect(document.activeElement).toBe(pressed);
  });
});

describe('SettingsDrawer returns focus to the settings trigger', () => {
  it.each([
    ['the initial screen', null],
    ['an open mission', makeMission()],
  ] as const)('after Escape, on %s', async (_name, mission) => {
    await renderShell(mission);
    await act(async () => { settingsTrigger().click(); });
    expect(dialog()).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(settingsTrigger());
  });

  it.each([
    ['the initial screen', null],
    ['an open mission', makeMission()],
  ] as const)('after the close button, on %s', async (_name, mission) => {
    await renderShell(mission);
    await act(async () => { settingsTrigger().click(); });
    const close = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent === ja.close);
    await act(async () => { close?.click(); });

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(settingsTrigger());
  });
});

describe('SettingsDrawer changes apply at once', () => {
  it('stores a unit change and shows the new example', async () => {
    await renderDrawer(true);
    expect(examples()).toContain('表示例: 1000 m');
    await pick(ja.altitude, 'ft');

    expect(storedSettings().altitudeUnit).toBe('ft');
    expect(examples()).toContain('表示例: 3281 ft');
    expect(group(ja.altitude).querySelector('button[aria-pressed="true"]')?.textContent).toBe('ft');
  });

  it('stores the distance, pressure, temperature and time choices and shows their examples', async () => {
    await renderDrawer(true);
    await pick(ja.distance, 'km');
    await pick(ja.pressure, 'mmHg');
    await pick(ja.temperature, '°F');
    await pick(ja.time.label, ja.time.local);

    expect(storedSettings()).toMatchObject({
      distanceUnit: 'km',
      pressureUnit: 'mmHg',
      temperatureUnit: 'F',
      timeDisplay: 'local',
    });
    expect(examples()).toContain('表示例: 10.0 km');
    expect(examples()).toContain('表示例: 760.0 mmHg');
    expect(examples()).toContain('表示例: 59.0°F');
    expect(group(ja.time.label).querySelector('button[aria-pressed="true"]')?.textContent).toBe(ja.time.local);
  });

  it('shows the coordinate example for the chosen format', async () => {
    await renderDrawer(true);
    await chooseCoordinate('DMS');

    expect(storedSettings().coordinateFormat).toBe('DMS');
    expect(examples()).toContain(`表示例: ${formatCoordinate(42.5, 43.25, 'DMS')}`);
  });

  it('shows the aircraft default as DDM when no aircraft type is known', async () => {
    await renderDrawer(true);
    await chooseCoordinate('aircraft');

    expect(storedSettings().coordinateFormat).toBe('aircraft');
    expect(examples()).toContain(`表示例: ${formatCoordinate(42.5, 43.25, 'DDM')}`);
  });

  it('changes the theme and the font size', async () => {
    await renderDrawer(true);
    await pick(ja.theme.label, ja.theme.night);
    await pick(ja.fontScale.label, ja.fontScale.large);

    expect(storedSettings().theme).toBe('night');
    expect(storedSettings().fontScale).toBe('large');
  });

  it('hides the map tiles when the map background is turned off, and shows them again', async () => {
    // The map screens draw Leaflet tiles into .leaflet-tile-pane. The real stylesheet is loaded, so
    // the computed visibility shows whether the tiles are drawn, not only what was stored.
    const style = document.createElement('style');
    // This file runs under jsdom, where import.meta.url is not a file URL. Vitest runs from the project root.
    style.textContent = await readFile(resolve('src/styles/settings.css'), 'utf8');
    const tiles = document.createElement('div');
    tiles.className = 'leaflet-tile-pane';
    document.head.append(style);
    document.body.append(tiles);
    try {
      await renderDrawer(true);
      const box = container.querySelector<HTMLInputElement>('.settings-check input');
      expect(box?.checked).toBe(true);
      expect(getComputedStyle(tiles).visibility).not.toBe('hidden');

      await act(async () => { box?.click(); });
      expect(storedSettings().mapBackground).toBe(false);
      expect(document.documentElement.dataset.mapBackground).toBe('hidden');
      expect(getComputedStyle(tiles).visibility).toBe('hidden');

      await act(async () => { container.querySelector<HTMLInputElement>('.settings-check input')?.click(); });
      expect(storedSettings().mapBackground).toBe(true);
      expect(document.documentElement.dataset.mapBackground).toBe('shown');
      expect(getComputedStyle(tiles).visibility).not.toBe('hidden');
    } finally {
      style.remove();
      tiles.remove();
    }
  });

  it('changes the theme and font size of the whole app, not only the stored values', async () => {
    // App sets the theme and font size on .app and on the document root; the drawer changes them.
    await act(async () => {
      root.render(
        <SettingsProvider>
          <App />
        </SettingsProvider>,
      );
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { settingsTrigger().click(); });

    await pick(ja.theme.label, ja.theme.night);
    await pick(ja.fontScale.label, ja.fontScale.large);

    const app = container.querySelector<HTMLElement>('.app');
    expect(app?.dataset.theme).toBe('night');
    expect(app?.dataset.fontScale).toBe('large');
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(document.documentElement.dataset.fontScale).toBe('large');
  });

  it('switches the UI language and shows the drawer in it', async () => {
    await renderDrawer(true);
    await pick(ja.language.label, ja.language.en);

    expect(storedSettings().language).toBe('en');
    expect(container.querySelector('[role="dialog"] h2')?.textContent).toBe(en.title);
    // Return to Japanese so the other tests in this file see the default language.
    await pick(en.language.label, en.language.ja);
  });

  it('describes each choice row and the coordinate select with their examples', async () => {
    await renderDrawer(true);

    // One named group per row: the row is named by its label and the buttons inside are unnamed,
    // so a screen reader does not announce the same label twice.
    const row = group(ja.altitude);
    expect(document.getElementById(row.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(ja.altitude);
    expect(document.getElementById(row.getAttribute('aria-describedby') ?? '')?.textContent).toBe('表示例: 1000 m');
    expect(row.querySelectorAll('[role="group"][aria-label]:not([aria-label=""])')).toHaveLength(0);
    expect(row.querySelectorAll('[role="group"]')).toHaveLength(1);

    const select = container.querySelector<HTMLSelectElement>('.settings-select');
    const selectLabel = Array.from(container.querySelectorAll('label')).find(item => item.htmlFor === select?.id);
    expect(selectLabel?.textContent).toBe(ja.coordinate.label);
    expect(document.getElementById(select?.getAttribute('aria-describedby') ?? '')?.textContent)
      .toBe(`表示例: ${formatCoordinate(42.5, 43.25, 'DDM')}`);
  });

  it('warns when a choice cannot be saved, and still applies it on screen', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    await renderDrawer(true);
    await pick(ja.altitude, 'ft');

    expect(container.querySelector('.notice-warning')?.textContent).toContain(ja.unsaved);
    expect(examples()).toContain('表示例: 3281 ft');
    expect(group(ja.altitude).querySelector('button[aria-pressed="true"]')?.textContent).toBe('ft');
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();

    vi.restoreAllMocks();
    await pick(ja.altitude, 'm');
    expect(container.querySelector('.notice-warning')).toBeNull();
    expect(storedSettings().altitudeUnit).toBe('m');
  });
});

describe('SettingsDrawer reaches the screens', () => {
  it('changes what useUnits shows for every unit, coordinate and time setting', async () => {
    const mission = makeMission();
    const local = formatEtaLocal(mission.meta, 0);
    const zulu = formatEtaZulu(mission.meta, 0);
    await renderWithMission(mission);
    expect(probeText('probe-alt')).toBe('1000 m');
    expect(probeText('probe-wind')).toBe('270° から / 90° へ');
    expect(probeText('probe-coord')).toBe(formatCoordinate(42.5, 43.25, 'DDM'));
    expect(probeText('probe-distance')).toBe('5.4 nm');
    expect(probeText('probe-pressure')).toBe('1013.2 hPa');
    expect(probeText('probe-temp')).toBe('15.0°C');
    expect(probeText('probe-time')).toBe(`${local} 現地 / ${zulu} Z`);

    await pick(ja.altitude, 'ft');
    await pick(ja.wind.label, ja.wind.to);
    await chooseCoordinate('DMS');
    await pick(ja.distance, 'km');
    await pick(ja.pressure, 'inHg');
    await pick(ja.temperature, '°F');
    await pick(ja.time.label, ja.time.zulu);

    expect(probeText('probe-alt')).toBe('3281 ft');
    expect(probeText('probe-wind')).toBe('90° へ');
    expect(probeText('probe-coord')).toBe(formatCoordinate(42.5, 43.25, 'DMS'));
    expect(probeText('probe-distance')).toBe('10.0 km');
    expect(probeText('probe-pressure')).toBe('29.92 inHg');
    expect(probeText('probe-temp')).toBe('59.0°F');
    expect(probeText('probe-time')).toBe(`${zulu} Z`);
  });
});

describe('SettingsDrawer reset and standalone use', () => {
  it('resets display settings to their defaults and keeps the briefing sections', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      settingsVersion: 5,
      altitudeUnit: 'ft',
      theme: 'standard',
      briefingSections: ['overview'],
    }));
    await renderDrawer(true);
    expect(group(ja.altitude).querySelector('button[aria-pressed="true"]')?.textContent).toBe('ft');

    const reset = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent === ja.reset);
    expect(document.getElementById(reset?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(ja.resetNote);
    await act(async () => { reset?.click(); });

    expect(storedSettings().altitudeUnit).toBe('m');
    expect(storedSettings().theme).toBe('ffs');
    expect(storedSettings().briefingSections).toEqual(['overview']);
    expect(group(ja.altitude).querySelector('button[aria-pressed="true"]')?.textContent).toBe('m');
  });

  it('works without a mission, as on the initial screen', async () => {
    await renderDrawer(true);
    await pick(ja.speed, 'km/h');
    expect(storedSettings().speedUnit).toBe('kmh');
    expect(examples()).toContain('表示例: 360 km/h');
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../i18n';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings, MissionData } from '../types/mission';
import OverviewTab from './OverviewTab';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function makeMission(): MissionData {
  const coalition = () => ({
    bullseye: { xy: [0, 0] as [number, number], latlon: [42, 42] as [number, number], latlonResolved: true },
    navPoints: [],
    airbases: [],
    flights: [],
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  });
  return {
    sourceFingerprint: 'overview-tab-fixture',
    meta: {
      sortie: 'Overview render test',
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
      wind: [],
      clouds: { preset: 'clear', label: 'Clear', base: 0 },
      visibility: 10000,
      fog: { thickness: 0, visibility: 0, enabled: false },
      dust: { density: 0, enabled: false },
      turbulence: { ground: 0 },
    },
    coalitions: { blue: coalition(), red: coalition(), neutral: coalition() },
    userNotes: {} as MissionData['userNotes'],
    issues: [],
  } as unknown as MissionData;
}

function settingsFor(viewMode: DisplaySettings['viewMode'], side: DisplaySettings['side']): DisplaySettings {
  return { ...DEFAULT_SETTINGS, viewMode, side };
}

async function render(element: JSX.Element) {
  await act(async () => { root.render(element); });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await i18nReady;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('OverviewTab task text (D1)', () => {
  it('does not show the opposing task text in pilot view', async () => {
    await render(<OverviewTab mission={makeMission()} settings={settingsFor('pilot', 'blue')} />);

    expect(container.textContent).toContain('Blue task text');
    expect(container.textContent).toContain('Neutral task text');
    expect(container.textContent).not.toContain('Red task text');
  });

  it('does not show the opposing side issue text in pilot view', async () => {
    const mission = makeMission();
    mission.issues = [
      { code: 'unit.unknownType', severity: 'info', params: { type: 'SECRET-RED-SAM' }, side: 'red' },
      { code: 'unit.unknownType', severity: 'info', params: { type: 'OWN-UNKNOWN' }, side: 'blue' },
    ];

    await render(<OverviewTab mission={mission} settings={settingsFor('pilot', 'blue')} />);

    expect(container.textContent).toContain('OWN-UNKNOWN');
    expect(container.textContent).not.toContain('SECRET-RED-SAM');
  });

  it('shows both task texts in creator view', async () => {
    await render(<OverviewTab mission={makeMission()} settings={settingsFor('creator', 'blue')} />);

    expect(container.textContent).toContain('Blue task text');
    expect(container.textContent).toContain('Red task text');
  });
});

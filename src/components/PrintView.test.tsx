// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMission } from '../core/MissionNormalizer';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import type { DisplaySettings, MissionData } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import PrintView from './PrintView';

const baseSettings = { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' };
const whiteboard: WhiteboardData = { notes: '', strokes: [] };

/** A mission whose issues belong to both coalitions, plus one whole-mission issue (D1). */
function makeMission(): MissionData {
  const mission = normalizeMission({
    mission: { sortie: 'Print warning test', start_time: 0, weather: {} },
    theatre: 'Caucasus',
    warehouses: {},
    dictionary: {},
    mapResource: {},
  }, baseSettings);
  mission.issues = [
    { code: 'unit.unknownType', severity: 'info', params: { type: 'OWN-UNKNOWN' }, side: 'blue' },
    { code: 'unit.unknownType', severity: 'info', params: { type: 'SECRET-RED-SAM' }, side: 'red' },
    { code: 'map.unsupported', severity: 'warning', params: { theatre: 'Test' } },
  ];
  return mission;
}

function printSettings(overrides: Partial<DisplaySettings>): DisplaySettings {
  // Only the overview section: it prints the warning list and mounts no map.
  return { ...DEFAULT_SETTINGS, briefingSections: ['overview'], ...overrides };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

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

async function renderPrint(settings: DisplaySettings) {
  await act(async () => {
    root.render(<PrintView mission={makeMission()} settings={settings} whiteboard={whiteboard} />);
  });
}

describe('print document warnings follow the view (D1)', () => {
  it('lists the opposing side issue in creator view', async () => {
    await renderPrint(printSettings({ viewMode: 'creator', side: 'blue' }));
    expect(container.textContent).toContain('SECRET-RED-SAM');
    expect(container.textContent).toContain('OWN-UNKNOWN');
  });

  it('does not print the opposing side issue in pilot view, but keeps the displayed side and whole-mission issues', async () => {
    await renderPrint(printSettings({ viewMode: 'pilot', side: 'blue' }));
    expect(container.textContent).not.toContain('SECRET-RED-SAM');
    expect(container.textContent).toContain('OWN-UNKNOWN');
    expect(container.textContent).toContain('未対応のマップ: Test');
  });

  it('prints the red issue and hides the blue one when red is displayed in pilot view', async () => {
    await renderPrint(printSettings({ viewMode: 'pilot', side: 'red' }));
    expect(container.textContent).toContain('SECRET-RED-SAM');
    expect(container.textContent).not.toContain('OWN-UNKNOWN');
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import exportJa from '../i18n/locales/ja/export.json';
import { MissionProvider } from '../shell/MissionContext';
import { WorkspaceProvider, useWorkspace } from '../shell/workspace';
import type { MissionData } from '../types/mission';
import { fixtureMission } from './__tests__/fixture';
import { resetExportScope } from './exportPlan';
import PrintHost from './PrintHost';

/** The controls the test drives, taken from the providers on each render. */
let api: {
  setScreen: ReturnType<typeof useWorkspace>['setScreen'];
  setSide: ReturnType<typeof useSettings>['setSide'];
  setTheme: ReturnType<typeof useSettings>['setTheme'];
  setKneeboardWidth: ReturnType<typeof useSettings>['setKneeboardWidth'];
  setBriefingSections: ReturnType<typeof useSettings>['setBriefingSections'];
};

function Probe() {
  const settings = useSettings();
  const workspace = useWorkspace();
  api = {
    setScreen: workspace.setScreen,
    setSide: settings.setSide,
    setTheme: settings.setTheme,
    setKneeboardWidth: settings.setKneeboardWidth,
    setBriefingSections: settings.setBriefingSections,
  };
  return null;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let contexts = 0;
let images = 0;
const mission: MissionData = fixtureMission();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  resetExportScope();
  await i18nReady;
  contexts = 0;
  images = 0;
  // A canvas that accepts every call, counted, and tile requests that fail at once.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    contexts += 1;
    return new Proxy({} as Record<string, unknown>, {
      get: (target, property) => {
        if (property === 'measureText') return (value: string) => ({ width: value.length * 8 });
        if (property in target) return target[property as string];
        return () => undefined;
      },
      set: (target, property, value) => {
        target[property as string] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  });
  vi.stubGlobal('Image', class FakeImage {
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor() {
      images += 1;
    }

    set src(_value: string) {
      queueMicrotask(() => this.onerror?.());
    }
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.printPreview;
});

async function renderHost() {
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
            <PrintHost />
          </WorkspaceProvider>
        </MissionProvider>
      </SettingsProvider>,
    );
  });
  await act(async () => {
    api.setBriefingSections(['map']);
  });
  await settle();
}

/** Lets a map draw finish. The fake tiles fail at once, so one macrotask is enough. */
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function mapStatus(): string | null {
  return container.querySelector('.print-map-status')?.textContent ?? null;
}

const deferredText = exportJa.ui.mapDeferred;

describe('the printable briefing draws its maps only when allowed (decision 7)', () => {
  it('reads the mission without drawing or requesting a tile, and says that the map is prepared later', async () => {
    await renderHost();
    expect(contexts).toBe(0);
    expect(images).toBe(0);
    expect(mapStatus()).toBe(deferredText);
  });

  it('draws the map when printing starts, so the print snapshot shows it', async () => {
    await renderHost();
    await act(async () => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    await settle();
    expect(contexts).toBeGreaterThan(0);
    expect(mapStatus()).not.toBe(deferredText);
  });

  it('draws the map once the export screen has been opened, and keeps it drawn after leaving', async () => {
    await renderHost();
    await act(async () => {
      api.setScreen('export');
    });
    await settle();
    const drawn = contexts;
    expect(drawn).toBeGreaterThan(0);
    await act(async () => {
      api.setScreen('overview');
    });
    await settle();
    expect(mapStatus()).not.toBe(deferredText);
  });

  it('does not draw the map again for an unrelated setting (theme, kneeboard width)', async () => {
    await renderHost();
    await act(async () => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    await settle();
    const drawn = contexts;
    expect(drawn).toBeGreaterThan(0);

    await act(async () => {
      api.setTheme('night');
    });
    await settle();
    await act(async () => {
      api.setKneeboardWidth(2048);
    });
    await settle();
    expect(contexts).toBe(drawn);
  });

  it('draws the map again when what it shows changes (the displayed side)', async () => {
    await renderHost();
    await act(async () => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    await settle();
    const drawn = contexts;

    await act(async () => {
      api.setSide('red');
    });
    await settle();
    expect(contexts).toBeGreaterThan(drawn);
  });
});

describe('the printable copy is hidden from assistive technology unless the print preview is open', () => {
  it('marks the off-screen copy aria-hidden, and removes the mark while the print preview is open', async () => {
    await renderHost();
    expect(container.querySelector('.print-briefing')?.getAttribute('aria-hidden')).toBe('true');

    await act(async () => {
      document.documentElement.dataset.printPreview = 'on';
    });
    await settle();
    expect(container.querySelector('.print-briefing')?.hasAttribute('aria-hidden')).toBe(false);

    await act(async () => {
      delete document.documentElement.dataset.printPreview;
    });
    await settle();
    expect(container.querySelector('.print-briefing')?.getAttribute('aria-hidden')).toBe('true');
  });
});

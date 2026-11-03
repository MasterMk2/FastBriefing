// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMission } from '../../core/MissionNormalizer';
import { SettingsProvider } from '../../hooks/useSettings';
import { i18nReady } from '../../i18n';
import shellJa from '../../i18n/locales/ja/shell.json';
import type { MissionData } from '../../types/mission';
import { NAV_SCREENS } from '../../types/screen';
import AppShell from '../AppShell';

const settings = { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' };

function makeMission(): MissionData {
  return normalizeMission({
    mission: { sortie: 'Shell render test', start_time: 0, weather: {} },
    theatre: 'Caucasus',
    warehouses: {},
    dictionary: {},
    mapResource: {},
  }, settings);
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

async function renderShell() {
  await act(async () => {
    root.render(
      <SettingsProvider>
        <AppShell
          mission={makeMission()}
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
}

function navLabels(): string[] {
  return Array.from(container.querySelectorAll('.workspace-nav-item')).map(item => item.textContent ?? '');
}

function viewButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('.shell-view button'))
    .find(item => item.textContent === label);
  if (!button) throw new Error(`view button not found: ${label}`);
  return button;
}

async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
}

async function settle() {
  // Lazily loaded screens resolve on a later macrotask.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
}

describe('AppShell view switch (D1)', () => {
  it('shows the threats item only in creator view', async () => {
    await renderShell();
    expect(navLabels()).not.toContain(shellJa.nav.threats);

    await click(viewButton(shellJa.view.creator));
    expect(navLabels()).toContain(shellJa.nav.threats);

    await click(viewButton(shellJa.view.pilot));
    expect(navLabels()).not.toContain(shellJa.nav.threats);
  });

  it('marks the pressed view option', async () => {
    await renderShell();

    expect(viewButton(shellJa.view.pilot).getAttribute('aria-pressed')).toBe('true');
    await click(viewButton(shellJa.view.creator));
    expect(viewButton(shellJa.view.creator).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('AppShell screens render without error (creator view)', () => {
  // The revision screen needs two loaded revisions, so it is not reachable from this fixture.
  // Every left-rail screen is listed (NAV_SCREENS), so a new or dropped item cannot pass unnoticed.
  it.each(NAV_SCREENS)(
    'renders the %s screen from the left rail',
    async screenId => {
      await renderShell();
      await click(viewButton(shellJa.view.creator));
      const item = Array.from(container.querySelectorAll<HTMLButtonElement>('.workspace-nav-item'))
        .find(button => button.textContent === shellJa.nav[screenId]);
      if (!item) throw new Error(`nav item not found: ${screenId}`);
      await click(item);
      await settle();
      expect(container.querySelector('main')?.childElementCount ?? 0).toBeGreaterThan(0);
    },
  );

  it('renders the briefing screen from the header button', async () => {
    await renderShell();
    const start = Array.from(container.querySelectorAll<HTMLButtonElement>('.shell-header-actions button'))
      .find(button => button.textContent === shellJa.header.start);
    if (!start) throw new Error('briefing button not found');
    await click(start);
    await settle();
    expect(container.querySelector('main')?.childElementCount ?? 0).toBeGreaterThan(0);
  });
});

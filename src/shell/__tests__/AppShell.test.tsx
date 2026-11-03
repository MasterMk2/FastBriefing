// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMission } from '../../core/MissionNormalizer';
import { SettingsProvider } from '../../hooks/useSettings';
import { i18nReady } from '../../i18n';
import shellJa from '../../i18n/locales/ja/shell.json';
import briefingJa from '../../i18n/locales/ja/briefing.json';
import overviewJa from '../../i18n/locales/ja/overview.json';
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
  // jsdom does not implement canvas. The map canvas then gets no context (no drawing) and jsdom prints nothing.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  localStorage.clear();
  await i18nReady;
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
});

interface RenderOptions {
  onCompare?: () => void;
  onPickFiles?: () => void;
}

async function renderShell({ onCompare = () => {}, onPickFiles = () => {} }: RenderOptions = {}) {
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
          onPickFiles={onPickFiles}
          onCompare={onCompare}
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

function buttonByText(selector: string, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>(selector))
    .find(item => item.textContent === text);
  if (!button) throw new Error(`button not found: ${text}`);
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
});

describe('AppShell verbal briefing layer', () => {
  it('draws the briefing outside the shell chrome and makes the chrome inert while it is open', async () => {
    await renderShell();
    expect(container.querySelector('.shell-briefing-layer')).toBeNull();

    await click(buttonByText('.shell-header-actions button', shellJa.header.start));
    await settle();

    const layer = container.querySelector<HTMLElement>('.shell-briefing-layer');
    expect(layer?.childElementCount ?? 0).toBeGreaterThan(0);
    expect(container.querySelector('.shell-header')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.shell-frame')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.bottom-tabs')?.hasAttribute('inert')).toBe(true);
    // The briefing is not a descendant of the inert chrome.
    expect(container.querySelector('.shell-frame')?.contains(layer ?? null)).toBe(false);
    expect(container.querySelector('main')?.childElementCount ?? 0).toBe(0);
  });

  it('makes the chrome interactive again when the briefing ends', async () => {
    await renderShell();
    await click(buttonByText('.shell-header-actions button', shellJa.header.start));
    await settle();
    await click(buttonByText('.shell-briefing-layer button', briefingJa.start.cancel));
    await settle();

    expect(container.querySelector('.shell-briefing-layer')).toBeNull();
    expect(container.querySelector('.shell-header')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('.shell-frame')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('.bottom-tabs')?.hasAttribute('inert')).toBe(false);
  });

  /** Opens the briefing from a focused button, as a keyboard user does, and ends it with やめる. */
  async function openAndEnd(opener: HTMLButtonElement) {
    opener.focus();
    await click(opener);
    await settle();
    expect(container.querySelector('.shell-briefing-layer')).not.toBeNull();
    await click(buttonByText('.shell-briefing-layer button', briefingJa.start.cancel));
    await settle();
  }

  it('returns the focus to the overview start button that opened it (A11Y-2)', async () => {
    await renderShell();
    await settle();
    await openAndEnd(buttonByText('.overview-actions button', overviewJa.actions.briefing));

    // The overview is drawn again, so the button is a new element with the same label.
    expect(document.activeElement).toBe(buttonByText('.overview-actions button', overviewJa.actions.briefing));
  });

  it('returns the focus to the header button when the briefing was opened there (A11Y-2)', async () => {
    await renderShell();
    await settle();
    await openAndEnd(buttonByText('.shell-header-actions button', shellJa.header.start));

    expect(document.activeElement?.id).toBe('shell-briefing-trigger');
  });

  it('falls back to the header button when the opener is no longer in the page (A11Y-2)', async () => {
    await renderShell();
    await settle();
    const opener = buttonByText('.overview-actions button', overviewJa.actions.briefing);
    // Without its id the opener cannot be found again after the overview is drawn again.
    opener.removeAttribute('id');
    await openAndEnd(opener);

    expect(document.activeElement?.id).toBe('shell-briefing-trigger');
  });
});

describe('AppShell compare revisions (F10)', () => {
  it('opens the comparison from the file menu through onCompare and never through onPickFiles', async () => {
    const onCompare = vi.fn();
    const onPickFiles = vi.fn();
    await renderShell({ onCompare, onPickFiles });

    await click(container.querySelector<HTMLButtonElement>('.file-menu-trigger')!);
    await click(buttonByText('[role="menuitem"]', shellJa.file.compare));

    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onPickFiles).not.toHaveBeenCalled();
  });

  it('offers compare revisions in the bottom sheet "その他" through onCompare', async () => {
    const onCompare = vi.fn();
    const onPickFiles = vi.fn();
    await renderShell({ onCompare, onPickFiles });

    await click(buttonByText('.bottom-tab', shellJa.nav.more));
    await click(buttonByText('.bottom-sheet-item', shellJa.file.compare));

    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onPickFiles).not.toHaveBeenCalled();
  });
});

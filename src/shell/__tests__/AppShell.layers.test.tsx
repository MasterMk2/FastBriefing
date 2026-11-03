// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMission } from '../../core/MissionNormalizer';
import { SettingsProvider } from '../../hooks/useSettings';
import { i18nReady } from '../../i18n';
import briefingJa from '../../i18n/locales/ja/briefing.json';
import shellJa from '../../i18n/locales/ja/shell.json';
import type { MissionData } from '../../types/mission';
import AppShell from '../AppShell';

function makeMission(): MissionData {
  return normalizeMission({
    mission: { sortie: 'Shell test', start_time: 0, weather: {} },
    theatre: 'Caucasus',
    warehouses: {},
    dictionary: {},
    mapResource: {},
  }, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'creator' });
}

let container: HTMLDivElement;
let outside: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  await i18nReady;
  container = document.createElement('div');
  // Stands for what App mounts beside the shell (the hidden file inputs, the error band).
  outside = document.createElement('div');
  outside.innerHTML = '<button type="button">outside</button>';
  document.body.append(container, outside);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  outside.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
}

/** Waits for a lazily loaded screen part (the first import of a screen can take longer than one macrotask). */
async function waitFor(selector: string): Promise<Element> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const element = container.querySelector(selector);
    if (element) return element;
    await settle();
  }
  throw new Error(`not rendered: ${selector}`);
}

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
  await settle();
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent?.trim() === text);
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

function briefingTrigger(): HTMLButtonElement {
  return document.getElementById('shell-briefing-trigger') as HTMLButtonElement;
}

describe('the oral briefing layer (A11Y-1, A11Y-2)', () => {
  it('makes everything outside its layer inert, closes the settings drawer, and gives the focus back when it ends', async () => {
    await renderShell();
    await act(async () => { document.getElementById('shell-settings-trigger')?.click(); });
    expect(container.querySelector('.settings-drawer, [role="dialog"]')).not.toBeNull();

    await act(async () => { briefingTrigger().click(); });
    const start = await waitFor('.briefing-start');
    const layer = container.querySelector('.shell-briefing-layer');
    expect(layer).not.toBeNull();
    expect(outside.hasAttribute('inert')).toBe(true);
    expect(layer?.closest('[inert]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    // The start screen has the focus, not the button under the inert shell.
    expect(document.activeElement).toBe(start);

    await act(async () => { buttonByText(briefingJa.start.cancel).click(); });
    await settle();
    expect(outside.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(briefingTrigger());
  });
});

describe('the bottom tab sheet (A11Y-6, A11Y-12)', () => {
  it('names the tab bar for what it is, and closes the sheet with Escape, giving the focus back to "more"', async () => {
    await renderShell();
    const nav = container.querySelector('nav.bottom-tabs');
    expect(nav?.getAttribute('aria-label')).toBe(shellJa.rail.navLabel);

    const more = buttonByText(shellJa.nav.more);
    await act(async () => { more.click(); });
    const sheet = container.querySelector('.bottom-sheet');
    expect(sheet).not.toBeNull();
    expect(sheet?.contains(document.activeElement)).toBe(true);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => { document.dispatchEvent(escape); });
    expect(container.querySelector('.bottom-sheet')).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(more);
  });

  it('closes the sheet when the pointer goes down outside it', async () => {
    await renderShell();
    await act(async () => { buttonByText(shellJa.nav.more).click(); });
    await act(async () => { outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(container.querySelector('.bottom-sheet')).toBeNull();
  });
});

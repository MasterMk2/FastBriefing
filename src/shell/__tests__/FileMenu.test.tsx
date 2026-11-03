// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../../i18n';
import shellJa from '../../i18n/locales/ja/shell.json';
import FileMenu, { COMPARE_INPUT_ID, type FileMenuProps } from '../FileMenu';

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
  document.getElementById(COMPARE_INPUT_ID)?.remove();
  vi.unstubAllGlobals();
});

function props(overrides: Partial<FileMenuProps> = {}): FileMenuProps {
  return { hasMission: true, onOpen: vi.fn(), onCompare: vi.fn(), onClose: vi.fn(), ...overrides };
}

async function renderMenu(overrides: Partial<FileMenuProps> = {}) {
  await act(async () => { root.render(<FileMenu {...props(overrides)} />); });
}

function trigger(): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('.file-menu-trigger');
  if (!found) throw new Error('trigger not rendered');
  return found;
}

function item(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(node => node.textContent === text);
  if (!found) throw new Error(`menu item not found: ${text}`);
  return found;
}

async function open() {
  await act(async () => { trigger().click(); });
}

describe('file menu', () => {
  it('closes on Escape and returns focus to its trigger', async () => {
    await renderMenu();
    await open();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a press outside the menu', async () => {
    await renderMenu();
    await open();

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('never replaces the open mission when the comparison input is not rendered', async () => {
    const onCompare = vi.fn();
    const onOpen = vi.fn();
    await renderMenu({ onCompare, onOpen });
    await open();

    await act(async () => { item(shellJa.file.compare).click(); });

    expect(onCompare).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the comparison input rendered by the app instead of replacing the open mission', async () => {
    const onCompare = vi.fn();
    const input = document.createElement('input');
    input.type = 'file';
    input.id = COMPARE_INPUT_ID;
    document.body.append(input);
    const clicked = vi.spyOn(input, 'click').mockImplementation(() => {});
    await renderMenu({ onCompare });
    await open();

    await act(async () => { item(shellJa.file.compare).click(); });

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(onCompare).not.toHaveBeenCalled();
  });

  it('disables compare and close when no mission is open', async () => {
    await renderMenu({ hasMission: false });
    await open();

    expect(item(shellJa.file.open).disabled).toBe(false);
    expect(item(shellJa.file.compare).disabled).toBe(true);
    expect(item(shellJa.file.close).disabled).toBe(true);
  });
});

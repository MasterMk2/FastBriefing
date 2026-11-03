// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../../i18n';
import shellJa from '../../i18n/locales/ja/shell.json';
import FileMenu, { type FileMenuProps } from '../FileMenu';

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

  it('calls onCompare, and never onOpen, when compare revisions is chosen', async () => {
    const onCompare = vi.fn();
    const onOpen = vi.fn();
    await renderMenu({ onCompare, onOpen });
    await open();

    await act(async () => { item(shellJa.file.compare).click(); });

    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls onOpen, and never onCompare, when open is chosen', async () => {
    const onCompare = vi.fn();
    const onOpen = vi.fn();
    await renderMenu({ onCompare, onOpen });
    await open();

    await act(async () => { item(shellJa.file.open).click(); });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onCompare).not.toHaveBeenCalled();
  });

  it('disables compare and close when no mission is open', async () => {
    const onCompare = vi.fn();
    await renderMenu({ hasMission: false, onCompare });
    await open();

    expect(item(shellJa.file.open).disabled).toBe(false);
    expect(item(shellJa.file.compare).disabled).toBe(true);
    expect(item(shellJa.file.close).disabled).toBe(true);
    await act(async () => { item(shellJa.file.compare).click(); });
    expect(onCompare).not.toHaveBeenCalled();
  });
});

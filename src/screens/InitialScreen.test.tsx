// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../i18n';
import initialJa from '../i18n/locales/ja/initial.json';
import InitialScreen from './InitialScreen';

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(loading: boolean, onPickFiles = vi.fn()) {
  await act(async () => {
    root.render(<InitialScreen loading={loading} isDragging={false} onPickFiles={onPickFiles} />);
  });
  return onPickFiles;
}

function pickButton(): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === initialJa.pick);
  if (!found) throw new Error('pick button not rendered');
  return found;
}

describe('initial screen', () => {
  it('offers the same file action from the button, with the three guide lines and the compare hint', async () => {
    const onPickFiles = await render(false);

    expect(container.textContent).toContain(initialJa.point1);
    expect(container.textContent).toContain(initialJa.point2);
    expect(container.textContent).toContain(initialJa.point3);
    expect(container.textContent).toContain(initialJa.compareHint);

    await act(async () => { pickButton().click(); });
    expect(onPickFiles).toHaveBeenCalledTimes(1);
  });

  it('opens the picker when the empty part of the drop area is pressed, once', async () => {
    const onPickFiles = await render(false);

    await act(async () => { container.querySelector<HTMLElement>('.initial-drop-title')!.click(); });
    expect(onPickFiles).toHaveBeenCalledTimes(1);

    await act(async () => { container.querySelector<HTMLElement>('.initial-drop')!.click(); });
    expect(onPickFiles).toHaveBeenCalledTimes(2);
  });

  it('does not open the picker when the drop area is pressed while a file is read', async () => {
    const onPickFiles = await render(true);

    await act(async () => { container.querySelector<HTMLElement>('.initial-drop')!.click(); });

    expect(onPickFiles).not.toHaveBeenCalled();
  });

  it('marks the drop area busy and disables the button while a file is read', async () => {
    await render(true);

    expect(container.querySelector('.initial-drop')?.getAttribute('aria-busy')).toBe('true');
    expect(pickButton().disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(initialJa.loading);
  });

  it('says the read can be cancelled once it has taken ten seconds', async () => {
    vi.useFakeTimers();
    await render(true);
    expect(container.textContent).not.toContain(initialJa.slow);

    await act(async () => { vi.advanceTimersByTime(10_000); });

    expect(container.textContent).toContain(initialJa.slow);
  });

  it('shows a read error directly under the drop area, with a retry that calls onRetry exactly once', async () => {
    const onPickFiles = vi.fn();
    const onRetry = vi.fn();
    await act(async () => {
      root.render(<InitialScreen loading={false} isDragging={false} onPickFiles={onPickFiles} error="読み込めません" onRetry={onRetry} />);
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('読み込めません');
    // The next sibling of the drop area, and not inside it, so the drop area's own click does not also fire.
    expect(container.querySelector('.initial-drop')?.nextElementSibling).toBe(alert);
    expect(container.querySelector('.initial-drop')?.contains(alert)).toBe(false);
    const retry = [...alert!.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === initialJa.retry);
    await act(async () => { retry!.click(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onPickFiles).not.toHaveBeenCalled();
  });

  it('shows no alert without an error', async () => {
    await render(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

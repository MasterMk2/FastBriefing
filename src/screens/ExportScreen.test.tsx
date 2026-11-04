// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import exportJa from '../i18n/locales/ja/export.json';
import settingsJa from '../i18n/locales/ja/settings.json';
import shellJa from '../i18n/locales/ja/shell.json';
import { fixtureMission } from '../export/__tests__/fixture';
import { resetExportScope } from '../export/exportPlan';
import AppShell from '../shell/AppShell';
import type { MissionData } from '../types/mission';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  // The export scope is module state shared by every test that uses the same mission fingerprint.
  resetExportScope();
  await i18nReady;
  // The canvas is not implemented in jsdom; the map reports an error, which the screen shows as text.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
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

async function renderShell(mission: MissionData = fixtureMission(), sourceFile: File | null = null) {
  await act(async () => {
    root.render(
      <SettingsProvider>
        <AppShell
          mission={mission}
          sourceFile={sourceFile}
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

/** Polls until a lazily loaded element appears (the first load of a screen chunk can take a while). */
async function waitForElement(selector: string) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (container.querySelector(selector)) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`not rendered: ${selector}`);
}

async function openExport() {
  await act(async () => {
    navButton(shellJa.nav.export).click();
  });
  await waitForElement('.export-screen');
}

function navButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('.workspace-nav-item'))
    .find(item => item.textContent === label);
  if (!button) throw new Error(`nav item not found: ${label}`);
  return button;
}

function headerButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('.shell-view button'))
    .find(item => item.textContent === label);
  if (!button) throw new Error(`view button not found: ${label}`);
  return button;
}

function buttonByText(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent?.trim() === label);
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

/** A button in the left plan column (the export screen's own controls, not the shell). */
function planButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('.export-plan button'))
    .find(item => item.textContent?.trim() === label);
  if (!button) throw new Error(`plan button not found: ${label}`);
  return button;
}

/** Labels of the side choice, shown only after the target "陣営" is picked. */
function sideButtons(): string[] {
  const group = container.querySelector('.export-plan [role="group"][aria-label="陣営"]');
  return Array.from(group?.querySelectorAll('button') ?? []).map(item => item.textContent?.trim() ?? '');
}

/** The section-list row whose label is `label`. */
function sectionRow(label: string): HTMLLIElement {
  const row = Array.from(container.querySelectorAll<HTMLLIElement>('.export-section-row'))
    .find(item => item.querySelector('label > span')?.textContent === label);
  if (!row) throw new Error(`section row not found: ${label}`);
  return row;
}

describe('print document (P3, always mounted)', { timeout: 60_000 }, () => {
  it('mounts the printable document on every screen, not only on the export screen', async () => {
    await renderShell();
    expect(container.querySelector('.print-briefing .print-document')).not.toBeNull();
    expect(container.querySelector('.print-map-blocked-message')).toBeNull();
  });
});

describe('export screen', { timeout: 60_000 }, () => {
  it('shows the six format cards with the print action', async () => {
    await renderShell();
    await openExport();
    expect(container.querySelector('.export-screen')).not.toBeNull();
    expect(container.querySelectorAll('.export-card')).toHaveLength(6);
    expect(buttonByText('印刷する').disabled).toBe(false);
  });

  it('disables the .miz embed when no source file is loaded', async () => {
    await renderShell();
    await openExport();
    expect(buttonByText('.miz に入れて保存').disabled).toBe(true);
    expect(container.textContent).toContain('元のミッションファイルがありません');
  });

  it('disables the .miz embed in pilot view even with a source file, and enables it in creator view (D1)', async () => {
    await renderShell(fixtureMission(), new File(['not a real miz'], 'Export Test.miz'));
    await openExport();
    expect(buttonByText('.miz に入れて保存').disabled).toBe(true);
    expect(container.textContent).toContain('パイロット表示では .miz に入れられません');
    await act(async () => {
      headerButton('作成者').click();
    });
    expect(buttonByText('.miz に入れて保存').disabled).toBe(false);
  });

  it('offers no threat section and says why in pilot view, and offers it in creator view (D1)', async () => {
    await renderShell();
    await openExport();
    expect(sectionRow('脅威').querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    expect(sectionRow('脅威').textContent).toContain('パイロット表示では脅威を出せません');
    await act(async () => {
      headerButton('作成者').click();
    });
    expect(sectionRow('脅威').querySelector<HTMLInputElement>('input')?.disabled).toBe(false);
    expect(sectionRow('脅威').textContent).not.toContain('パイロット表示では脅威を出せません');
  });

  it('offers only the displayed side as a target side in pilot view (D1)', async () => {
    await renderShell();
    await openExport();
    await act(async () => {
      planButton('陣営').click();
    });
    expect(sideButtons()).toHaveLength(1);
    await act(async () => {
      headerButton('作成者').click();
    });
    expect(sideButtons()).toEqual([shellJa.side.blue, shellJa.side.red]);
  });

  it('keeps the Markdown preview free of the other side and the threats in pilot view (D1)', async () => {
    await renderShell();
    await openExport();
    // The default view is the pilot view; the creator view shows the other side.
    await act(async () => {
      headerButton('作成者').click();
    });
    const creatorPreview = container.querySelector('.export-markdown')?.textContent ?? '';
    expect(creatorPreview).toContain('Bandit 1');

    await act(async () => {
      headerButton('パイロット').click();
    });
    const pilotPreview = container.querySelector('.export-markdown')?.textContent ?? '';
    expect(pilotPreview).toContain('Viper 1');
    expect(pilotPreview).not.toContain('Bandit 1');
    expect(pilotPreview).not.toContain('SA-10');
    expect(pilotPreview).not.toContain('Secret pilot');
  });

  it('disables the print and the PNG actions when no section is selected, and says why once', async () => {
    await renderShell();
    await openExport();
    // Threats cannot be unticked in pilot view, so clear the selection in creator view.
    await act(async () => {
      headerButton('作成者').click();
    });
    const sectionBoxes = Array.from(container.querySelectorAll<HTMLInputElement>('.export-section-list input[type="checkbox"]'));
    for (const box of sectionBoxes) {
      if (box.checked) {
        await act(async () => box.click());
      }
    }
    expect(buttonByText('印刷する').disabled).toBe(true);
    expect(buttonByText('PNG を作る').disabled).toBe(true);
    // The message is shown once, at the top of the screen.
    expect(container.textContent?.split('節を 1 つ以上選んでください').length).toBe(2);
  });

  it('blocks the output in pilot view when threats are the only section, and says why (D1)', async () => {
    await renderShell();
    await openExport();
    const sectionBoxes = Array.from(container.querySelectorAll<HTMLInputElement>('.export-section-list input[type="checkbox"]'));
    for (const box of sectionBoxes) {
      if (box.checked && !box.disabled) {
        await act(async () => box.click());
      }
    }
    expect(sectionRow('脅威').querySelector<HTMLInputElement>('input')?.checked).toBe(true);
    expect(buttonByText('印刷する').disabled).toBe(true);
    expect(container.textContent).toContain('パイロット表示では脅威を出せないため');
  });
});

/** Sets a text input the way a user does, so React sees the change. */
async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('export screen actions', { timeout: 60_000 }, () => {
  it('saves a preset, applies it after the sections change, and deletes it', async () => {
    await renderShell();
    await openExport();
    const nameInput = container.querySelector<HTMLInputElement>('.export-preset-save input');
    if (!nameInput) throw new Error('preset name input not rendered');
    await typeInto(nameInput, 'Strike');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.export-preset-save button')?.click();
    });
    expect(container.querySelector('.export-preset-list')?.textContent).toContain('Strike');

    await act(async () => {
      sectionRow('通信').querySelector<HTMLInputElement>('input')?.click();
    });
    expect(sectionRow('通信').querySelector<HTMLInputElement>('input')?.checked).toBe(false);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Strike 適用"]')?.click();
    });
    expect(sectionRow('通信').querySelector<HTMLInputElement>('input')?.checked).toBe(true);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Strike 削除"]')?.click();
    });
    expect(container.querySelector('.export-preset-list')?.textContent).not.toContain('Strike');
  });

  it('says so when a preset or a section change cannot be stored, instead of "saved" (i18n-state-4)', async () => {
    await renderShell();
    await openExport();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      const nameInput = container.querySelector<HTMLInputElement>('.export-preset-save input');
      if (!nameInput) throw new Error('preset name input not rendered');
      await typeInto(nameInput, 'Strike');
      await act(async () => {
        container.querySelector<HTMLButtonElement>('.export-preset-save button')?.click();
      });
      expect(container.textContent).toContain(exportJa.ui.presetUnsaved);
      expect(container.textContent).not.toContain(exportJa.ui.presetSaved);

      await act(async () => {
        sectionRow('通信').querySelector<HTMLInputElement>('input')?.click();
      });
      expect(container.textContent).toContain(settingsJa.unsaved);
    } finally {
      setItem.mockRestore();
    }
  });

  it('moves a section up and down in the order of the output', async () => {
    await renderShell();
    await openExport();
    const firstLabel = () => container.querySelector('.export-section-row label > span')?.textContent;
    expect(firstLabel()).toBe('概要');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="天候 上へ"]')?.click();
    });
    expect(firstLabel()).toBe('天候');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="天候 下へ"]')?.click();
    });
    expect(firstLabel()).toBe('概要');
  });

  it('copies the Markdown to the clipboard and marks its card as the selected one', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderShell();
    await openExport();
    await act(async () => {
      buttonByText('コピーする').click();
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Export Test'));
    expect(container.textContent).toContain('コピーしました');
    expect(container.querySelector('.export-card.is-selected h3')?.textContent).toBe('Markdown');
  });

  it('saves the Markdown as a .md file', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:markdown-test');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    await renderShell();
    await openExport();
    await act(async () => {
      buttonByText('.md で保存').click();
    });
    const saved = createObjectURL.mock.calls[0]?.[0];
    expect(saved?.type).toBe('text/markdown');
    expect(container.textContent).toContain('保存しました');
  });

  it('opens the print preview on the page and closes it again', async () => {
    await renderShell();
    await openExport();
    await act(async () => {
      buttonByText('印刷プレビュー').click();
    });
    expect(document.documentElement.dataset.printPreview).toBe('on');
    expect(container.querySelector('.print-preview-bar')).not.toBeNull();
    await act(async () => {
      buttonByText('閉じる').click();
    });
    expect(document.documentElement.dataset.printPreview).toBeUndefined();
    expect(container.querySelector('.print-preview-bar')).toBeNull();
  });

  it('moves focus into the print preview, keeps the screen behind it out of focus, and returns focus when it closes', async () => {
    await renderShell();
    await openExport();
    // Stands for what App mounts outside the shell (the hidden file inputs, the error band): it is covered too (A11Y-3).
    const outside = document.createElement('button');
    document.body.append(outside);
    const previewButton = buttonByText('印刷プレビュー');
    await act(async () => {
      previewButton.click();
    });
    const printInBar = container.querySelector<HTMLButtonElement>('.print-preview-bar .btn-primary');
    expect(printInBar).not.toBeNull();
    expect(document.activeElement).toBe(printInBar);
    expect(container.querySelector('.export-formats')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.export-plan')?.hasAttribute('inert')).toBe(true);
    // The bar itself stays usable.
    expect(container.querySelector('.print-preview-bar')?.hasAttribute('inert')).toBe(false);
    expect(outside.hasAttribute('inert')).toBe(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.print-preview-bar')).toBeNull();
    expect(container.querySelector('.export-formats')?.hasAttribute('inert')).toBe(false);
    expect(outside.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(previewButton);
    outside.remove();
  });

  it('closes the settings drawer and the "その他" sheet when the preview opens, and one Escape closes the preview only (A11Y-7)', async () => {
    await renderShell();
    await openExport();
    await act(async () => { document.getElementById('shell-settings-trigger')?.click(); });
    await act(async () => { buttonByText(shellJa.nav.more).click(); });
    expect(container.querySelector('.settings-drawer')).not.toBeNull();
    expect(container.querySelector('.bottom-sheet')).not.toBeNull();

    const previewButton = buttonByText(exportJa.ui.printPreview);
    await act(async () => { previewButton.click(); });
    expect(container.querySelector('.print-preview-bar')).not.toBeNull();
    expect(container.querySelector('.settings-drawer')).toBeNull();
    expect(container.querySelector('.bottom-sheet')).toBeNull();

    // A keyboard Escape reaches the document listeners (file menu, sheet) and then the window ones (drawer).
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => { document.body.dispatchEvent(escape); });
    expect(escape.defaultPrevented).toBe(true);
    expect(container.querySelector('.print-preview-bar')).toBeNull();
    expect(container.querySelector('.settings-drawer')).toBeNull();
    expect(container.querySelector('.bottom-sheet')).toBeNull();
    expect(document.activeElement).toBe(previewButton);
  });

  it('returns focus to the preview button when the close button is used', async () => {
    await renderShell();
    await openExport();
    const previewButton = buttonByText('印刷プレビュー');
    await act(async () => {
      previewButton.click();
    });
    await act(async () => {
      buttonByText('閉じる').click();
    });
    expect(document.activeElement).toBe(previewButton);
  });
});

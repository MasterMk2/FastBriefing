// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import exportJa from '../i18n/locales/ja/export.json';
import { fixtureMission } from '../export/__tests__/fixture';
import { resetExportScope } from '../export/exportPlan';
import { MissionProvider } from '../shell/MissionContext';
import { WorkspaceProvider } from '../shell/workspace';
import type { MissionData } from '../types/mission';
import ExportScreen from './ExportScreen';

/** The page count the screen estimates. The renderer's own counting is replaced for these tests. */
const counted = vi.hoisted(() => ({ pages: 0 }));

vi.mock('../utils/kneeboardRenderer', async importOriginal => {
  const actual = await importOriginal<typeof import('../utils/kneeboardRenderer')>();
  return { ...actual, countKneeboardPages: () => counted.pages };
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const mission: MissionData = fixtureMission();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  resetExportScope();
  await i18nReady;
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

async function renderScreen(pages: number) {
  counted.pages = pages;
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
            <ExportScreen />
          </WorkspaceProvider>
        </MissionProvider>
      </SettingsProvider>,
    );
  });
}

function pngButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent === exportJa.ui.kneeboardMake);
  if (!button) throw new Error('PNG button not found');
  return button;
}

function widthButton(width: number): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent === String(width));
  if (!button) throw new Error(`width button not found: ${width}`);
  return button;
}

function kneeboardReason(): string {
  return container.querySelector('#export-card-kneeboard')?.closest('section')?.querySelector('.field-reason')?.textContent ?? '';
}

describe('kneeboard page and pixel limits are shown on the export screen (SPEC 1.3, F9)', () => {
  it('says the page limit and does not offer the PNG when there are more pages than the limit', async () => {
    await renderScreen(65);
    expect(kneeboardReason()).toContain('64 ページ');
    expect(pngButton().disabled).toBe(true);
  });

  it('suggests the largest width that fits when the pixel limit is exceeded at the chosen width', async () => {
    await renderScreen(22);
    await act(async () => {
      widthButton(3072).click();
    });
    expect(kneeboardReason()).toContain('2048 px');
    expect(pngButton().disabled).toBe(true);
  });

  it('says that a smaller width does not help when no width fits the pixel limit', async () => {
    await renderScreen(45);
    expect(kneeboardReason()).toContain('ページを減らしてください');
    expect(kneeboardReason()).toContain('幅を下げても作れません');
    expect(pngButton().disabled).toBe(true);
  });
});

// Test harness for screen tests: mounts a screen inside the same providers as the shell
// (settings, mission, workspace) and exposes the workspace state for assertions. Not used by the app.
import { act, useEffect, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsProvider } from '../hooks/useSettings';
import { SETTINGS_STORAGE_KEY, i18nReady } from '../i18n';
import { MissionProvider } from '../shell/MissionContext';
import { useWorkspace, WorkspaceProvider, type WorkspaceValue } from '../shell/workspace';
import type { MissionData } from '../types/mission';

export interface MountedScreen {
  container: HTMLDivElement;
  /** The workspace as of the last render (screen, flightKey, ...). */
  workspace: () => WorkspaceValue | null;
  /** Text of the whole container, as a user would read it. */
  text: () => string;
  /** Click the first button whose text matches exactly. */
  click: (label: string) => Promise<void>;
  /** Click the button of a named group (Segmented) whose text matches exactly. */
  clickInGroup: (groupLabel: string, label: string) => Promise<void>;
  unmount: () => Promise<void>;
}

function WorkspaceProbe({ onValue }: { onValue: (value: WorkspaceValue) => void }) {
  const workspace = useWorkspace();
  useEffect(() => {
    onValue(workspace);
  });
  return null;
}

export async function mountScreen(
  element: ReactElement,
  mission: MissionData,
  viewMode: 'creator' | 'pilot',
): Promise<MountedScreen> {
  await i18nReady;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ settingsVersion: 5, viewMode }));

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let latest: WorkspaceValue | null = null;

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
            <WorkspaceProbe onValue={value => { latest = value; }} />
            {element}
          </WorkspaceProvider>
        </MissionProvider>
      </SettingsProvider>,
    );
  });

  const buttons = (): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>('button')];

  return {
    container,
    workspace: () => latest,
    text: () => container.textContent ?? '',
    click: async (label: string) => {
      const button = buttons().find(item => item.textContent?.trim() === label);
      if (!button) throw new Error(`button not found: ${label}`);
      await act(async () => { button.click(); });
    },
    clickInGroup: async (groupLabel: string, label: string) => {
      const group = container.querySelector(`[role="group"][aria-label="${groupLabel}"]`);
      const button = [...(group?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
        .find(item => item.textContent?.trim() === label);
      if (!button) throw new Error(`button not found in ${groupLabel}: ${label}`);
      await act(async () => { button.click(); });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    },
  };
}

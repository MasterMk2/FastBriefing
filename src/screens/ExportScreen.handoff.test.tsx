// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../hooks/useSettings';
import { i18nReady } from '../i18n';
import { fixtureMission } from '../export/__tests__/fixture';
import { readExportScope, resetExportScope } from '../export/exportPlan';
import { MissionProvider } from '../shell/MissionContext';
import { EXPORT_FLIGHT_ANCHOR, WorkspaceProvider, useWorkspace } from '../shell/workspace';
import type { MissionData } from '../types/mission';
import ExportScreen from './ExportScreen';

let workspace: ReturnType<typeof useWorkspace> | null = null;

function Probe() {
  workspace = useWorkspace();
  return null;
}

/** Sends the flight screen's "この資料を作る" once, as the flight screen does. */
function Handoff({ flightKey, clearFirst }: { flightKey: string | null | undefined; clearFirst: boolean }) {
  const ws = useWorkspace();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (clearFirst) ws.setFlightKey(null);
    ws.jumpTo('export', { flightKey: flightKey ?? undefined, anchor: EXPORT_FLIGHT_ANCHOR });
  }, [clearFirst, flightKey, ws]);
  return null;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const mission: MissionData = fixtureMission();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  resetExportScope();
  await i18nReady;
  workspace = null;
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

async function renderWithHandoff(flightKey: string | null | undefined, clearFirst = false) {
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
            <Handoff flightKey={flightKey} clearFirst={clearFirst} />
            <ExportScreen />
          </WorkspaceProvider>
        </MissionProvider>
      </SettingsProvider>,
    );
  });
}

describe('export screen receives "この資料を作る" from the flight screen (export:flight)', () => {
  it('makes the chosen flight the export target and consumes the anchor', async () => {
    await renderWithHandoff('blue:1');
    expect(readExportScope(mission.sourceFingerprint)).toEqual({ kind: 'flights', flightKeys: ['blue:1'] });
    expect(workspace?.focusAnchor).toBeNull();
  });

  it('uses the flight the workspace chooses when the requested one is not in the displayed view, the same rule as the flight screen', async () => {
    // The pilot view (the default) shows only blue, so the red flight is not in the view. The workspace
    // then chooses its default (a blue flight), and the export target follows that choice.
    await renderWithHandoff('red:3');
    expect(workspace?.flightKey).toBe('blue:1');
    expect(readExportScope(mission.sourceFingerprint)).toEqual({ kind: 'flights', flightKeys: ['blue:1'] });
    expect(workspace?.focusAnchor).toBeNull();
  });

  it('keeps the target as it was when no flight is chosen, and still consumes the anchor', async () => {
    await renderWithHandoff(undefined, true);
    expect(workspace?.flightKey).toBeNull();
    expect(readExportScope(mission.sourceFingerprint).kind).toBe('mission');
    expect(workspace?.focusAnchor).toBeNull();
  });
});

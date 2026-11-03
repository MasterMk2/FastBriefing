// Owner: P0 (土台). Application frame (SPEC 1.1): header (52px), left rail (240px, 1280px and wider),
// bottom tabs (under 1280px), main area, print document, settings drawer.
// The header controls (side, view) are wired here; the screens are not.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoadedRevision } from '../components/RevisionComparison';
import { getMissionWhiteboardId } from '../hooks/useWhiteboard';
import { useSettings } from '../hooks/useSettings';
import InitialScreen from '../screens/InitialScreen';
import type { MissionData, Side, UserNotes } from '../types/mission';
import PrintDocument from '../export/printDocument';
import { useExportModel } from '../export/useExportModel';
import { BottomTabs } from './BottomTabs';
import FileMenu from './FileMenu';
import { FlightRail } from './FlightRail';
import { MissionProvider, useMission } from './MissionContext';
import { ScreenHost } from './screens';
import SettingsDrawer from './SettingsDrawer';
import { Segmented } from './Segmented';
import { WorkspaceNav } from './WorkspaceNav';
import { WorkspaceProvider, useWorkspace } from './workspace';

export interface AppShellProps {
  mission: MissionData | null;
  sourceFile: File | null;
  storageFailed: boolean;
  revisions: [LoadedRevision, LoadedRevision] | null;
  loading: boolean;
  isDragging: boolean;
  onNotesChange: (notes: UserNotes) => void;
  onPickFiles: () => void;
  onCloseRevisions: () => void;
  onCloseMission: () => void;
}

export default function AppShell({
  mission,
  sourceFile,
  storageFailed,
  revisions,
  loading,
  isDragging,
  onNotesChange,
  onPickFiles,
  onCloseRevisions,
  onCloseMission,
}: AppShellProps) {
  if (!mission) {
    return (
      <InitialShell
        loading={loading}
        isDragging={isDragging}
        onPickFiles={onPickFiles}
        onCloseMission={onCloseMission}
      />
    );
  }

  return (
    <div className="shell">
      <MissionProvider
        key={getMissionWhiteboardId(mission)}
        mission={mission}
        sourceFile={sourceFile}
        storageFailed={storageFailed}
        revisions={revisions}
        onNotesChange={onNotesChange}
        onCloseRevisions={onCloseRevisions}
      >
        <WorkspaceProvider>
          <MissionShell onPickFiles={onPickFiles} onCloseMission={onCloseMission} />
        </WorkspaceProvider>
      </MissionProvider>
    </div>
  );
}

/**
 * Shell before a mission is open. Language and theme stay reachable here (the old
 * header had them), so the display settings drawer is available without a mission.
 */
function InitialShell({ loading, isDragging, onPickFiles, onCloseMission }: {
  loading: boolean;
  isDragging: boolean;
  onPickFiles: () => void;
  onCloseMission: () => void;
}) {
  const { t } = useTranslation('shell');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = () => {
    setSettingsOpen(false);
    document.getElementById('shell-settings-trigger')?.focus();
  };

  return (
    <div className="shell shell-initial">
      <header className="shell-header">
        <span className="shell-app-name">{t('shell:app.name')}</span>
        <div className="shell-header-actions">
          <FileMenu hasMission={false} onOpen={onPickFiles} onCompare={onPickFiles} onClose={onCloseMission} />
          <button
            id="shell-settings-trigger"
            type="button"
            className="btn btn-secondary"
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen(true)}
          >
            {t('shell:header.settings')}
          </button>
        </div>
      </header>
      <div className="shell-frame shell-frame-initial">
        <main id="main" className="shell-main" tabIndex={-1}>
          <InitialScreen loading={loading} isDragging={isDragging} onPickFiles={onPickFiles} />
        </main>
      </div>
      <SettingsDrawer open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}

function MissionShell({ onPickFiles, onCloseMission }: { onPickFiles: () => void; onCloseMission: () => void }) {
  const { settingsOpen, setSettingsOpen } = useWorkspace();
  const closeSettings = () => {
    setSettingsOpen(false);
    document.getElementById('shell-settings-trigger')?.focus();
  };

  return (
    <>
      <ShellHeader onPickFiles={onPickFiles} onCloseMission={onCloseMission} />
      <div className="shell-frame">
        <aside className="shell-rail">
          <WorkspaceNav />
          <FlightRail />
        </aside>
        <main id="main" className="shell-main" tabIndex={-1}>
          <ScreenHost />
        </main>
      </div>
      <BottomTabs
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFiles={onPickFiles}
        onCloseMission={onCloseMission}
      />
      <PrintHost />
      <SettingsDrawer open={settingsOpen} onClose={closeSettings} />
    </>
  );
}

function ShellHeader({ onPickFiles, onCloseMission }: { onPickFiles: () => void; onCloseMission: () => void }) {
  const { t } = useTranslation('shell');
  const { mission, side, sourceFile, viewMode } = useMission();
  const { setSide, setViewMode } = useSettings();
  const { setScreen, setSettingsOpen } = useWorkspace();
  const sideOptions: { value: Side; label: string }[] = [
    { value: 'blue', label: t('shell:side.blue') },
    { value: 'red', label: t('shell:side.red') },
  ];

  return (
    <header className="shell-header">
      <div className="shell-header-title" title={mission.meta.sortie}>
        <span className="shell-app-name">{t('shell:app.name')}</span>
        <span className="shell-mission-name">{mission.meta.sortie}</span>
        {sourceFile && <span className="shell-file-name" title={sourceFile.name}>{sourceFile.name}</span>}
      </div>
      <div className="shell-header-controls">
        <Segmented
          className="shell-side"
          label={t('shell:header.side')}
          value={side}
          options={sideOptions}
          onChange={value => setSide(value)}
        />
        <Segmented
          className="shell-view"
          label={t('shell:header.view')}
          value={viewMode}
          options={[
            { value: 'creator', label: t('shell:view.creator') },
            { value: 'pilot', label: t('shell:view.pilot') },
          ]}
          onChange={value => setViewMode(value)}
        />
        <span className="shell-view-hint">{t('shell:header.viewHint')}</span>
      </div>
      <div className="shell-header-actions">
        <FileMenu
          hasMission
          onOpen={onPickFiles}
          onCompare={onPickFiles}
          onClose={onCloseMission}
        />
        <button type="button" className="btn btn-primary" onClick={() => setScreen('briefing')}>
          {t('shell:header.start')}
        </button>
        <button
          id="shell-settings-trigger"
          type="button"
          className="btn btn-secondary"
          aria-haspopup="dialog"
          onClick={() => setSettingsOpen(true)}
        >
          {t('shell:header.settings')}
        </button>
      </div>
    </header>
  );
}

/**
 * The printable briefing (P3). It is always mounted and hidden on screen, so Ctrl+P
 * from any screen prints the export plan. Maps that are not drawn yet print as
 * "準備中", so printing is never blocked (SPEC 5.1, F9).
 */
function PrintHost() {
  const { reportPrintMapState } = useWorkspace();
  const { model, title, viewLabel, outT } = useExportModel();

  return (
    <div className="print-briefing">
      <PrintDocument
        pages={model.pages}
        title={title}
        viewLabel={viewLabel}
        t={outT}
        onMapStateChange={reportPrintMapState}
      />
    </div>
  );
}

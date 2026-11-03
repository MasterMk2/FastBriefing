// Owner: P0 (土台). Application frame (SPEC 1.1): header (52px), left rail (240px, 1280px and wider),
// bottom tabs (under 1280px), main area, print document (src/export/PrintHost.tsx), settings drawer.
// The header controls (side, view) are wired here; the screens are not.
// While the verbal briefing is open, the shell chrome (header, rail, main, bottom tabs) is inert, and the
// briefing is drawn in a full-screen layer outside the chrome, so it stays usable.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoadedRevision } from '../components/RevisionComparison';
import { getMissionWhiteboardId } from '../hooks/useWhiteboard';
import { useSettings } from '../hooks/useSettings';
import InitialScreen from '../screens/InitialScreen';
import type { MissionData, Side, UserNotes } from '../types/mission';
import PrintHost from '../export/PrintHost';
import { BottomTabs } from './BottomTabs';
import FileMenu from './FileMenu';
import { FlightRail } from './FlightRail';
import { MissionProvider, useMission } from './MissionContext';
import { ScreenHost } from './screens';
import SettingsDrawer from './SettingsDrawer';
import { Segmented } from './Segmented';
import { WorkspaceNav } from './WorkspaceNav';
import { WorkspaceProvider, useWorkspace } from './workspace';
import { inertOutside } from './inert';

export interface AppShellProps {
  mission: MissionData | null;
  sourceFile: File | null;
  storageFailed: boolean;
  revisions: [LoadedRevision, LoadedRevision] | null;
  loading: boolean;
  isDragging: boolean;
  onNotesChange: (notes: UserNotes) => void;
  onPickFiles: () => void;
  /**
   * Opens the input for the old version of a comparison (F10). It never replaces the open mission.
   * Optional so that a render without the comparison input (tests of other packages) still compiles; App always passes it.
   */
  onCompare?: () => void;
  onCloseRevisions: () => void;
  onCloseMission: () => void;
  /**
   * A failed read while no mission is open (already translated). The initial screen shows it under the drop
   * area (SPEC 3). App passes it only in that state, so it is never shown twice.
   */
  initialError?: string | null;
  /** Chooses another file after a failed first read. Required with initialError. */
  onRetryInitial?: () => void;
}

/** Full-screen layer for the verbal briefing: outside the shell chrome, above it. Inline because the frame CSS is shared. */
const BRIEFING_LAYER_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 50,
  overflow: 'auto',
  background: 'var(--surface-0)',
  color: 'var(--text)',
};

const noop = () => {};

export default function AppShell({
  mission,
  sourceFile,
  storageFailed,
  revisions,
  loading,
  isDragging,
  onNotesChange,
  onPickFiles,
  onCompare = noop,
  onCloseRevisions,
  onCloseMission,
  initialError = null,
  onRetryInitial = onPickFiles,
}: AppShellProps) {
  if (!mission) {
    return (
      <InitialShell
        loading={loading}
        isDragging={isDragging}
        onPickFiles={onPickFiles}
        onCompare={onCompare}
        onCloseMission={onCloseMission}
        error={initialError}
        onRetry={onRetryInitial}
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
          <MissionShell onPickFiles={onPickFiles} onCompare={onCompare} onCloseMission={onCloseMission} />
        </WorkspaceProvider>
      </MissionProvider>
    </div>
  );
}

/**
 * Shell before a mission is open. Language and theme stay reachable here (the old
 * header had them), so the display settings drawer is available without a mission.
 */
function InitialShell({ loading, isDragging, onPickFiles, onCompare, onCloseMission, error, onRetry }: {
  loading: boolean;
  isDragging: boolean;
  onPickFiles: () => void;
  onCompare: () => void;
  onCloseMission: () => void;
  error: string | null;
  onRetry: () => void;
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
          <FileMenu hasMission={false} onOpen={onPickFiles} onCompare={onCompare} onClose={onCloseMission} />
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
          <InitialScreen loading={loading} isDragging={isDragging} onPickFiles={onPickFiles} error={error} onRetry={onRetry} />
        </main>
      </div>
      <SettingsDrawer open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}

/** The header button that opens the oral briefing; the focus returns to it when the briefing ends. */
const BRIEFING_TRIGGER_ID = 'shell-briefing-trigger';

function MissionShell({ onPickFiles, onCompare, onCloseMission }: {
  onPickFiles: () => void;
  onCompare: () => void;
  onCloseMission: () => void;
}) {
  const { settingsOpen, setSettingsOpen, screen } = useWorkspace();
  const briefingOpen = screen === 'briefing';
  const headerRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const wasBriefingOpen = useRef(false);

  // While the briefing covers the page, everything outside its layer is inert: the shell chrome, and also the
  // hidden file inputs, the error band, the bottom sheet and the settings drawer (A11Y-1). The attribute is set on
  // the elements themselves (React 18 has no typed inert prop). The settings drawer is closed, since it would stay
  // hidden under the layer. When the briefing ends, the focus goes back to the button that opened it (A11Y-2).
  useLayoutEffect(() => {
    if (!briefingOpen) {
      if (wasBriefingOpen.current) {
        wasBriefingOpen.current = false;
        document.getElementById(BRIEFING_TRIGGER_ID)?.focus();
      }
      return undefined;
    }
    wasBriefingOpen.current = true;
    setSettingsOpen(false);
    const layer = layerRef.current;
    return layer ? inertOutside(layer) : undefined;
  }, [briefingOpen, setSettingsOpen]);

  const closeSettings = () => {
    setSettingsOpen(false);
    document.getElementById('shell-settings-trigger')?.focus();
  };

  return (
    <>
      <ShellHeader
        headerRef={headerRef}
        onPickFiles={onPickFiles}
        onCompare={onCompare}
        onCloseMission={onCloseMission}
      />
      <div className="shell-frame" ref={frameRef}>
        <aside className="shell-rail">
          <WorkspaceNav />
          <FlightRail />
        </aside>
        <main id="main" className="shell-main" tabIndex={-1}>
          {briefingOpen ? null : <ScreenHost />}
        </main>
      </div>
      {briefingOpen && (
        <div className="shell-briefing-layer" style={BRIEFING_LAYER_STYLE} ref={layerRef}>
          <ScreenHost />
        </div>
      )}
      <BottomTabs
        navRef={tabsRef}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFiles={onPickFiles}
        onCompare={onCompare}
        onCloseMission={onCloseMission}
      />
      <PrintHost />
      <SettingsDrawer open={settingsOpen} onClose={closeSettings} />
    </>
  );
}

function ShellHeader({ headerRef, onPickFiles, onCompare, onCloseMission }: {
  headerRef: RefObject<HTMLElement>;
  onPickFiles: () => void;
  onCompare: () => void;
  onCloseMission: () => void;
}) {
  const { t } = useTranslation('shell');
  const { mission, side, sourceFile, viewMode } = useMission();
  const { setSide, setViewMode } = useSettings();
  const { setScreen, setSettingsOpen } = useWorkspace();
  const sideOptions: { value: Side; label: string }[] = [
    { value: 'blue', label: t('shell:side.blue') },
    { value: 'red', label: t('shell:side.red') },
  ];

  return (
    <header className="shell-header" ref={headerRef}>
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
          onCompare={onCompare}
          onClose={onCloseMission}
        />
        <button id={BRIEFING_TRIGGER_ID} type="button" className="btn btn-primary" onClick={() => setScreen('briefing')}>
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

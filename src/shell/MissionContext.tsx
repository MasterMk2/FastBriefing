import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { DisplaySettings, MissionData, Side, UserNotes } from '../types/mission';
import { useSettings } from '../hooks/useSettings';
import { useWhiteboard } from '../hooks/useWhiteboard';
import type { LoadedRevision } from '../components/RevisionComparison';
import { applyViewMode, resolveSide } from '../utils/viewMode';

/**
 * Everything a screen reads about the loaded mission. Screens never call the
 * parser or the normalizer directly; they read through useMission().
 *
 * - mission: the normalized original (creator data, including hidden items).
 * - view: `mission` after applyViewMode for the current viewMode and side.
 *   New screens read `view`; the components carried over from the old tabs
 *   receive `mission` and filter it themselves, as before.
 * - side: the displayed coalition. settings.side when chosen, else the D2 default.
 */
export interface MissionContextValue {
  mission: MissionData;
  view: MissionData;
  settings: DisplaySettings;
  side: Side;
  viewMode: DisplaySettings['viewMode'];
  notes: UserNotes;
  setNotes: (notes: UserNotes) => void;
  whiteboard: ReturnType<typeof useWhiteboard>;
  sourceFile: File | null;
  /** True when the per-browser store refused a write; notes then stay in memory. */
  storageFailed: boolean;
  revisions: [LoadedRevision, LoadedRevision] | null;
  closeRevisions: () => void;
}

export interface MissionProviderProps {
  mission: MissionData;
  sourceFile: File | null;
  storageFailed: boolean;
  revisions: [LoadedRevision, LoadedRevision] | null;
  onNotesChange: (notes: UserNotes) => void;
  onCloseRevisions: () => void;
  children: ReactNode;
}

const MissionContext = createContext<MissionContextValue | null>(null);

export function MissionProvider({
  mission,
  sourceFile,
  storageFailed,
  revisions,
  onNotesChange,
  onCloseRevisions,
  children,
}: MissionProviderProps) {
  const { settings } = useSettings();
  const whiteboard = useWhiteboard(mission);
  const side = resolveSide(mission, settings.side);
  const view = useMemo(
    () => applyViewMode(mission, settings.viewMode, settings.side),
    [mission, settings.viewMode, settings.side],
  );

  const value: MissionContextValue = {
    mission,
    view,
    settings,
    side,
    viewMode: settings.viewMode,
    notes: mission.userNotes,
    setNotes: onNotesChange,
    whiteboard,
    sourceFile,
    storageFailed,
    revisions,
    closeRevisions: onCloseRevisions,
  };

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}

/** Read the loaded mission. Must be used inside MissionProvider (the shell mounts it only when a mission is open). */
export function useMission(): MissionContextValue {
  const context = useContext(MissionContext);
  if (!context) {
    throw new Error('useMission must be used within a MissionProvider');
  }
  return context;
}

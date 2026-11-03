import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ScreenId } from '../types/screen';
import { useMission } from './MissionContext';
import { shouldResetPrintMapOnExportActivation } from '../utils/printReadiness';
import type { MissionMapRenderState } from '../components/MissionMapCanvas';

export type { ScreenId } from '../types/screen';

/** Annotation tool on the map. Pin and line modes are kept until the user changes them (F12). */
export type MapTool = 'move' | 'pin' | 'line';

/** Map state shared by the map screen and the flight screen's side map (F12). */
export interface MapUi {
  /** Layer visibility by layer id. Missing ids are treated as visible by the map (P2 defines the ids). */
  layers: Record<string, boolean>;
  tool: MapTool;
  /** CSS colour used for new annotations. */
  color: string;
}

export const DEFAULT_MAP_UI: MapUi = {
  layers: { flights: true, support: true, threats: true, zones: true, drawings: true },
  tool: 'move',
  color: '#1f5fbf',
};

export interface WorkspaceValue {
  screen: ScreenId;
  /** Navigate to a screen. Entering the export screen resets the print map to "loading" first. */
  setScreen: (screen: ScreenId) => void;
  /** Selected flight key (see flightKey()). Kept while the user moves between screens. */
  flightKey: string | null;
  setFlightKey: (key: string | null) => void;
  mapUi: MapUi;
  setMapUi: Dispatch<SetStateAction<MapUi>>;
  /** Whether the display settings drawer is open. */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** Print-map readiness for the export screen (see printReadiness.ts). */
  printMapState: MissionMapRenderState;
  reportPrintMapState: (state: MissionMapRenderState) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/**
 * Workspace state that survives screen changes but is dropped when the mission
 * closes (the parent keys this provider by the mission). Mounted inside
 * MissionProvider.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { mission, settings, viewMode, revisions } = useMission();
  const [screen, setScreenState] = useState<ScreenId>('overview');
  const [flightKey, setFlightKey] = useState<string | null>(null);
  const [mapUi, setMapUi] = useState<MapUi>(DEFAULT_MAP_UI);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printMapRender, setPrintMapRender] = useState<{ key: string; state: MissionMapRenderState }>({
    key: '',
    state: 'loading',
  });

  const hasPrintMap = settings.briefingSections.includes('map');
  const printMapKey = `${mission.sourceFingerprint}:${settings.viewMode}:${settings.outputLanguage}`;
  const printMapState: MissionMapRenderState = !hasPrintMap
    ? 'ready'
    : printMapRender.key === printMapKey ? printMapRender.state : 'loading';

  const setScreen = useCallback((next: ScreenId) => {
    if (shouldResetPrintMapOnExportActivation(screen === 'export', next === 'export', hasPrintMap)) {
      setPrintMapRender({ key: printMapKey, state: 'loading' });
    }
    setScreenState(next);
  }, [hasPrintMap, printMapKey, screen]);

  const reportPrintMapState = useCallback((state: MissionMapRenderState) => {
    setPrintMapRender({ key: printMapKey, state });
  }, [printMapKey]);

  // A second file opens the revision comparison (F10).
  useEffect(() => {
    if (revisions) setScreenState('revision');
  }, [revisions]);

  // Threat data is creator-only (D1). Leave the threat screen when switching to pilot view.
  useEffect(() => {
    if (viewMode === 'pilot' && screen === 'threats') setScreenState('overview');
  }, [screen, viewMode]);

  const value = useMemo<WorkspaceValue>(() => ({
    screen,
    setScreen,
    flightKey,
    setFlightKey,
    mapUi,
    setMapUi,
    settingsOpen,
    setSettingsOpen,
    printMapState,
    reportPrintMapState,
  }), [screen, setScreen, flightKey, mapUi, settingsOpen, printMapState, reportPrintMapState]);

  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

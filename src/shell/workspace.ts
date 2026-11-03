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
import type { MissionData, Side } from '../types/mission';
import { flightKey as buildFlightKey, parseFlightKey } from '../utils/flightKey';
import { useWingmanSlot } from '../utils/wingmanSlot';
import type { WingmanSlot } from '../utils/wingmanSlot';
import { useMission } from './MissionContext';

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
  /** Flight shown alone on the map ("この機だけ地図に", T12). null shows every flight. Cleared when the flight leaves the view. */
  soloFlightKey: string | null;
}

export const DEFAULT_MAP_UI: MapUi = {
  layers: { flights: true, support: true, threats: true, zones: true, drawings: true },
  tool: 'move',
  color: '#1f5fbf',
  soloFlightKey: null,
};

/** A route point picked in the route table. The map marks it; the view is not refitted. */
export interface RouteFocus {
  flightKey: string;
  routeIndex: number;
}

/** Options of jumpTo(). Without an anchor the focus anchor is cleared. */
export interface JumpOptions {
  flightKey?: string;
  anchor?: string;
}

export interface WorkspaceValue {
  screen: ScreenId;
  /**
   * Navigate to a screen. Clears the focus anchor. The screen the user leaves is kept as previousScreen
   * (not updated when the screen does not change).
   */
  setScreen: (screen: ScreenId) => void;
  /** The screen before the current one (the briefing returns here when it ends). null before any navigation. */
  previousScreen: ScreenId | null;
  /** Navigate to a screen, select a flight and set a focus anchor in one step (the anchor formats are in parseFocusAnchor). */
  jumpTo: (screen: ScreenId, options?: JumpOptions) => void;
  /** Anchor the target screen should scroll to, select and focus once, then clear with clearFocusAnchor(). */
  focusAnchor: string | null;
  clearFocusAnchor: () => void;
  /**
   * Selected flight (flightKey() value), or null when the user chose "none". Before any choice, and after the
   * selected flight leaves the view (side or view mode change), the saved wingman flight or else the own side's first flight.
   */
  flightKey: string | null;
  setFlightKey: (key: string | null) => void;
  routeFocus: RouteFocus | null;
  setRouteFocus: (focus: RouteFocus | null) => void;
  mapUi: MapUi;
  setMapUi: Dispatch<SetStateAction<MapUi>>;
  /** Whether the display settings drawer is open. */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** Whether a flight key names a flight of the view (any coalition, including neutral). */
function hasFlight(view: MissionData, key: string): boolean {
  const parsed = parseFlightKey(key);
  if (!parsed) return false;
  return view.coalitions[parsed.side].flights.some(flight => flight.groupId === parsed.groupId);
}

/** The saved wingman flight, when it was saved for this mission and is in the view. */
function wingmanFlightKey(view: MissionData, slot: WingmanSlot | null): string | null {
  const missionKey = view.userNotes.missionKey;
  if (!slot || missionKey === '' || slot.missionKey !== missionKey) return null;
  return hasFlight(view, slot.flightKey) ? slot.flightKey : null;
}

/** The default selection (T7): the wingman flight, else the first flight of the displayed side, else none. */
function defaultFlightKey(view: MissionData, side: Side, wingman: string | null): string | null {
  if (wingman !== null) return wingman;
  const first = view.coalitions[side].flights[0];
  return first ? buildFlightKey(side, first.groupId) : null;
}

/** Anchor for one route point of a flight: route:<flightKey>:<point index>. */
export function routeAnchor(key: string, pointIndex: number): string {
  return `route:${key}:${pointIndex}`;
}

/** Anchor for one support asset of a coalition: support:<side>:<index in the coalition's support list>. */
export function supportAnchor(side: Side, index: number): string {
  return `support:${side}:${index}`;
}

/** Anchor for one AI group of a coalition: threats:<side>:<index in the coalition's aiGroups>. */
export function threatsAnchor(side: Side, index: number): string {
  return `threats:${side}:${index}`;
}

/** Anchor the export screen reads: the chosen flight becomes the export target (F9). */
export const EXPORT_FLIGHT_ANCHOR = 'export:flight';

/**
 * Parsed form of a focus anchor. A frequency conflict anchor is built by conflictAnchor() in
 * src/analysis/frequencyConflicts.ts: comms:conflict:<AM|FM>:<MHz with three decimals>.
 */
export type FocusTarget =
  | { kind: 'route'; flightKey: string; index: number }
  | { kind: 'support'; side: Side; index: number }
  | { kind: 'threats'; side: Side; index: number }
  | { kind: 'comms-conflict'; modulation: 'AM' | 'FM'; frequencyMHz: string }
  | { kind: 'export-flight' };

const ROUTE_ANCHOR = /^route:((?:blue|red|neutral):\d+):(\d+)$/;
const SIDE_ANCHOR = /^(support|threats):(blue|red):(\d+)$/;
const CONFLICT_ANCHOR = /^comms:conflict:(AM|FM):(\d+\.\d{3})$/;

/** Reads an anchor string. Anything that is not one of the formats above returns null. */
export function parseFocusAnchor(anchor: string): FocusTarget | null {
  if (anchor === EXPORT_FLIGHT_ANCHOR) return { kind: 'export-flight' };
  const route = ROUTE_ANCHOR.exec(anchor);
  if (route) return { kind: 'route', flightKey: route[1], index: Number(route[2]) };
  const side = SIDE_ANCHOR.exec(anchor);
  if (side) {
    const target = { side: side[2] as Side, index: Number(side[3]) };
    return side[1] === 'support' ? { kind: 'support', ...target } : { kind: 'threats', ...target };
  }
  const conflict = CONFLICT_ANCHOR.exec(anchor);
  if (conflict) return { kind: 'comms-conflict', modulation: conflict[1] as 'AM' | 'FM', frequencyMHz: conflict[2] };
  return null;
}

/**
 * Workspace state that survives screen changes but is dropped when the mission
 * closes (the parent keys this provider by the mission). Mounted inside
 * MissionProvider.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { view, side, viewMode, revisions } = useMission();
  const wingman = useWingmanSlot();
  const wingmanKey = wingmanFlightKey(view, wingman);
  const fallbackKey = defaultFlightKey(view, side, wingmanKey);

  const [nav, setNav] = useState<{ screen: ScreenId; previous: ScreenId | null }>({ screen: 'overview', previous: null });
  const [focusAnchor, setFocusAnchor] = useState<string | null>(null);
  // undefined: the user has not chosen yet (the default applies). null: the user chose none. A string: the chosen flight.
  const [selection, setSelection] = useState<string | null | undefined>(undefined);
  const [routeFocus, setRouteFocusState] = useState<RouteFocus | null>(null);
  const [mapUi, setMapUi] = useState<MapUi>(DEFAULT_MAP_UI);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const navigate = useCallback((next: ScreenId, anchor: string | null) => {
    setNav(current => (current.screen === next ? current : { screen: next, previous: current.screen }));
    setFocusAnchor(anchor);
  }, []);

  const setScreen = useCallback((next: ScreenId) => navigate(next, null), [navigate]);

  const jumpTo = useCallback((next: ScreenId, options: JumpOptions = {}) => {
    if (options.flightKey !== undefined) setSelection(options.flightKey);
    navigate(next, options.anchor ?? null);
  }, [navigate]);

  const clearFocusAnchor = useCallback(() => setFocusAnchor(null), []);

  const setFlightKey = useCallback((key: string | null) => setSelection(key), []);

  const setRouteFocus = useCallback((focus: RouteFocus | null) => setRouteFocusState(focus), []);

  // The shown selection: a chosen flight that is still in the view, none when the user chose none, else the default.
  const flightKey = selection === undefined ? fallbackKey
    : selection === null ? null
      : hasFlight(view, selection) ? selection : fallbackKey;

  // Once a default applies, store it so a later change of the saved wingman flight does not move the selection.
  // The updater keeps any choice made in the same commit (for example a child that calls setFlightKey on mount).
  useEffect(() => {
    if (fallbackKey === null) return;
    setSelection(current => (current === undefined || (current !== null && !hasFlight(view, current))
      ? fallbackKey
      : current));
  }, [fallbackKey, view]);

  // A flight that leaves the view (side or view mode change) also leaves the map state and the route focus.
  useEffect(() => {
    setMapUi(current => (current.soloFlightKey !== null && !hasFlight(view, current.soloFlightKey)
      ? { ...current, soloFlightKey: null }
      : current));
    setRouteFocusState(current => (current !== null && !hasFlight(view, current.flightKey) ? null : current));
  }, [view]);

  // The route pick belongs to the flight it was made on: choosing another flight drops it, so the map does not keep
  // highlighting the flight that was left (W3). A pick made for the new flight in the same commit is kept.
  useEffect(() => {
    setRouteFocusState(current => (current !== null && current.flightKey !== flightKey ? null : current));
  }, [flightKey]);

  // A second file opens the revision comparison (F10).
  useEffect(() => {
    if (revisions) navigate('revision', null);
  }, [revisions, navigate]);

  // Threat data is creator-only (D1). Leave the threat screen when switching to pilot view.
  useEffect(() => {
    if (viewMode === 'pilot' && nav.screen === 'threats') navigate('overview', null);
  }, [nav.screen, viewMode, navigate]);

  const value = useMemo<WorkspaceValue>(() => ({
    screen: nav.screen,
    setScreen,
    previousScreen: nav.previous,
    jumpTo,
    focusAnchor,
    clearFocusAnchor,
    flightKey,
    setFlightKey,
    routeFocus,
    setRouteFocus,
    mapUi,
    setMapUi,
    settingsOpen,
    setSettingsOpen,
  }), [
    nav,
    setScreen,
    jumpTo,
    focusAnchor,
    clearFocusAnchor,
    flightKey,
    setFlightKey,
    routeFocus,
    setRouteFocus,
    mapUi,
    settingsOpen,
  ]);

  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

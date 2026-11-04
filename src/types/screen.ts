/**
 * Screens reachable from the shell. The left rail, the bottom tabs and the
 * briefing/revision/initial flows all address screens by these ids.
 */
export type ScreenId =
  | 'overview'
  | 'flights'
  | 'map'
  | 'comms'
  | 'support'
  | 'threats'
  | 'notes'
  | 'export'
  | 'briefing'
  | 'revision'
  | 'initial';

/** Screens shown in the left rail (desktop) and the bottom tabs (narrow). */
export const NAV_SCREENS = ['overview', 'flights', 'map', 'comms', 'support', 'threats', 'notes', 'export'] as const satisfies readonly ScreenId[];

/** Screens that show threat data; hidden in pilot view (D1). */
export const CREATOR_ONLY_SCREENS: readonly ScreenId[] = ['threats'];

/**
 * Props of the shared map panel (contract 6.1). P2 implements the component in
 * `src/map/MapPanel.tsx` and must accept exactly these props.
 */
export interface MapPanelProps {
  /** Hides the editing tools (used by the overview and export previews). */
  readOnly?: boolean;
  /** CSS height of the panel, for example "100%" or "360px". */
  height?: string;
  /**
   * Flight to show on the map (flightKey() value, including neutral:<groupId>). null or omitted shows every
   * flight. The verbal briefing map follows the selected flight this way (Lead decision 4).
   */
  focusFlightKey?: string | null;
}

// STUB. Owner: P2 (地図). P2 replaces this file's body with the shared map panel moved from MapTab.
// Contract (frozen): named export MapPanel taking MapPanelProps (src/types/screen.ts). Data comes from
// useMission(), layers and the annotation tool from useWorkspace().mapUi. Used by the map screen (P2),
// the flight screen's right pane at 1600px and wider (P1) and the overview and briefing (P4, readOnly).
import type { MapPanelProps } from '../types/screen';

export function MapPanel({ readOnly = false, height = '100%' }: MapPanelProps) {
  return <div className="map-panel" data-read-only={readOnly} style={{ height }} />;
}

import { MapPanel } from '../map/MapPanel';

/** The map screen. The panel fills the main area; its state lives in useWorkspace().mapUi. */
export default function MapScreen() {
  return (
    <div className="map-screen">
      <MapPanel height="100%" />
    </div>
  );
}

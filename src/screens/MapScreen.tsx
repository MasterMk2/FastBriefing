// STUB. Owner: P2 (地図). P2 replaces this file with the MapPanel screen.
// Contract: default export, no props. Map UI state (layers, tool, colour) lives in useWorkspace().mapUi.
//   Read data with useMission(). The same MapPanel is later shared with the flight screen (1600px+).
// Carried over: MapTab({ mission, settings, onNotesChange }) from src/components/MapTab.tsx.
// Removed at integration: MapTab.tsx (SPEC 8).
import MapTab from '../components/MapTab';
import { useMission } from '../shell/MissionContext';

export default function MapScreen() {
  const { mission, settings, setNotes } = useMission();
  return <MapTab mission={mission} settings={settings} onNotesChange={setNotes} />;
}

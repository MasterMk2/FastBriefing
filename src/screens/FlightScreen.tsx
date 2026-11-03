// STUB. Owner: P1 (フライト作業画面). P1 replaces this file's body.
// Contract: default export, no props. Selected flight: useWorkspace().flightKey (see utils/flightKey.ts).
//   Read data with useMission(): mission, view, settings, side. Notes write through setNotes.
// Carried over: FlightsTab({ mission, settings, onNotesChange }) from src/components/FlightsTab.tsx.
// Also used by P1 later: LineupCard (src/screens/flight/LineupCard.tsx) and WingmanCard (src/screens/flight/WingmanCard.tsx).
// Removed at integration: FlightsTab.tsx (SPEC 8).
import FlightsTab from '../components/FlightsTab';
import { useMission } from '../shell/MissionContext';

export default function FlightScreen() {
  const { mission, settings, setNotes } = useMission();
  return <FlightsTab mission={mission} settings={settings} onNotesChange={setNotes} />;
}

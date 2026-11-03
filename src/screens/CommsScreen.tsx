// STUB. Owner: P5 (通信・支援機・脅威). P5 replaces this file's body.
// Contract: default export, no props. Read data with useMission(): mission, view, settings, side.
// Carried over: CommsTab({ mission, settings }) from src/components/CommsTab.tsx.
// Shared with P5: src/analysis/frequencyConflicts.ts (moved out of CommsTab.tsx by P5).
// Removed at integration: CommsTab.tsx (SPEC 8).
import CommsTab from '../components/CommsTab';
import { useMission } from '../shell/MissionContext';

export default function CommsScreen() {
  const { mission, settings } = useMission();
  return <CommsTab mission={mission} settings={settings} />;
}

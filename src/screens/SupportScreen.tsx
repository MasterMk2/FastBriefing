// STUB. Owner: P5 (通信・支援機・脅威). P5 replaces this file's body.
// Contract: default export, no props. Read data with useMission(): mission, view, settings, side.
//   Support assets with hidden === true are removed in pilot view (G11), by applyViewMode.
// Carried over: SupportTab({ mission, settings }) from src/components/SupportTab.tsx.
// Removed at integration: SupportTab.tsx (SPEC 8).
import SupportTab from '../components/SupportTab';
import { useMission } from '../shell/MissionContext';

export default function SupportScreen() {
  const { mission, settings } = useMission();
  return <SupportTab mission={mission} settings={settings} />;
}

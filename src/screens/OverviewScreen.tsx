// STUB. Owner: P4 (概要とブリーフィング). P4 replaces this file's body.
// Contract: default export, no props. Read data with useMission(): mission (original),
//   view (after applyViewMode), settings, side, viewMode. Do not parse or normalize here.
// Carried over: OverviewTab({ mission, settings }) from src/components/OverviewTab.tsx.
// Removed at integration: OverviewTab.tsx (SPEC 8).
import OverviewTab from '../components/OverviewTab';
import { useMission } from '../shell/MissionContext';

export default function OverviewScreen() {
  const { mission, settings } = useMission();
  return <OverviewTab mission={mission} settings={settings} />;
}

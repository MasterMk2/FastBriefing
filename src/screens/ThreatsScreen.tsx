// STUB. Owner: P5 (通信・支援機・脅威). P5 replaces this file's body.
// Contract: default export, no props. Creator view only (D1): in pilot view this file renders
//   the EmptyState below, and the shell never navigates here in pilot view (see WorkspaceProvider).
// Read data with useMission(): mission (threat data is creator data), settings, viewMode.
// Carried over: ThreatsTab({ mission, settings }) from src/components/ThreatsTab.tsx.
// Removed at integration: ThreatsTab.tsx (SPEC 8).
import { useTranslation } from 'react-i18next';
import ThreatsTab from '../components/ThreatsTab';
import { EmptyState } from '../shell/EmptyState';
import { useMission } from '../shell/MissionContext';

export default function ThreatsScreen() {
  const { t } = useTranslation('shell');
  const { mission, settings, viewMode } = useMission();
  if (viewMode === 'pilot') {
    return <EmptyState title={t('shell:screens.threatsPilot.title')} body={t('shell:screens.threatsPilot.body')} />;
  }
  return <ThreatsTab mission={mission} settings={settings} />;
}

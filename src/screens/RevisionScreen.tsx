// Owner: P6 (記入・改版・ファイル操作・初回画面). Revision screen (SPEC 1.2, F10).
// Contract: default export, no props. Revisions come from useMission().revisions (before first, after second);
//   closing returns to the overview. The displayed coalition comes from useMission().side (D1).
import { useTranslation } from 'react-i18next';
import RevisionComparison from '../components/RevisionComparison';
import { EmptyState } from '../shell/EmptyState';
import { useMission } from '../shell/MissionContext';
import { useWorkspace } from '../shell/workspace';

export default function RevisionScreen() {
  const { t } = useTranslation('revision');
  const { revisions, settings, side, closeRevisions } = useMission();
  const { setScreen } = useWorkspace();
  if (!revisions) {
    return <EmptyState title={t('revision:emptyTitle')} body={t('revision:emptyBody')} />;
  }
  const close = () => {
    closeRevisions();
    setScreen('overview');
  };
  return <RevisionComparison revisions={revisions} settings={settings} side={side} onClose={close} />;
}

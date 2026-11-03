// STUB. Owner: P6 (記入・改版・ファイル操作・初回画面). P6 wraps RevisionComparison here (F10).
// Contract: default export, no props. Revisions come from useMission().revisions (old file first,
//   new file second); closing calls useMission().closeRevisions(). Comparison view mode: useMission().viewMode.
// Carried over: RevisionComparison({ revisions, settings, side, onClose }) from src/components/RevisionComparison.tsx.
//   P0 added `side` (the resolved displayed coalition) so pilot view does not compare the opposing side (D1).
import { useTranslation } from 'react-i18next';
import RevisionComparison from '../components/RevisionComparison';
import { EmptyState } from '../shell/EmptyState';
import { useMission } from '../shell/MissionContext';

export default function RevisionScreen() {
  const { t } = useTranslation('shell');
  const { revisions, settings, side, closeRevisions } = useMission();
  if (!revisions) {
    return <EmptyState title={t('shell:screens.revision.title')} body={t('shell:screens.revision.body')} />;
  }
  return <RevisionComparison revisions={revisions} settings={settings} side={side} onClose={closeRevisions} />;
}

// STUB. Owner: P4 (概要とブリーフィング). P4 replaces this file with the full-screen briefing (F8).
// Contract: default export, no props. Opened from the shell header ("ブリーフィング開始").
//   Read data with useMission() (view, settings, side). Keys: ← → Home End Esc F (SPEC 1.3).
// No old tab exists for this screen, so the stub only says it is being prepared.
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../shell/EmptyState';

export default function BriefingMode() {
  const { t } = useTranslation('shell');
  return <EmptyState title={t('shell:screens.briefing.title')} body={t('shell:screens.briefing.body')} />;
}

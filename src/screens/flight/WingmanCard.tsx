// STUB. Owner: P7 (自機カードとラインナップ). P7 replaces this file's body.
// Contract (frozen): default export WingmanCard, props WingmanCardProps below.
//   Shows the aircraft chosen as "自機" on this device (localStorage key fastbriefing-wingman, F4).
//   Shown above the flight screen when a wingman aircraft is chosen; the choice is never written to PDF output.
import { EmptyState } from '../../shell/EmptyState';
import { useTranslation } from 'react-i18next';
import type { Flight } from '../../types/mission';

export interface WingmanCardProps {
  flight: Flight;
}

export default function WingmanCard({ flight: _flight }: WingmanCardProps) {
  const { t } = useTranslation('shell');
  return <EmptyState title={t('shell:stub.preparing')} body={t('shell:stub.body')} />;
}

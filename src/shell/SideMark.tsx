import { useTranslation } from 'react-i18next';
import type { Side } from '../types/mission';

export type SideMarkSide = Side | 'neutral';

/**
 * Coalition mark (SPEC 1.4): blue is a square, red a diamond, neutral a circle.
 * The text label is always shown with the shape, so colour is never the only cue.
 */
export function SideMark({ side, showLabel = true }: { side: SideMarkSide; showLabel?: boolean }) {
  const { t } = useTranslation('shell');
  const label = t(`side.${side}`);
  return (
    <span className={`side-mark side-mark-${side}`} data-side={side}>
      <span className="side-mark-shape" aria-hidden="true" />
      {showLabel ? <span className="side-mark-label">{label}</span> : <span className="visually-hidden">{label}</span>}
    </span>
  );
}

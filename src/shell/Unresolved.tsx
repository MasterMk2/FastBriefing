import { useTranslation } from 'react-i18next';

/**
 * Shown where a position could not be resolved (SPEC 3). Never draws [0, 0].
 * The DCS X/Y pair is printed beside the mark so the place can still be found.
 */
export function Unresolved({ xy }: { xy?: [number, number] }) {
  const { t } = useTranslation('shell');
  return (
    <span className="unresolved" role="note">
      <span className="unresolved-mark" aria-hidden="true">?</span>
      <span>{t('shell:unresolved.label')}</span>
      {xy && <span className="unresolved-xy">{t('shell:unresolved.dcsXY')} {Math.round(xy[0])}, {Math.round(xy[1])}</span>}
    </span>
  );
}

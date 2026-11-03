import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplaySettings, Side } from '../types/mission';
import { compareMissionRevisions } from '../utils/missionRevision';
import type { MissionRevision, RevisionCategory, RevisionChange, RevisionValue } from '../utils/missionRevision';

const RevisionMap = lazy(() => import('./RevisionMap'));
export interface LoadedRevision { name: string; fingerprint: string; revision: MissionRevision }
/**
 * `revisions[0]` is the before version and `revisions[1]` the after version; the direction is fixed (F10).
 * `side` is the displayed coalition (D2 resolved). Pilot view compares only that side's flights (D1).
 */
interface Props { revisions: [LoadedRevision, LoadedRevision]; settings: DisplaySettings; side: Side; onClose: () => void }
const categories: RevisionCategory[] = ['mission', 'route', 'loadout', 'radio', 'weather'];
const PAGE_SIZE = 100;

function display(value: RevisionValue | undefined, missing: string): string {
  return value === undefined || value === null ? missing : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** A changed flight name is a rename: the diff reports it as a changed `flight` field. */
function kindLabel(change: RevisionChange): 'added' | 'removed' | 'changed' | 'renamed' {
  return change.field === 'flight' && change.kind === 'changed' ? 'renamed' : change.kind;
}

/** An ETA change is shown as ±minutes:seconds next to the raw seconds (F10). */
function etaDelta(change: RevisionChange): string | null {
  if (!change.field.endsWith('ETA') || typeof change.before !== 'number' || typeof change.after !== 'number') return null;
  const seconds = Math.round(change.after - change.before);
  const magnitude = Math.abs(seconds);
  return `${seconds < 0 ? '−' : '+'}${Math.floor(magnitude / 60)}:${String(magnitude % 60).padStart(2, '0')}`;
}

export default function RevisionComparison({ revisions, settings, side, onClose }: Props) {
  const { t } = useTranslation('revision');
  const [category, setCategory] = useState<RevisionCategory | 'all'>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [before, after] = revisions;
  const diff = useMemo(() => compareMissionRevisions(before.revision, after.revision, settings.viewMode, side), [before, after, settings.viewMode, side]);
  const changes = diff.changes.filter(change => category === 'all' || change.category === category);
  return (
    <section className="revision-comparison" aria-label={t('revision:title')}>
      <h2>{t('revision:title')}</h2>
      <p className="revision-direction">{t('revision:before')}: {before.name} → {t('revision:after')}: {after.name}</p>
      <p className="revision-scope">{t('revision:scope')}</p>
      <div className="revision-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('revision:close')}</button>
        <label className="revision-filter">
          {t('revision:filter')}{' '}
          <select value={category} onChange={event => { setCategory(event.target.value as typeof category); setLimit(PAGE_SIZE); }}>
            <option value="all">{t('revision:all')}</option>
            {categories.map(item => <option key={item} value={item}>{t(`revision:categories.${item}`)}</option>)}
          </select>
        </label>
      </div>
      <p role="status" className="revision-count">
        {diff.changes.length ? t('revision:count', { count: diff.changes.length }) : t('revision:unchanged')}
      </p>
      {!diff.sameTheatre && <p className="revision-warning">▲ {t('revision:differentTheatre')}</p>}
      {changes.length > 0 && (
        <div className="revision-table-scroll">
          <table className="revision-table">
            <thead>
              <tr>{['kind', 'entity', 'field', 'before', 'after'].map(key => <th key={key} scope="col">{t(`revision:${key}`)}</th>)}</tr>
            </thead>
            <tbody>
              {changes.slice(0, limit).map((change, index) => (
                <tr key={index}>
                  <td>{t(`revision:kinds.${kindLabel(change)}`)}<br />{t(`revision:categories.${change.category}`)}</td>
                  <th scope="row">{change.entity || t(`revision:categories.${change.category}`)}</th>
                  <td>{change.field}</td>
                  <td className="revision-value">{display(change.before, t('revision:missing'))}</td>
                  <td className="revision-value">
                    {display(change.after, t('revision:missing'))}
                    {etaDelta(change) && <span className="revision-delta"> ({etaDelta(change)})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {changes.length > limit && (
        <button type="button" className="btn btn-secondary" onClick={() => setLimit(value => value + PAGE_SIZE)}>{t('revision:more')}</button>
      )}
      {diff.sameTheatre && diff.routes.length > 0 && (
        <Suspense fallback={<p>{t('revision:loading')}</p>}>
          <RevisionMap theatre={before.revision.theatre} routes={diff.routes} mapBackground={settings.mapBackground} />
        </Suspense>
      )}
    </section>
  );
}

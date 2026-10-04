import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplaySettings } from '../types/mission';
import { compareMissionRevisions } from '../utils/missionRevision';
import type { MissionRevision, RevisionCategory, RevisionValue } from '../utils/missionRevision';

const RevisionMap = lazy(() => import('./RevisionMap'));
export interface LoadedRevision { name: string; fingerprint: string; revision: MissionRevision }
interface Props { revisions: [LoadedRevision, LoadedRevision]; settings: DisplaySettings; onClose: () => void }
const categories: RevisionCategory[] = ['mission', 'route', 'loadout', 'radio', 'weather'];
function display(value: RevisionValue | undefined, missing: string): string {
  return value === undefined || value === null ? missing : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function RevisionComparison({ revisions, settings, onClose }: Props) {
  const { t } = useTranslation();
  const [swapped, setSwapped] = useState(false);
  const [category, setCategory] = useState<RevisionCategory | 'all'>('all');
  const [limit, setLimit] = useState(100);
  const [before, after] = swapped ? [revisions[1], revisions[0]] : revisions;
  const diff = useMemo(() => compareMissionRevisions(before.revision, after.revision, settings.viewMode), [before, after, settings.viewMode]);
  const changes = diff.changes.filter(change => category === 'all' || change.category === category);
  return (
    <section className="revision-comparison" aria-label={t('revision.title')}>
      <h2>{t('revision.title')}</h2>
      <p>{t('revision.before')}: {before.name} → {t('revision.after')}: {after.name}</p>
      <p>{t('revision.scope')}</p>
      <div className="revision-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setSwapped(value => !value)}>{t('revision.swap')}</button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('revision.close')}</button>
        <label>{t('revision.filter')} <select value={category} onChange={event => { setCategory(event.target.value as typeof category); setLimit(100); }}>
          <option value="all">{t('revision.all')}</option>
          {categories.map(item => <option key={item} value={item}>{t(`revision.categories.${item}`)}</option>)}
        </select></label>
      </div>
      <p role="status">{diff.changes.length ? t('revision.count', { count: diff.changes.length }) : t('revision.unchanged')}</p>
      {!diff.sameTheatre && <p className="warning">{t('revision.differentTheatre')}</p>}
      {changes.length > 0 && <div className="revision-table-scroll"><table className="revision-table">
        <thead><tr>{['kind', 'entity', 'field', 'before', 'after'].map(key => <th key={key} scope="col">{t(`revision.${key}`)}</th>)}</tr></thead>
        <tbody>{changes.slice(0, limit).map((change, index) => <tr key={index}>
          <td>{t(`revision.kinds.${change.kind}`)}<br />{t(`revision.categories.${change.category}`)}</td>
          <th scope="row">{change.entity || t(`revision.categories.${change.category}`)}</th>
          <td>{change.field}</td>
          <td>{display(change.before, t('revision.missing'))}</td>
          <td>{display(change.after, t('revision.missing'))}</td>
        </tr>)}</tbody>
      </table></div>}
      {changes.length > limit && <button type="button" className="btn btn-secondary" onClick={() => setLimit(value => value + 100)}>{t('revision.more')}</button>}
      {diff.sameTheatre && diff.routes.length > 0 && <Suspense fallback={<p>{t('app.loading')}</p>}>
        <RevisionMap theatre={before.revision.theatre} routes={diff.routes} />
      </Suspense>}
    </section>
  );
}

// Comms screen (SPEC 1.3 comms, F5 L1): conflicts first, then the frequency table, then the common frequencies.
// Owner: P4 for the integration (B4). Default export, no props. Reads the displayed mission from useMission().view (D1).
// Conflicts use the main frequencies only (Lead decision 1, the same function as lint L1). The table lists the radio presets.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  collectFrequencyEntries,
  conflictAnchor,
  conflictSide,
  detectMainFrequencyConflicts,
  FREQUENCY_MATCH_TOLERANCE_MHZ,
  formatRadioChannel,
  ownerKeyOf,
  type CommunicationFrequency,
} from '../analysis/frequencyConflicts';
import { EmptyState } from '../shell/EmptyState';
import { Field } from '../shell/Field';
import { Notice } from '../shell/Notice';
import { Segmented, type SegmentedOption } from '../shell/Segmented';
import { SideMark } from '../shell/SideMark';
import { useMission } from '../shell/MissionContext';
import { useWorkspace } from '../shell/workspace';
import { flightKey } from '../utils/flightKey';

type SideFilter = 'all' | 'blue' | 'red';
type ModulationFilter = 'all' | 'AM' | 'FM';
type SortKey = 'frequency' | 'owner';

interface RowFilter {
  side: SideFilter;
  modulation: ModulationFilter;
  owner: string;
}

const EMPTY_FILTER: RowFilter = { side: 'all', modulation: 'all', owner: 'all' };

/** Guard frequencies (AM), the same for every mission. */
const GUARD_FREQUENCIES = [
  { key: 'uhf', frequencyMHz: 243.0 },
  { key: 'vhf', frequencyMHz: 121.5 },
] as const;

export default function CommsScreen() {
  const { t } = useTranslation();
  const { view, viewMode } = useMission();
  const { focusAnchor, clearFocusAnchor, setFlightKey, setScreen } = useWorkspace();
  const rootRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [filter, setFilter] = useState<RowFilter>(EMPTY_FILTER);
  const [sortKey, setSortKey] = useState<SortKey>('frequency');

  const entries = useMemo(() => collectFrequencyEntries(view), [view]);
  const conflicts = useMemo(() => detectMainFrequencyConflicts(view), [view]);
  const owners = useMemo(() => ownerOptions(entries, t), [entries, t]);
  const ownerLabels = useMemo(() => new Map(owners.map(option => [option.key, option.label])), [owners]);
  const sideOptions = useMemo(() => sideFilterOptions(t), [t]);
  const modulationOptions = useMemo(() => modulationFilterOptions(t), [t]);
  const sortOptions = useMemo(() => sortKeyOptions(t), [t]);

  // A stale owner choice (for example after switching the displayed side) falls back to "all".
  const activeFilter: RowFilter = {
    ...filter,
    owner: owners.some(option => option.key === filter.owner) ? filter.owner : 'all',
  };
  const rows = sortEntries(filterEntries(entries, activeFilter), sortKey);

  // "この箇所へ" from lint L1 (or the overview) names one conflict. Its row is highlighted and focused once.
  useEffect(() => {
    if (focusAnchor === null) return;
    setHighlighted(focusAnchor);
    clearFocusAnchor();
  }, [focusAnchor, clearFocusAnchor]);

  useEffect(() => {
    if (highlighted === null) return;
    focusAnchored(rootRef.current, highlighted);
  }, [highlighted]);

  const ownerLabel = (entry: CommunicationFrequency) => ownerLabels.get(ownerKeyOf(entry)) ?? entry.callsign;

  const openOwner = (entry: CommunicationFrequency) => {
    if (entry.source === 'flight' && entry.flightId !== undefined) {
      setFlightKey(flightKey(entry.side, entry.flightId));
      setScreen('flights');
      return;
    }
    setScreen('support');
  };

  const navAids = [
    ...view.coalitions.blue.support.map((asset, index) => ({ asset, side: 'blue' as const, index })),
    ...view.coalitions.red.support.map((asset, index) => ({ asset, side: 'red' as const, index })),
  ].filter(item => item.asset.tacan || item.asset.icls);

  return (
    <div className="comms-screen" ref={rootRef}>
      <section className="comms-section comms-conflicts" aria-labelledby="comms-conflicts-title">
        <h2 id="comms-conflicts-title" className="comms-heading">{t('comms:conflicts.title')}</h2>
        {conflicts.length === 0 ? (
          <Notice tone="success">{t('comms:conflicts.none')}</Notice>
        ) : (
          <>
            <Notice tone="warning" title={t('comms:conflicts.count', { count: conflicts.length })}>
              <p className="comms-note">{t('comms:conflicts.explanation', { kilohertz: FREQUENCY_MATCH_TOLERANCE_MHZ * 1000 })}</p>
              {viewMode === 'creator' && <p className="comms-note">{t('comms:conflicts.scope')}</p>}
            </Notice>
            <ul className="comms-conflict-list">
              {conflicts.map(conflict => {
                const anchor = conflictAnchor(conflict);
                return (
                  <li
                    key={conflict.key}
                    className={anchor === highlighted ? 'comms-conflict is-target' : 'comms-conflict'}
                    data-anchor={anchor}
                    tabIndex={-1}
                  >
                    <p className="comms-conflict-head">
                      <SideMark side={conflictSide(conflict)} />{' '}
                      <strong className="comms-num">
                        {t('comms:frequencyValue', { frequency: conflict.frequencyMHz.toFixed(3), modulation: conflict.modulation })}
                      </strong>
                    </p>
                    <ul className="comms-conflict-types">
                      {conflict.types.map(type => <li key={type}>{t(`comms:types.${type}`)}</li>)}
                    </ul>
                    <ul className="comms-conflict-users">
                      {conflict.users.map(user => (
                        <li key={user.id}>
                          <button type="button" className="comms-link" onClick={() => openOwner(user)}>
                            {ownerLabel(user)}
                          </button>
                          <span className="comms-muted">
                            {' '}
                            {user.source === 'support' ? t('comms:usage.support') : t('comms:usage.mainFrequency')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="comms-section" aria-labelledby="comms-table-title">
        <h2 id="comms-table-title" className="comms-heading">{t('comms:table.title')}</h2>
        {entries.length === 0 ? (
          <EmptyState title={t('comms:empty.title')} body={t('comms:empty.body')} />
        ) : (
          <>
            <div className="comms-filters">
              <Segmented
                label={t('comms:filter.side')}
                options={sideOptions}
                value={activeFilter.side}
                onChange={side => setFilter({ ...activeFilter, side })}
              />
              <Segmented
                label={t('comms:filter.modulation')}
                options={modulationOptions}
                value={activeFilter.modulation}
                onChange={modulation => setFilter({ ...activeFilter, modulation })}
              />
              <Field label={t('comms:filter.owner')}>
                {id => (
                  <select
                    id={id}
                    className="comms-select"
                    value={activeFilter.owner}
                    onChange={event => setFilter({ ...activeFilter, owner: event.target.value })}
                  >
                    <option value="all">{t('comms:filter.all')}</option>
                    {owners.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                )}
              </Field>
              <Segmented
                label={t('comms:sort.label')}
                options={sortOptions}
                value={sortKey}
                onChange={setSortKey}
              />
            </div>

            {rows.length === 0 ? (
              <EmptyState
                title={t('comms:filter.noMatch')}
                action={(
                  <button type="button" className="comms-button" onClick={() => setFilter(EMPTY_FILTER)}>
                    {t('comms:filter.clear')}
                  </button>
                )}
              />
            ) : (
              <>
                <p className="comms-muted">{t('comms:filter.shown', { shown: rows.length, total: entries.length })}</p>
                <div className="comms-table-wrap">
                  <table className="comms-table">
                    <caption className="visually-hidden">{t('comms:table.caption', { count: rows.length })}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('comms:table.side')}</th>
                        <th scope="col">{t('comms:table.owner')}</th>
                        <th scope="col">{t('comms:table.channel')}</th>
                        <th scope="col">{t('comms:table.usage')}</th>
                        <th scope="col">{t('comms:table.modulation')}</th>
                        <th scope="col" className="comms-num">{t('comms:table.frequency')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(entry => (
                        <tr key={entry.id}>
                          <td><SideMark side={entry.side} /></td>
                          <td>
                            <button type="button" className="comms-link" onClick={() => openOwner(entry)}>{ownerLabel(entry)}</button>
                          </td>
                          <td className="comms-num">{entry.source === 'flight' ? formatRadioChannel(entry) : '—'}</td>
                          <td>{entry.source === 'flight' ? entry.name : t(`support:kinds.${entry.supportKind ?? 'tanker'}`)}</td>
                          <td>{entry.modulation}</td>
                          <td className="comms-num">{entry.frequencyMHz.toFixed(3)} MHz</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="comms-section comms-common" aria-labelledby="comms-common-title">
        <h2 id="comms-common-title" className="comms-heading">{t('comms:common.title')}</h2>
        <dl className="comms-dl">
          {GUARD_FREQUENCIES.map(guard => (
            <div key={guard.key} className="comms-dl-row">
              <dt>{t(`comms:guard.${guard.key}`)}</dt>
              <dd className="comms-num">{t('comms:frequencyValue', { frequency: guard.frequencyMHz.toFixed(3), modulation: 'AM' })}</dd>
            </div>
          ))}
        </dl>

        <h3 className="comms-subheading">{t('comms:navaid.title')}</h3>
        {navAids.length === 0 ? (
          <p className="comms-muted">{t('comms:navaid.none')}</p>
        ) : (
          <div className="comms-table-wrap">
            <table className="comms-table">
              <thead>
                <tr>
                  <th scope="col">{t('comms:table.side')}</th>
                  <th scope="col">{t('comms:table.owner')}</th>
                  <th scope="col">{t('comms:navaid.tacan')}</th>
                  <th scope="col">{t('comms:navaid.icls')}</th>
                </tr>
              </thead>
              <tbody>
                {navAids.map(item => (
                  <tr key={`${item.side}:${item.index}`}>
                    <td><SideMark side={item.side} /></td>
                    <td>{item.asset.callsign}</td>
                    <td className="comms-num">{item.asset.tacan ? `${item.asset.tacan.channel} ${item.asset.tacan.mode}` : '—'}</td>
                    <td className="comms-num">{item.asset.icls ? String(item.asset.icls.channel) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="comms-subheading">{t('comms:atc.title')}</h3>
        <p className="comms-muted">{t('comms:atc.notRecorded')}</p>
      </section>
    </div>
  );
}

/**
 * Moves focus to the element whose data-anchor is the anchor (exact match, so no selector escaping is needed).
 * scrollIntoView is optional-called because some DOM environments (jsdom) do not implement it.
 */
function focusAnchored(root: HTMLElement | null, anchor: string) {
  const target = Array.from(root?.querySelectorAll<HTMLElement>('[data-anchor]') ?? [])
    .find(element => element.dataset.anchor === anchor);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView?.({ block: 'center' });
}

function sideFilterOptions(t: TFunction): readonly SegmentedOption<SideFilter>[] {
  return [
    { value: 'all', label: t('comms:filter.all') },
    { value: 'blue', label: t('shell:side.blue') },
    { value: 'red', label: t('shell:side.red') },
  ];
}

function modulationFilterOptions(t: TFunction): readonly SegmentedOption<ModulationFilter>[] {
  return [
    { value: 'all', label: t('comms:filter.all') },
    { value: 'AM', label: 'AM' },
    { value: 'FM', label: 'FM' },
  ];
}

function sortKeyOptions(t: TFunction): readonly SegmentedOption<SortKey>[] {
  return [
    { value: 'frequency', label: t('comms:sort.frequency') },
    { value: 'owner', label: t('comms:sort.owner') },
  ];
}

function ownerOptions(entries: CommunicationFrequency[], t: TFunction): { key: string; label: string }[] {
  const labels = new Map<string, string>();
  for (const entry of entries) {
    const key = ownerKeyOf(entry);
    if (labels.has(key)) continue;
    const label = entry.source === 'support'
      ? `${t(`support:kinds.${entry.supportKind ?? 'tanker'}`)} ${entry.callsign}`
      : entry.callsign;
    labels.set(key, label);
  }
  return [...labels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function filterEntries(entries: CommunicationFrequency[], filter: RowFilter): CommunicationFrequency[] {
  return entries.filter(entry =>
    (filter.side === 'all' || entry.side === filter.side)
    && (filter.modulation === 'all' || entry.modulation === filter.modulation)
    && (filter.owner === 'all' || ownerKeyOf(entry) === filter.owner));
}

function sortEntries(entries: CommunicationFrequency[], sortKey: SortKey): CommunicationFrequency[] {
  return [...entries].sort((a, b) => {
    if (sortKey === 'owner') {
      const byOwner = compareOwners(a, b);
      if (byOwner !== 0) return byOwner;
    }
    const byFrequency = a.frequencyMHz - b.frequencyMHz;
    return byFrequency !== 0 ? byFrequency : a.id.localeCompare(b.id);
  });
}

/** Owner order: side, then flights before support assets, then the numeric flight or support index (2 before 10). */
function compareOwners(a: CommunicationFrequency, b: CommunicationFrequency): number {
  if (a.side !== b.side) return a.side < b.side ? -1 : 1;
  if (a.source !== b.source) return a.source === 'flight' ? -1 : 1;
  return ownerNumber(a) - ownerNumber(b);
}

function ownerNumber(entry: CommunicationFrequency): number {
  return entry.source === 'flight' ? (entry.flightId ?? 0) : (entry.supportIndex ?? 0);
}

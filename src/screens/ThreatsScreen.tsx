// Threats screen (SPEC 1.3 threats, F6). Owner: P5. Default export, no props.
// Creator view only (D1): in pilot view it shows an empty state and never lists threats or crossings.
// The list shows the AI groups of both sides with their side mark (SPEC 1.3 "陣営" column), so every
// unrecorded group that lint L8 counts for either side can be found here. Crossings use the opposing side only.
// Ranges are the reference table's engagement and detection ranges in metres (D3). Unknown ranges are
// shown as "未収録", never as "なし", and never used in a crossing.
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  crossRouteWithThreats,
  selectCrossingThreats,
  type CrossingRun,
  type CrossingThreat,
} from '../analysis/threatCrossing';
import { isPositionResolved } from '../analysis/position';
import { EmptyState } from '../shell/EmptyState';
import { Notice } from '../shell/Notice';
import { SideMark } from '../shell/SideMark';
import { Unresolved } from '../shell/Unresolved';
import { useMission } from '../shell/MissionContext';
import { useUnits, type Units } from '../shell/units';
import type { AIGroup, Flight, Side } from '../types/mission';

interface ThreatRow {
  side: Side;
  group: AIGroup;
  /** Index in the coalition's aiGroups (the anchor threats:<side>:<index> that lint L8 points at). */
  index: number;
}

export default function ThreatsScreen() {
  const { t } = useTranslation();
  const { view, side, viewMode } = useMission();

  if (viewMode === 'pilot') {
    return <EmptyState title={t('threats:pilot.title')} body={t('threats:pilot.body')} />;
  }

  const opposing: Side = side === 'blue' ? 'red' : 'blue';
  const groups = view.coalitions[opposing].aiGroups;
  const crossingThreats = selectCrossingThreats(groups);
  const unrecordedCount = groups.filter(group => group.threatRangeSource === 'unknown').length;
  const rows: ThreatRow[] = [
    ...view.coalitions[side].aiGroups.map((group, index) => ({ side, group, index })),
    ...groups.map((group, index) => ({ side: opposing, group, index })),
  ];

  return (
    <div className="threats-screen">
      <section className="threats-section" aria-labelledby="threats-crossing-title">
        <h2 id="threats-crossing-title" className="threats-heading">{t('threats:crossing.title')}</h2>
        <p className="threats-note">{t('threats:crossing.note')}</p>
        {crossingThreats.length > 0 && <p className="threats-note">{t('threats:crossing.groupNote')}</p>}
        {unrecordedCount > 0 && (
          <Notice tone="info">{t('threats:crossing.unrecordedNote', { count: unrecordedCount })}</Notice>
        )}
        {crossingThreats.length === 0 && <p className="threats-muted">{t('threats:crossing.noThreats')}</p>}
        {view.coalitions[side].flights.length === 0 ? (
          <p className="threats-muted">{t('threats:crossing.noFlights')}</p>
        ) : (
          <ul className="threats-crossing-list">
            {view.coalitions[side].flights.map(flight => (
              <CrossingRow key={flight.groupId} flight={flight} threats={crossingThreats} />
            ))}
          </ul>
        )}
      </section>

      <ThreatList rows={rows} />
    </div>
  );
}

function CrossingRow({ flight, threats }: { flight: Flight; threats: CrossingThreat[] }) {
  const { t } = useTranslation();
  if (flight.route.length < 2) {
    return (
      <li className="threats-crossing">
        <p><strong>{flight.callsign}</strong> <span className="threats-muted">{t('threats:crossing.noRoute')}</span></p>
      </li>
    );
  }
  if (threats.length === 0) return null;

  const results = crossRouteWithThreats(flight.route, threats);
  const lines = results.flatMap(result => result.runs.map(run => ({
    key: `${result.threat.id}:${run.state}:${run.from}:${run.to}`,
    text: runText(t, result.threat.type, run),
  })));

  return (
    <li className="threats-crossing">
      <p><strong>{flight.callsign}</strong> <span className="threats-muted">{flight.name}</span></p>
      {lines.length === 0 ? (
        <p className="threats-outside">{t('threats:crossing.outside')}</p>
      ) : (
        <ul className="threats-crossing-lines">
          {lines.map(line => <li key={line.key}>{line.text}</li>)}
        </ul>
      )}
    </li>
  );
}

function runText(t: TFunction, type: string, run: CrossingRun): string {
  const values = { type, from: run.from, to: run.to };
  return run.state === 'inside' ? t('threats:crossing.inside', values) : t('threats:crossing.grazing', values);
}

function ThreatList({ rows }: { rows: ThreatRow[] }) {
  const { t } = useTranslation();
  const units = useUnits();

  return (
    <section className="threats-section" aria-labelledby="threats-list-title">
      <h2 id="threats-list-title" className="threats-heading">{t('threats:list.title')}</h2>
      {rows.length === 0 ? (
        <p className="threats-muted">{t('threats:list.none')}</p>
      ) : (
        <div className="threats-table-wrap">
          <table className="threats-table">
            <thead>
              <tr>
                <th scope="col">{t('threats:list.side')}</th>
                <th scope="col">{t('threats:list.type')}</th>
                <th scope="col" className="threats-num">{t('threats:list.count')}</th>
                <th scope="col" className="threats-num">{t('threats:list.engagement')}</th>
                <th scope="col" className="threats-num">{t('threats:list.detection')}</th>
                <th scope="col">{t('threats:list.position')}</th>
                <th scope="col">{t('threats:list.source')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ side, group, index }, rowIndex) => (
                <tr key={`${side}:${rowIndex}:${group.type}:${group.startTime}`} data-anchor={`threats:${side}:${index}`}>
                  <td><SideMark side={side} /></td>
                  <td>{group.type}</td>
                  <td className="threats-num">{group.count}</td>
                  <td className="threats-num">{engagementText(t, units, group)}</td>
                  <td className="threats-num">{detectionText(t, units, group)}</td>
                  <td>
                    {isPositionResolved(group)
                      ? units.coord(group.latlon)
                      : <Unresolved xy={group.position} />}
                  </td>
                  <td>{sourceText(t, group)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function engagementText(t: TFunction, units: Units, group: AIGroup): string {
  if (group.threatRange !== undefined && group.threatRange > 0) return units.distance(group.threatRange);
  if (group.threatRangeSource === 'unknown') return t('threats:list.unrecorded');
  return '—';
}

function detectionText(t: TFunction, units: Units, group: AIGroup): string {
  if (group.detectionRange !== undefined && group.detectionRange > 0) return units.distance(group.detectionRange);
  if (group.threatRangeSource === 'unknown') return t('threats:list.unrecorded');
  return '—';
}

function sourceText(t: TFunction, group: AIGroup): string {
  if (group.threatRangeSource === 'reference') {
    return t('threats:list.sourceReference', { unit: group.threatRangeUnitType ?? group.type });
  }
  if (group.threatRangeSource === 'unknown') return t('threats:list.unrecorded');
  return '—';
}

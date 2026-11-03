// Owner: P1 (フライト作業画面). Navigation log (SPEC 1.3, F3): the route table, its column menu and
// the waypoint note panel. Data comes from useMission().view (pilot-safe). Notes are saved through setNotes.
import { Fragment } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Notice } from '../../shell/Notice';
import { Unresolved } from '../../shell/Unresolved';
import { useMission } from '../../shell/MissionContext';
import { useUnits } from '../../shell/units';
import type { Units } from '../../shell/units';
import { useSettings } from '../../hooks/useSettings';
import type { Flight, RoutePoint, Side, UserNotes } from '../../types/mission';
import WaypointAnnotationEditor from '../../components/WaypointAnnotationEditor';
import { formatLegDuration } from '../../utils/routeLegs';
import { resolveCoordinateFormat } from '../../utils/coordinates';
import { waypointAnnotationKey } from '../../utils/waypointAnnotations';
import { annotationFieldCount, isResolvedPoint } from './flightModel';

/** Columns shown by default (SPEC 1.3: 8 columns). */
export const DEFAULT_ROUTE_COLUMNS = ['no', 'name', 'coord', 'alt', 'speed', 'eta', 'leg', 'bearing'] as const;
/** Columns the column menu can add (SPEC 1.3). */
export const OPTIONAL_ROUTE_COLUMNS = ['cumDistance', 'cumTime', 'trueBearing', 'annotations'] as const;

export type RouteColumn = typeof DEFAULT_ROUTE_COLUMNS[number] | typeof OPTIONAL_ROUTE_COLUMNS[number];
export type OptionalRouteColumn = typeof OPTIONAL_ROUTE_COLUMNS[number];

interface RouteTableProps {
  side: Side;
  flight: Flight;
  selectedIndex: number | null;
  onSelectIndex: (routeIndex: number | null) => void;
  optionalColumns: ReadonlySet<OptionalRouteColumn>;
  onOptionalColumnsChange: (next: ReadonlySet<OptionalRouteColumn>) => void;
}

export default function RouteTable({
  side,
  flight,
  selectedIndex,
  onSelectIndex,
  optionalColumns,
  onOptionalColumnsChange,
}: RouteTableProps) {
  const { t } = useTranslation('flight');
  const { view, notes, setNotes, storageFailed } = useMission();
  const { settings } = useSettings();
  const units = useUnits();
  const route = flight.route;
  const columns: RouteColumn[] = [
    ...DEFAULT_ROUTE_COLUMNS,
    ...OPTIONAL_ROUTE_COLUMNS.filter(column => optionalColumns.has(column)),
  ];
  const selectedPoint = selectedIndex === null ? undefined : route[selectedIndex];

  const toggleColumn = (column: OptionalRouteColumn, checked: boolean) => {
    const next = new Set(optionalColumns);
    if (checked) next.add(column); else next.delete(column);
    onOptionalColumnsChange(next);
  };

  return (
    <div className="route-layout">
      <div className="route-main">
        <details className="route-columns">
          <summary>{t('flight:route.columns')}</summary>
          <fieldset className="route-columns-options">
            <legend className="visually-hidden">{t('flight:route.columns')}</legend>
            {OPTIONAL_ROUTE_COLUMNS.map(column => (
              <label key={column} className="route-columns-option">
                <input
                  type="checkbox"
                  checked={optionalColumns.has(column)}
                  onChange={event => toggleColumn(column, event.target.checked)}
                />
                <span>{t(`flight:route.col.${column}`)}</span>
              </label>
            ))}
          </fieldset>
        </details>

        <p className="route-coord-note">
          {t('flight:route.coordFormat', {
            format: resolveCoordinateFormat(settings.coordinateFormat, flight.type),
            defaultFormat: resolveCoordinateFormat('aircraft', flight.type),
          })}
        </p>

        {route.length === 0 ? (
          <p className="flight-empty-line">{t('flight:route.empty')}</p>
        ) : (
          <div className="route-table-wrap">
            {/* The roles are explicit: below 768px the cells are laid out as blocks (flight.css), which
                some browsers and screen readers take as the loss of the table structure. */}
            <table className="route-table" role="table">
              <caption className="visually-hidden">{t('flight:route.title')}</caption>
              <thead role="rowgroup">
                <tr role="row">
                  {columns.map(column => (
                    <th key={column} role="columnheader" scope="col" className={`route-col-${column}`}>
                      {t(`flight:route.col.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {route.map((point, routeIndex) => (
                  // The whole row selects the point (SPEC F3). The No. button is the keyboard route to it.
                  <tr
                    key={`${point.index}:${routeIndex}`}
                    role="row"
                    className={selectedIndex === routeIndex ? 'is-selected' : undefined}
                    onClick={() => onSelectIndex(selectedIndex === routeIndex ? null : routeIndex)}
                  >
                    {columns.map(column => (
                      <td key={column} role="cell" data-label={t(`flight:route.col.${column}`)} className={`route-col-${column}`}>
                        {renderRouteCell({
                          column,
                          point,
                          routeIndex,
                          selected: selectedIndex === routeIndex,
                          flight,
                          side,
                          notes,
                          units,
                          t,
                        })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="route-annotation" aria-label={t('flight:route.annotationTitle')}>
        {selectedPoint && selectedIndex !== null ? (
          <>
            <h3 className="route-annotation-title">
              {t('flight:route.annotationFor', { index: selectedPoint.index, name: selectedPoint.name || '-' })}
            </h3>
            {storageFailed ? (
              // The editor is not shown while the browser store has failed: nothing can be saved (SPEC 3, 記入の表).
              <Notice tone="warning" title={t('flight:notes.storageFailedTitle')} />
            ) : (
              <WaypointAnnotationEditor
                key={waypointAnnotationKey(side, flight.groupId, selectedIndex)}
                mission={view}
                side={side}
                flight={flight}
                routeIndex={selectedIndex}
                onNotesChange={setNotes}
                compact
              />
            )}
          </>
        ) : (
          <p className="hint">{t('flight:route.annotationHint')}</p>
        )}
      </aside>
    </div>
  );
}

interface RouteCellContext {
  column: RouteColumn;
  point: RoutePoint;
  routeIndex: number;
  selected: boolean;
  flight: Flight;
  side: Side;
  notes: UserNotes;
  units: Units;
  t: TFunction;
}

function renderRouteCell({ column, point, routeIndex, selected, flight, side, notes, units, t }: RouteCellContext) {
  const leg = point.leg;
  switch (column) {
    case 'no':
      // No click handler here: the click bubbles to the row, which selects the point (one toggle, not two).
      return (
        <button
          type="button"
          className="route-select"
          aria-pressed={selected}
          aria-label={t('flight:route.selectPoint', { index: point.index })}
        >
          {point.index}
        </button>
      );
    case 'name':
      return (
        <Fragment>
          <span className="route-name">{point.name || '-'}</span>
          {point.action && <span className="route-action">{point.action}</span>}
        </Fragment>
      );
    case 'coord':
      return isResolvedPoint(point)
        ? units.coord(point.latlon, flight.type)
        : <Unresolved xy={point.xy} />;
    case 'alt':
      return (
        <Fragment>
          {units.alt(point.alt)}
          <span className="route-alt-type">
            {point.altType === 'RADIO' ? t('flight:route.altRadio') : t('flight:route.altBaro')}
          </span>
        </Fragment>
      );
    case 'speed':
      return units.speed(point.speed);
    case 'eta':
      return units.time(point.eta);
    case 'leg':
      return leg ? units.distance(leg.distance) : '-';
    case 'bearing':
      if (!leg) return '-';
      // No magnetic table for the theatre (FR-03 "真のみ"): show the true bearing only.
      if (typeof leg.magneticBearing !== 'number') {
        return t('flight:route.trueOnly', { bearing: Math.round(leg.trueBearing) });
      }
      return `${Math.round(leg.magneticBearing)}°`;
    case 'cumDistance':
      return leg ? units.distance(leg.cumulativeDistance) : '-';
    case 'cumTime':
      return formatLegDuration(leg?.cumulativeTime);
    case 'trueBearing':
      return leg ? `${Math.round(leg.trueBearing)}°` : '-';
    case 'annotations':
      return annotationFieldCount(notes.waypoints[waypointAnnotationKey(side, flight.groupId, routeIndex)]);
  }
}

// Owner: P1 (フライト作業画面). The selected flight: header, the wingman card (own side only), and the
// four subviews (SPEC 1.3): navigation log (default), comms, lineup and notes.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Segmented } from '../../shell/Segmented';
import { SideMark } from '../../shell/SideMark';
import { useMission } from '../../shell/MissionContext';
import { useUnits } from '../../shell/units';
import { EXPORT_FLIGHT_ANCHOR, parseFocusAnchor, useWorkspace } from '../../shell/workspace';
import type { Flight, Side } from '../../types/mission';
import RouteTable from './RouteTable';
import type { OptionalRouteColumn, RouteFocusRequest } from './RouteTable';
import { CommsView, FlightNotesView, LineupView } from './FlightSubviews';
import { formatMegahertz, formatModulation, isClientFlight } from './flightModel';
import type { FlightNotesDraft } from './flightModel';
import { SoloMapMenu } from './SoloMapMenu';
import WingmanCard from './WingmanCard';
import { flightKey } from '../../utils/flightKey';

export type FlightSubview = 'nav' | 'comms' | 'lineup' | 'notes';

interface FlightDetailProps {
  side: Side;
  flight: Flight;
  /** Unsaved notes of this flight, held by the flight screen. */
  noteDraft: FlightNotesDraft | undefined;
  onNoteDraftChange: (key: string, draft: FlightNotesDraft | null) => void;
}

export default function FlightDetail({ side, flight, noteDraft, onNoteDraftChange }: FlightDetailProps) {
  const { t } = useTranslation('flight');
  const { side: displayedSide, viewMode } = useMission();
  const { jumpTo, focusAnchor, clearFocusAnchor, routeFocus, setRouteFocus } = useWorkspace();
  const units = useUnits();
  const [subview, setSubview] = useState<FlightSubview>('nav');
  const [optionalColumns, setOptionalColumns] = useState<ReadonlySet<OptionalRouteColumn>>(() => new Set());
  const [focusRequest, setFocusRequest] = useState<RouteFocusRequest | null>(null);
  // The route table reports the request as applied, so leaving the navigation log and coming back does not focus the row again.
  const handleFocusRequestDone = useCallback(() => setFocusRequest(null), []);

  const key = flightKey(side, flight.groupId);
  // The selected route point is the workspace's routeFocus, so it survives a change of screen (T8).
  const selectedIndex = routeFocus !== null && routeFocus.flightKey === key && flight.route[routeFocus.routeIndex] !== undefined
    ? routeFocus.routeIndex
    : null;

  // A route anchor (route:<flightKey>:<point index>) selects the point, shows the navigation log and focuses the row.
  // The anchor carries the DCS point index, so it is mapped to the position in the route array. Any other anchor is
  // left for the screen that owns it (the export anchor is read by the export screen).
  useEffect(() => {
    if (focusAnchor === null) return;
    const target = parseFocusAnchor(focusAnchor);
    if (target?.kind !== 'route') return;
    clearFocusAnchor();
    if (target.flightKey !== key) return;
    const index = flight.route.findIndex(point => point.index === target.index);
    if (index < 0) return;
    setSubview('nav');
    setRouteFocus({ flightKey: key, routeIndex: index });
    setFocusRequest({ routeIndex: index });
  }, [focusAnchor, key, flight.route, clearFocusAnchor, setRouteFocus]);

  const callsign = flight.callsign || flight.name;
  const firstPoint = flight.route[0];
  const firstEta = firstPoint ? units.time(firstPoint.eta) : '-';
  const subviewOptions: { value: FlightSubview; label: string }[] = [
    { value: 'nav', label: t('flight:subview.nav') },
    { value: 'comms', label: t('flight:subview.comms') },
    { value: 'lineup', label: t('flight:subview.lineup') },
    { value: 'notes', label: t('flight:subview.notes') },
  ];

  return (
    <section className="flight-detail" aria-labelledby="flight-detail-title">
      <header className="flight-header">
        <div className="flight-title-block">
          <p className="flight-title-line">
            <SideMark side={side} />
            {viewMode === 'creator' && flight.hidden && <span className="flight-badge">{t('flight:header.hidden')}</span>}
            {viewMode === 'creator' && !isClientFlight(flight) && <span className="flight-badge">{t('flight:header.aiOnly')}</span>}
          </p>
          <h2 id="flight-detail-title" className="flight-callsign">{callsign}</h2>
          {flight.name && flight.name !== callsign && <p className="flight-name">{flight.name}</p>}
        </div>
        <dl className="flight-facts">
          <div>
            <dt>{t('flight:header.aircraft')}</dt>
            <dd>{flight.type} · {t('flight:header.unitCount', { count: flight.units.length })}</dd>
          </div>
          <div>
            <dt>{t('flight:header.task')}</dt>
            <dd>{flight.task || '-'}</dd>
          </div>
          <div>
            <dt>{t('flight:header.frequency')}</dt>
            <dd>{formatMegahertz(flight.frequency)} {formatModulation(flight.modulation)}</dd>
          </div>
          <div>
            <dt>{t('flight:header.firstEta')}</dt>
            <dd>{firstEta}</dd>
          </div>
        </dl>
        <div className="flight-header-actions">
          <SoloMapMenu
            side={side}
            groupId={flight.groupId}
            triggerLabel={t('flight:header.mapMenu')}
            triggerClassName="flight-button flight-map-toggle"
          />
          {/* The export screen takes its target from this flight (SPEC 1.3: 出力画面へ、対象＝このフライト). */}
          <button
            type="button"
            className="flight-button flight-button-primary flight-export"
            onClick={() => jumpTo('export', { flightKey: key, anchor: EXPORT_FLIGHT_ANCHOR })}
          >
            {t('flight:header.export')}
          </button>
        </div>
      </header>

      {side === displayedSide && (
        <div className="flight-wingman-slot">
          {/* Keyed by the flight, so a notice about the wingman choice does not outlive the flight it was about. */}
          <WingmanCard key={key} flight={flight} />
        </div>
      )}

      <Segmented
        className="flight-subviews"
        label={t('flight:subview.label')}
        value={subview}
        options={subviewOptions}
        onChange={setSubview}
      />

      <div className="flight-subview-body" role="region" aria-label={subviewOptions.find(option => option.value === subview)?.label}>
        {subview === 'nav' && (
          <RouteTable
            side={side}
            flight={flight}
            selectedIndex={selectedIndex}
            onSelectIndex={next => setRouteFocus(next === null ? null : { flightKey: key, routeIndex: next })}
            focusRequest={focusRequest}
            onFocusRequestDone={handleFocusRequestDone}
            optionalColumns={optionalColumns}
            onOptionalColumnsChange={setOptionalColumns}
          />
        )}
        {subview === 'comms' && <CommsView flight={flight} />}
        {subview === 'lineup' && <LineupView flight={flight} />}
        {subview === 'notes' && (
          <FlightNotesView
            side={side}
            flight={flight}
            draft={noteDraft}
            onDraftChange={onNoteDraftChange}
          />
        )}
      </div>
    </section>
  );
}

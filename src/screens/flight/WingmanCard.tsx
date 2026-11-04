import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMission } from '../../shell/MissionContext';
import { Notice } from '../../shell/Notice';
import { Unresolved } from '../../shell/Unresolved';
import { useUnits } from '../../shell/units';
import { useWorkspace } from '../../shell/workspace';
import type { Flight, LegInfo, MissionData, RoutePoint, Side, Unit } from '../../types/mission';
import { formatLegDuration } from '../../utils/routeLegs';
import { flightKey } from '../../utils/flightKey';
import { hasEta } from '../../utils/time';
import { isWingmanUnit, sideOfFlight, useWingmanSlot, writeWingmanSlot, type WingmanSlot } from '../../utils/wingmanSlot';

// The aircraft chosen as "自機" on this device (F4). On the flight that holds it, the
// card shows the radios and the next point. On other flights it only offers a link to
// the chosen flight. Nothing is shown for a flight that is not in the displayed view
// (pilot view, D1). The next-point cursor is kept on screen only. The card is never
// printed (see lineup.css).
export interface WingmanCardProps {
  flight: Flight;
}

/** Outcome of the last "clear" press. The card is removed by a clear, so this line carries the result and the focus. */
type ClearResult = 'none' | 'cleared' | 'failed';

/** A clear result with the flight it was made on. The result is shown only on that flight. */
interface ClearOutcome {
  flightId: string;
  result: ClearResult;
}

const NO_OUTCOME: ClearOutcome = { flightId: '', result: 'none' };

export default function WingmanCard({ flight }: WingmanCardProps) {
  const { t } = useTranslation('wingman');
  const { view } = useMission();
  const slot = useWingmanSlot();
  // Kept here, not in WingmanDetail: a refused clear removes the card, and the result must stay.
  const [clearOutcome, setClearOutcome] = useState<ClearOutcome>(NO_OUTCOME);
  const resultRef = useRef<HTMLDivElement>(null);

  // Pilot view (D1): a flight of the other side is absent from `view`, so it finds no side and stays hidden.
  const side = sideOfFlight(view, flight);
  const flightId = side === null ? '' : flightKey(side, flight.groupId);
  // The result is read as "none" on any other flight. A result that belongs to another flight is also dropped while
  // rendering (the React pattern for state that follows a prop), so returning to its flight does not bring it back.
  const clearResult: ClearResult = clearOutcome.flightId === flightId ? clearOutcome.result : 'none';
  if (clearOutcome.flightId !== flightId && clearOutcome.result !== 'none') setClearOutcome(NO_OUTCOME);

  // A new choice ends the clear result (it refers to the choice that was cleared or could not be cleared).
  useEffect(() => {
    if (slot !== null) setClearOutcome(NO_OUTCOME);
  }, [slot]);

  // The card that held the focus is gone after a clear, so the result line takes it.
  useEffect(() => {
    if (clearResult !== 'none') resultRef.current?.focus();
  }, [clearResult]);

  const missionKey = view.userNotes.missionKey;
  if (side === null) return null;

  const unit = flight.units.find(candidate => isWingmanUnit(slot, missionKey, side, flight, candidate.unitId));
  const clearChoice = () => setClearOutcome({ flightId, result: writeWingmanSlot(null) ? 'cleared' : 'failed' });

  return (
    <>
      {unit
        ? <WingmanDetail flight={flight} unit={unit} onClear={clearChoice} />
        : <WingmanElsewhere view={view} slot={slot} missionKey={missionKey} />}
      {clearResult !== 'none' && (
        <div className="wingman-save-notice" role="status" tabIndex={-1} ref={resultRef}>
          {clearResult === 'failed'
            ? <Notice tone="warning">{t('wingman:clearFailed')}</Notice>
            : <p className="wingman-cleared">{t('wingman:card.cleared')}</p>}
        </div>
      )}
    </>
  );
}

interface WingmanElsewhereProps {
  view: MissionData;
  slot: WingmanSlot | null;
  missionKey: string;
}

/** On another flight: name the chosen aircraft and open its flight. Renders nothing if that flight is not in the view. */
function WingmanElsewhere({ view, slot, missionKey }: WingmanElsewhereProps) {
  const { t } = useTranslation('wingman');
  const { setFlightKey } = useWorkspace();
  if (!slot || missionKey === '' || slot.missionKey !== missionKey) return null;

  const [sideText, groupText] = slot.flightKey.split(':');
  const side = sideText as Side;
  const groupId = Number(groupText);
  const chosenFlight = view.coalitions[side]?.flights.find(candidate => candidate.groupId === groupId);
  const chosenUnit = chosenFlight?.units.find(candidate => candidate.unitId === slot.unitId);
  if (!chosenFlight || !chosenUnit) return null;

  return (
    <div className="wingman-elsewhere">
      <span>{t('wingman:card.elsewhere', { callsign: chosenFlight.callsign, unit: chosenUnit.name })}</span>
      <button type="button" className="wingman-button" onClick={() => setFlightKey(slot.flightKey)}>
        {t('wingman:card.open')}
      </button>
    </div>
  );
}

/** Phones open the card by default (SPEC F4). Without matchMedia (old browsers, tests) it opens too. */
function openByDefault(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(max-width: 767px)').matches;
  } catch {
    return true;
  }
}

interface WingmanDetailProps {
  flight: Flight;
  unit: Unit;
  onClear: () => void;
}

function WingmanDetail({ flight, unit, onClear }: WingmanDetailProps) {
  const { t } = useTranslation('wingman');
  const units = useUnits();
  const route = flight.route ?? [];
  const lastIndex = Math.max(route.length - 1, 0);
  const [open, setOpen] = useState(openByDefault);

  // The cursor is remembered for this aircraft only; another aircraft starts at the first point.
  const cursorKey = `${flight.groupId}:${unit.unitId}`;
  const [cursor, setCursor] = useState<{ key: string; index: number }>({ key: cursorKey, index: 0 });
  const index = cursor.key === cursorKey ? Math.min(Math.max(cursor.index, 0), lastIndex) : 0;
  const point: RoutePoint | undefined = route[index];

  const radios = unit.radios ?? [];
  const atFirst = index === 0;
  const atLast = index >= lastIndex;
  // A leg is stored on the point it arrives at, so the leg from this point is the next point's leg.
  const nextLeg: LegInfo | undefined = atLast ? undefined : route[index + 1]?.leg;

  return (
    <details className="wingman-card" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="wingman-card-summary">
        {/* The inner box is flex; the summary itself stays a list item so the disclosure marker is kept. */}
        <span className="wingman-card-summary-inner">
          <span className="wingman-card-label">{t('wingman:card.title')}</span>
          <span className="wingman-card-name">{flight.callsign} · {unit.name}</span>
          {unit.tailNumber && <span className="wingman-card-tail num">{unit.tailNumber}</span>}
        </span>
      </summary>

      <div className="wingman-card-body">
        <section className="wingman-section" aria-label={t('wingman:card.radios')}>
          <h4 className="wingman-section-title">{t('wingman:card.radios')}</h4>
          {radios.length === 0 ? (
            <p className="wingman-empty">{t('wingman:lineup.noRadios')}</p>
          ) : (
            <ul className="wingman-radio-list">
              {radios.map((radio, radioIndex) => (
                <li key={`${radio.radio ?? 0}:${radio.channel}:${radioIndex}`} className="wingman-radio">
                  <span className="num wingman-radio-channel">{radio.channel}</span>
                  <span className="num wingman-radio-frequency">{radio.frequency.toFixed(3)}</span>
                  <span>{radio.modulation === 0 ? 'AM' : 'FM'}</span>
                  <span className="wingman-radio-name">{radio.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="wingman-section" aria-label={t('wingman:card.nextPoint')}>
          {point ? (
            <>
              {/* aria-disabled instead of disabled: the focused button keeps focus at either end of the route. */}
              <div className="wingman-point-nav">
                <button
                  type="button"
                  className="wingman-button"
                  aria-disabled={atFirst}
                  onClick={() => { if (!atFirst) setCursor({ key: cursorKey, index: index - 1 }); }}
                >
                  {t('wingman:card.prevPoint')}
                </button>
                <span className="num wingman-point-position" aria-live="polite" aria-atomic="true">
                  {t('wingman:card.pointPosition', { current: index + 1, total: route.length })}
                </span>
                <button
                  type="button"
                  className="wingman-button wingman-button-primary"
                  aria-disabled={atLast}
                  onClick={() => { if (!atLast) setCursor({ key: cursorKey, index: index + 1 }); }}
                >
                  {t('wingman:card.nextPoint')}
                </button>
              </div>
              <h4 className="wingman-point-name">{point.name}</h4>
              <dl className="wingman-point-facts">
                <div>
                  <dt>{t('wingman:card.action')}</dt>
                  <dd>{point.action}</dd>
                </div>
                <div>
                  <dt>{t('wingman:card.altitude')}</dt>
                  <dd className="num">
                    {units.alt(point.alt)}
                    {altTypeText(point.altType, t)}
                  </dd>
                </div>
                <div>
                  <dt>{t('wingman:card.speed')}</dt>
                  <dd className="num">{units.speed(point.speed)}</dd>
                </div>
                <div>
                  <dt>{t('wingman:card.eta')}</dt>
                  <dd className="num">{hasEta(point, index) ? units.time(point.eta) : '-'}</dd>
                </div>
                <div className="wingman-point-leg">
                  <dt>{t('wingman:card.leg')}</dt>
                  <dd className="num">
                    {atLast
                      ? t('wingman:card.lastPoint')
                      : nextLeg
                        ? `${units.distance(nextLeg.distance)} / ${formatLegDuration(nextLeg.time)} / ${formatBearing(nextLeg, t)}`
                        : t('wingman:card.noLeg')}
                  </dd>
                </div>
              </dl>
              <div className="wingman-point-coordinate">
                {point.latlonResolved === false || !point.latlon
                  ? <Unresolved xy={point.xy} />
                  : <span className="num">{units.coord(point.latlon, flight.type)}</span>}
              </div>
            </>
          ) : (
            <p className="wingman-empty">{t('wingman:card.noPoints')}</p>
          )}
        </section>

        <button
          type="button"
          className="wingman-button wingman-clear"
          onClick={onClear}
        >
          {t('wingman:card.clear')}
        </button>
      </div>
    </details>
  );
}

/** The altitude type as a label (SPEC F3: BARO = 気圧高度, RADIO = 対地高度). Unknown values get no label. */
function altTypeText(altType: RoutePoint['altType'], t: TFunction): string {
  if (altType === 'BARO') return t('wingman:card.altTypeFormat', { type: t('wingman:card.altBaro') });
  if (altType === 'RADIO') return t('wingman:card.altTypeFormat', { type: t('wingman:card.altRadio') });
  return '';
}

function formatBearing(leg: LegInfo, t: TFunction): string {
  const trueText = Math.round(leg.trueBearing).toString();
  if (leg.magneticBearing === undefined) {
    return t('wingman:card.bearingTrue', { value: trueText });
  }
  return t('wingman:card.bearingBoth', {
    trueBearing: trueText,
    magneticBearing: Math.round(leg.magneticBearing).toString(),
  });
}

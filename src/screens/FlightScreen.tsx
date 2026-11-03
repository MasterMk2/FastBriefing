// Owner: P1 (フライト作業画面). Flight screen (SPEC 1.3 flights, F3, F4). Default export, no props (lazy).
// The selected flight is useWorkspace().flightKey. Data is read through useMission().view only, so a flight
// that is not in the displayed view (the opposing side in pilot view) is never shown (D1).
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../shell/EmptyState';
import { Notice } from '../shell/Notice';
import { useMission } from '../shell/MissionContext';
import { useWorkspace } from '../shell/workspace';
import { MapPanel } from '../map/MapPanel';
import type { Side } from '../types/mission';
import { flightKey } from '../utils/flightKey';
import FlightDetail from './flight/FlightDetail';
import { findSelectedFlight, isClientFlight } from './flight/flightModel';
import type { FlightNotesDraft } from './flight/flightModel';
import { readNoteDrafts, writeNoteDraft } from './flight/noteDrafts';
import type { NoteDraftMap } from './flight/noteDrafts';

/** The map pane sits beside the flight at this width and wider (SPEC 1.1, 1.3). */
const WIDE_MAP_QUERY = '(min-width: 1600px)';

export default function FlightScreen() {
  const { mission } = useMission();
  // Unsaved notes belong to the loaded mission: a different mission starts with none.
  return <FlightScreenBody key={mission.sourceFingerprint} />;
}

function FlightScreenBody() {
  const { t } = useTranslation('flight');
  const { mission, view, side, viewMode } = useMission();
  const { flightKey: selectedKey, setFlightKey } = useWorkspace();
  // Unsaved notes drafts by flight key. They live outside this component (noteDrafts.ts), so they survive a change
  // of flight and a change of screen, which unmounts this component.
  const fingerprint = mission.sourceFingerprint;
  const [noteDrafts, setNoteDrafts] = useState<NoteDraftMap>(() => readNoteDrafts(fingerprint));
  const setNoteDraft = useCallback((key: string, draft: FlightNotesDraft | null) => {
    setNoteDrafts(writeNoteDraft(fingerprint, key, draft));
  }, [fingerprint]);
  const wide = useMediaQuery(WIDE_MAP_QUERY);
  const selected = findSelectedFlight(view, selectedKey);
  const ownFlights = view.coalitions[side].flights;
  const opposing: Side = side === 'blue' ? 'red' : 'blue';
  const opposingFlights = viewMode === 'creator' ? view.coalitions[opposing].flights : [];
  const hasClient = ownFlights.some(isClientFlight);
  // Empty guidance is shown only when no flight can be chosen at all (the flight screen opens on a selection, T7).
  const selectableCount = ownFlights.length + opposingFlights.length;

  const choose = (event: ChangeEvent<HTMLSelectElement>) => {
    setFlightKey(event.target.value === '' ? null : event.target.value);
  };

  return (
    <div className="flight-screen">
      {/* Below 1280px there is no left rail, so the flight is chosen here (SPEC 3, flights). */}
      {selectableCount > 0 && (
        <div className="flight-screen-picker">
          <label htmlFor="flight-screen-select">{t('flight:screen.choose')}</label>
          <select
            id="flight-screen-select"
            value={selected ? flightKey(selected.side, selected.flight.groupId) : ''}
            onChange={choose}
          >
            <option value="">{t('flight:screen.chooseNone')}</option>
            {ownFlights.length > 0 && (
              <optgroup label={t(`shell:side.${side}`)}>
                {ownFlights.map(flight => (
                  <option key={flight.groupId} value={flightKey(side, flight.groupId)}>
                    {flight.callsign || flight.name} · {flight.type}
                  </option>
                ))}
              </optgroup>
            )}
            {opposingFlights.length > 0 && (
              <optgroup label={t(`shell:side.${opposing}`)}>
                {opposingFlights.map(flight => (
                  <option key={flight.groupId} value={flightKey(opposing, flight.groupId)}>
                    {flight.callsign || flight.name} · {flight.type}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      {selectableCount === 0 && (
        <EmptyState title={t('flight:screen.noFlights')} body={t('flight:screen.noFlightsBody')} />
      )}
      {ownFlights.length > 0 && !hasClient && (
        <Notice tone="info" title={t('flight:screen.noClient')}>{t('flight:screen.noClientBody')}</Notice>
      )}

      {/* Nothing chosen (the user chose "none") while flights can be chosen: a hint, not an empty state. */}
      {selectableCount > 0 && !selected && (
        <p className="hint flight-screen-hint">{t('flight:screen.pickFlightBody')}</p>
      )}

      {/* One thing at a time: the empty state above and the flight detail are never shown together. */}
      {selected && (
        <div className={`flight-screen-body${wide ? ' is-wide' : ''}`}>
          <FlightDetail
            key={flightKey(selected.side, selected.flight.groupId)}
            side={selected.side}
            flight={selected.flight}
            noteDraft={noteDrafts[flightKey(selected.side, selected.flight.groupId)]}
            onNoteDraftChange={setNoteDraft}
          />
          {wide && (
            <aside className="flight-map-pane" aria-label={t('flight:screen.mapPane')}>
              <MapPanel height="100%" />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

/** Tracks a media query. Without matchMedia (for example in a test environment) the query does not match. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatch(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

function readMatch(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

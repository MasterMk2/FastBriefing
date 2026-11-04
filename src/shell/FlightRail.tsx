// Owner: P0 (土台, frame). Left rail flight list under the item list (SPEC 1.1). Rows come from
// P1's FlightRow (src/screens/flight/FlightRow.tsx). P1 may change the list details but keeps the search
// field, the count and the row action (select flight, open the flight screen).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FlightRow from '../screens/flight/FlightRow';
import type { Flight, Side } from '../types/mission';
import { flightKey } from '../utils/flightKey';
import { useMission } from './MissionContext';
import { useWorkspace } from './workspace';

function matches(flight: Flight, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [flight.callsign, flight.name, flight.type].some(value => value.toLowerCase().includes(needle));
}

export function FlightRail() {
  const { t } = useTranslation('shell');
  const { view, side, viewMode } = useMission();
  const { flightKey: selectedKey, setFlightKey, setScreen } = useWorkspace();
  const [query, setQuery] = useState('');

  const ownFlights = view.coalitions[side].flights;
  const visible = useMemo(() => ownFlights.filter(flight => matches(flight, query.trim())), [ownFlights, query]);
  const opposing: Side = side === 'blue' ? 'red' : 'blue';
  const opposingFlights = viewMode === 'creator' ? view.coalitions[opposing].flights : [];

  const select = (flightSide: Side, flight: Flight) => {
    setFlightKey(flightKey(flightSide, flight.groupId));
    setScreen('flights');
  };

  return (
    <section className="flight-rail" aria-label={t('shell:rail.title')}>
      <h2 className="flight-rail-title">{t('shell:rail.title')}</h2>
      <label className="visually-hidden" htmlFor="flight-rail-search">{t('shell:rail.search')}</label>
      <input
        id="flight-rail-search"
        type="search"
        className="flight-rail-search"
        placeholder={t('shell:rail.search')}
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      <p className="flight-rail-count">{t('shell:rail.count', { count: visible.length })}</p>
      {ownFlights.length === 0 && <p className="flight-rail-empty">{t('shell:rail.empty')}</p>}
      {ownFlights.length > 0 && visible.length === 0 && (
        <p className="flight-rail-empty">
          {t('shell:rail.noMatch')}{' '}
          <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>{t('shell:rail.clearSearch')}</button>
        </p>
      )}
      <ul className="flight-rail-list">
        {visible.map(flight => (
          <li key={flight.groupId}>
            <FlightRow
              flight={flight}
              side={side}
              selected={selectedKey === flightKey(side, flight.groupId)}
              onSelect={() => select(side, flight)}
            />
          </li>
        ))}
      </ul>
      {opposingFlights.length > 0 && (
        <details className="flight-rail-opposing">
          <summary>{t('shell:rail.opponent')} ({opposingFlights.length})</summary>
          <ul className="flight-rail-list">
            {opposingFlights.map(flight => (
              <li key={flight.groupId}>
                <FlightRow
                  flight={flight}
                  side={opposing}
                  selected={selectedKey === flightKey(opposing, flight.groupId)}
                  onSelect={() => select(opposing, flight)}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

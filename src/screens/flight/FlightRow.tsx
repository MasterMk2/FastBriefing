// Owner: P1 (フライト作業画面). Left rail row (SPEC 1.1, 1.3). Contract props are frozen (FlightRowProps).
// The row is the only action in the rail: select the flight and open the flight screen (see FlightRail).
import { useTranslation } from 'react-i18next';
import { SideMark } from '../../shell/SideMark';
import type { Flight, Side } from '../../types/mission';
import { formatMegahertz, formatModulation } from './flightModel';

export interface FlightRowProps {
  flight: Flight;
  side: Side;
  selected: boolean;
  onSelect: () => void;
}

export default function FlightRow({ flight, side, selected, onSelect }: FlightRowProps) {
  const { t } = useTranslation('flight');
  const callsign = flight.callsign || flight.name;
  return (
    <button
      type="button"
      className={`flight-row${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      title={`${callsign} · ${flight.name}`}
      onClick={onSelect}
    >
      {/* The side name is visible with the mark (SPEC 1.4: the shape always comes with a text label). */}
      <SideMark side={side} />
      <span className="flight-row-callsign">{callsign}</span>
      <span className="flight-row-meta">
        <span className="flight-row-type">{t('flight:row.type', { type: flight.type, count: flight.units.length })}</span>
        <span className="flight-row-freq">{formatMegahertz(flight.frequency)} {formatModulation(flight.modulation)}</span>
      </span>
    </button>
  );
}

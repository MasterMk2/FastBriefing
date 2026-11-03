// STUB. Owner: P1 (フライト作業画面). P1 replaces this file's body.
// Contract (frozen): default export FlightRow, props FlightRowProps below. Used by the left rail
//   (src/shell/FlightRail.tsx) for own-side flights and for the collapsed opposing side in creator view.
//   onSelect is the only action; the rail sets the selected flight and opens the flight screen.
import { SideMark } from '../../shell/SideMark';
import type { Flight, Side } from '../../types/mission';

export interface FlightRowProps {
  flight: Flight;
  side: Side;
  selected: boolean;
  onSelect: () => void;
}

/** Frequency is stored in Hz in the mission model; the row shows MHz to three decimals. */
function formatMegahertz(hertz: number): string {
  return `${(hertz / 1_000_000).toFixed(3)} MHz`;
}

export default function FlightRow({ flight, side, selected, onSelect }: FlightRowProps) {
  return (
    <button
      type="button"
      className={`flight-row${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <SideMark side={side} showLabel={false} />
      <span className="flight-row-callsign">{flight.callsign}</span>
      <span className="flight-row-type">{flight.type}</span>
      <span className="flight-row-freq">{formatMegahertz(flight.frequency)}</span>
    </button>
  );
}

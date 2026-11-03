// STUB. Owner: P7 (自機カードとラインナップ). P7 replaces this file's body.
// Contract (frozen): default export LineupCard, props LineupCardProps below.
//   Shows the lineup of the lead aircraft (callsign, tail number, type, station order, fuel, radios,
//   laser code, Link16). Used by P1 in the flight screen's lineup subview.
import type { Flight, Unit } from '../../types/mission';

export interface LineupCardProps {
  flight: Flight;
  unit: Unit;
}

export default function LineupCard({ flight, unit }: LineupCardProps) {
  return (
    <section className="lineup-card" aria-label={flight.callsign}>
      <p className="lineup-card-title">{flight.callsign} / {unit.name}</p>
    </section>
  );
}

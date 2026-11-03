import type { MissionData, Side } from '../types/mission';
import { missionLocalDateAt, missionZuluDateAt } from '../utils/time';
import { flightKey } from '../utils/flightKey';
import { isResolvedLatLon } from '../briefing/slides';

/** Two points closer than this in time (seconds) and in distance (metres) are listed as near (F7). */
export const TOT_NEAR_SECONDS = 60;
export const TOT_NEAR_METERS = 1000;

export interface TotNear {
  flightKey: string;
  callsign: string;
  pointName: string;
}

export interface TotRow {
  flightKey: string;
  callsign: string;
  aircraftType: string;
  pointIndex: number;
  pointName: string;
  /** Seconds after mission start (RoutePoint.eta). Always greater than 0. */
  eta: number;
  /** Local and Zulu clocks of the point; the date rolls over past midnight. */
  localDate: Date;
  zuluDate: Date;
  xy: [number, number];
  latlon: [number, number];
  resolved: boolean;
  near: TotNear[];
}

export interface TotResult {
  /** Points of the given side, sorted by time. */
  rows: TotRow[];
  /** Points with eta 0 (or not a positive number). They are left out of rows. */
  zeroEtaCount: number;
}

interface Candidate {
  row: TotRow;
  order: number;
}

/**
 * Time-over-target list for one coalition (SPEC 5.1 F7). Uses the displayed mission
 * (`useMission().view`), so the pilot view only lists its own side.
 */
export function buildTot(mission: MissionData, side: Side): TotResult {
  const meta = mission.meta;
  const candidates: Candidate[] = [];
  let zeroEtaCount = 0;
  let order = 0;

  for (const flight of mission.coalitions[side].flights) {
    const key = flightKey(side, flight.groupId);
    flight.route.forEach((point, pointIndex) => {
      if (!(point.eta > 0)) {
        zeroEtaCount += 1;
        return;
      }
      const row: TotRow = {
        flightKey: key,
        callsign: flight.callsign,
        aircraftType: flight.type,
        pointIndex,
        pointName: point.name,
        eta: point.eta,
        localDate: missionLocalDateAt(meta, point.eta),
        zuluDate: missionZuluDateAt(meta, point.eta),
        xy: point.xy,
        latlon: point.latlon,
        resolved: isResolvedLatLon(point.latlon, point.latlonResolved),
        near: [],
      };
      candidates.push({ row, order });
      order += 1;
    });
  }

  candidates.sort((a, b) => a.row.eta - b.row.eta || a.order - b.order);
  const rows = candidates.map(candidate => candidate.row);

  // Rows are sorted by eta, so only the following rows inside the time window can be near.
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (b.eta - a.eta > TOT_NEAR_SECONDS) break;
      // Two points of the same flight are its own route, not a conflict with another aircraft.
      if (a.flightKey === b.flightKey) continue;
      const distance = Math.hypot(a.xy[0] - b.xy[0], a.xy[1] - b.xy[1]);
      if (distance > TOT_NEAR_METERS) continue;
      a.near.push({ flightKey: b.flightKey, callsign: b.callsign, pointName: b.pointName });
      b.near.push({ flightKey: a.flightKey, callsign: a.callsign, pointName: a.pointName });
    }
  }

  return { rows, zeroEtaCount };
}

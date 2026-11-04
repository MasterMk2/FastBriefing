import type { Side } from '../types/mission';

/** Coalition part of a flight key. Neutral flights use the same key form as their notes (neutral:<groupId>). */
export type FlightKeySide = Side | 'neutral';

/**
 * Stable key for one flight (coalition plus DCS group id). The same key is the
 * notes key for per-flight notes, so the selection and the notes always agree.
 */
export function flightKey(side: FlightKeySide, groupId: number): string {
  return `${side}:${groupId}`;
}

export interface ParsedFlightKey {
  side: FlightKeySide;
  groupId: number;
}

/** Reads a key made by flightKey(). Any other text (including an empty value) returns null. */
export function parseFlightKey(key: string | null | undefined): ParsedFlightKey | null {
  if (!key) return null;
  const match = /^(blue|red|neutral):(\d+)$/.exec(key);
  if (!match) return null;
  return { side: match[1] as FlightKeySide, groupId: Number(match[2]) };
}

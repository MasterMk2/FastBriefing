import type { Side } from '../types/mission';

/**
 * Stable key for one flight (coalition plus DCS group id). The same key is the
 * notes key for per-flight notes, so the selection and the notes always agree.
 */
export function flightKey(side: Side, groupId: number): string {
  return `${side}:${groupId}`;
}

import type { MissionMeta } from '../types/mission';

/** The mission fields needed to calculate map-local and Zulu times. */
export type MissionTimeMeta = Pick<MissionMeta, 'date' | 'startTime' | 'utcOffset'>;

/**
 * Build the mission start as a UTC-based Date whose UTC fields represent the
 * map-local clock.  DCS stores startTime as seconds after map-local midnight;
 * using Date.UTC keeps the browser's own timezone out of the calculation.
 */
export function missionLocalDate(meta: MissionTimeMeta): Date {
  const { Year, Month, Day } = meta.date;
  const midnightUtc = Date.UTC(Year, Month - 1, Day, 0, 0, 0);
  return new Date(midnightUtc + meta.startTime * 1000);
}

/** Build the mission start as an actual UTC instant. */
export function missionZuluDate(meta: MissionTimeMeta): Date {
  return new Date(missionLocalDate(meta).getTime() - meta.utcOffset * 3600000);
}

/** Return a copy of date shifted by the given number of seconds. */
export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/** Format the UTC clock fields of a Date as HH:MM. */
export function formatTimeHHMM(date: Date): string {
  return date.toISOString().slice(11, 16);
}

/** Format the UTC clock fields of a Date as HH:MM:SS. */
export function formatTimeHHMMSS(date: Date): string {
  return date.toISOString().slice(11, 19);
}

/** Format the UTC calendar fields of a Date as YYYY-MM-DD. */
export function formatDateYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Format a fixed map offset without consulting the browser timezone. */
export function formatUtcOffset(offsetHours: number): string {
  if (!Number.isFinite(offsetHours)) return 'UTC';

  const sign = offsetHours < 0 ? '-' : '+';
  const totalMinutes = Math.round(Math.abs(offsetHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Mission-local ETA from elapsed seconds after mission start. */
export function missionLocalDateAt(meta: MissionTimeMeta, elapsedSeconds: number): Date {
  return addSeconds(missionLocalDate(meta), elapsedSeconds);
}

/** Zulu ETA from elapsed seconds after mission start. */
export function missionZuluDateAt(meta: MissionTimeMeta, elapsedSeconds: number): Date {
  return addSeconds(missionZuluDate(meta), elapsedSeconds);
}

/** Short aliases for callers that describe elapsed mission time as an ETA. */
export const etaLocalDate = missionLocalDateAt;
export const etaZuluDate = missionZuluDateAt;

/** Format a mission-local ETA clock value as HH:MM:SS. */
export function formatEtaLocal(meta: MissionTimeMeta, elapsedSeconds: number): string {
  return formatTimeHHMMSS(missionLocalDateAt(meta, elapsedSeconds));
}

/** Format a Zulu ETA clock value as HH:MM:SS. */
export function formatEtaZulu(meta: MissionTimeMeta, elapsedSeconds: number): string {
  return formatTimeHHMMSS(missionZuluDateAt(meta, elapsedSeconds));
}

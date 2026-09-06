import magneticVariationData from '../data/magneticVariation.json';

export type MagneticVariationTable = Record<string, number>;
export type MagneticVariationData = Record<string, MagneticVariationTable>;

/**
 * Representative theatre values, separated into JSON so they can be replaced
 * by a generated WMM table without changing the calculation API.
 */
export const MAGNETIC_VARIATION_DATA = magneticVariationData as MagneticVariationData;
export const MAGNETIC_VARIATION_THEATRES = Object.keys(MAGNETIC_VARIATION_DATA);

function decimalYear(date: Date): number | null {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;

  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const nextYearStart = Date.UTC(year + 1, 0, 1);
  return year + (timestamp - yearStart) / (nextYearStart - yearStart);
}

function interpolate(table: MagneticVariationTable, year: number): number {
  const points = Object.entries(table)
    .map(([key, value]) => [Number(key), value] as const)
    .filter(([pointYear, value]) => Number.isFinite(pointYear) && Number.isFinite(value))
    .sort(([left], [right]) => left - right);

  if (points.length === 0) return 0;
  if (year <= points[0][0]) return points[0][1];
  if (year >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let index = 1; index < points.length; index += 1) {
    const [upperYear, upperValue] = points[index];
    const [lowerYear, lowerValue] = points[index - 1];
    if (year <= upperYear) {
      const fraction = (year - lowerYear) / (upperYear - lowerYear);
      return lowerValue + (upperValue - lowerValue) * fraction;
    }
  }

  return points[points.length - 1][1];
}

/**
 * Return representative magnetic variation in degrees (east positive).
 *
 * This is intentionally the map-level approximation requested for the first
 * implementation: latitude/longitude are accepted for API compatibility and
 * future regional refinement, while the current JSON is theatre + year data.
 * Dates outside the table are clamped to the nearest available reference year.
 * Unknown theatres and invalid dates return 0°, which leaves a true bearing
 * unchanged while keeping the UI safe for custom maps.
 */
export function getMagneticVariation(theatre: string, _lat: number, _lon: number, date: Date): number {
  const year = decimalYear(date);
  if (year === null) return 0;

  const table = MAGNETIC_VARIATION_DATA[theatre];
  return table ? interpolate(table, year) : 0;
}

function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/** Convert a true bearing to a magnetic bearing (east variation subtracts). */
export function trueToMagnetic(trueBearing: number, magneticVariation: number): number {
  return normalizeBearing(trueBearing - magneticVariation);
}

/** Convert a magnetic bearing to a true bearing (east variation adds). */
export function magneticToTrue(magneticBearing: number, magneticVariation: number): number {
  return normalizeBearing(magneticBearing + magneticVariation);
}

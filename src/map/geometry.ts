import L from 'leaflet';
import { dcsToLatLon, PROJECTIONS } from '../utils/coordinates';

/** Latitude and longitude in degrees. */
export type LatLon = [number, number];

export const DEFAULT_CENTER: LatLon = [42.0, 43.0];
export const DEFAULT_ZOOM = 7;

/**
 * A coordinate can be drawn only when it is a finite pair that is not the
 * [0, 0] placeholder (SPEC 3: unresolved points are never drawn at [0, 0]).
 */
export function isResolvedLatLon(value: unknown, resolved?: boolean): value is LatLon {
  if (resolved === false || !Array.isArray(value) || value.length < 2) return false;
  const [lat, lon] = value;
  return typeof lat === 'number'
    && Number.isFinite(lat)
    && typeof lon === 'number'
    && Number.isFinite(lon)
    && (lat !== 0 || lon !== 0);
}

/** True when the theatre has a DCS-to-latitude projection. Unknown maps show the DCS table instead. */
export function isSupportedTheatre(theatre: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROJECTIONS, theatre);
}

export function getDcsCoordinate(theatre: string, x: number, y: number): LatLon | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !isSupportedTheatre(theatre)) return null;
  const coordinate = dcsToLatLon(theatre, x, y);
  return isResolvedLatLon(coordinate) ? coordinate : null;
}

/** Latitude and longitude when the parser resolved them, otherwise a projection of the DCS position. */
export function resolveEntityPosition(
  theatre: string,
  latlon: unknown,
  latlonResolved: boolean | undefined,
  xy: [number, number] | undefined,
): LatLon | null {
  if (latlonResolved === false) return null;
  if (isResolvedLatLon(latlon, latlonResolved)) return latlon;
  return xy ? getDcsCoordinate(theatre, xy[0], xy[1]) : null;
}

/** Extends bounds by a circle of `radius` metres around `center` (approximate, for fitting only). */
export function extendBoundsByMeters(bounds: L.LatLngBounds, center: LatLon, radius: number): void {
  if (!Number.isFinite(radius) || radius <= 0) return;
  const latitudeDelta = radius / 111_320;
  const longitudeScale = Math.max(Math.cos(center[0] * Math.PI / 180), 0.01);
  const longitudeDelta = radius / (111_320 * longitudeScale);
  bounds.extend([center[0] - latitudeDelta, center[1] - longitudeDelta]);
  bounds.extend([center[0] + latitudeDelta, center[1] + longitudeDelta]);
}

/**
 * DCS colour (RGB or RGBA, 0–1 or 0–255) as a CSS colour. Returns null when the
 * value is not usable, so the caller can fall back to a theme class.
 */
export function dcsColorToCss(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (!Array.isArray(value) || value.length < 3) return null;
  const channels = value.slice(0, 3).map(channel => typeof channel === 'number' ? channel : Number(channel));
  if (channels.some(channel => !Number.isFinite(channel))) return null;
  // Channels are either 0–1 (scale up to 0–255) or already 0–255.
  const factor = Math.max(...channels) <= 1 ? 255 : 1;
  const rgb = channels.map(channel => Math.round(Math.min(255, Math.max(0, channel * factor))));
  const rawAlpha = value[3];
  const alphaValue = rawAlpha === undefined ? 1 : typeof rawAlpha === 'number' ? rawAlpha : Number(rawAlpha);
  if (!Number.isFinite(alphaValue)) return null;
  const alpha = Math.min(1, Math.max(0, alphaValue <= 1 ? alphaValue : alphaValue / 255));
  return alpha < 1 ? `rgba(${rgb.join(', ')}, ${alpha})` : `rgb(${rgb.join(', ')})`;
}

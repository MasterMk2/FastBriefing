import proj4 from 'proj4';
import mgrs from 'mgrs';
import aircraftCoordinateDefaults from '../data/aircraftCoordinateDefaults.json';
import type { CoordinateFormat } from '../types/mission';

/**
 * MGRS accuracy is the number of digits used for each of the easting and
 * northing values.  Therefore accuracy 4 produces the FR-12 eight-digit
 * reference (four digits east and four digits north).
 */
export type MGRSAccuracy = 1 | 2 | 3 | 4 | 5;
export const DEFAULT_MGRS_ACCURACY: MGRSAccuracy = 4;

export interface ProjectionParams {
  central_meridian: number;
  false_easting: number;
  false_northing: number;
  scale_factor: number;
}

export const PROJECTIONS: Record<string, ProjectionParams> = {
  Caucasus: {
    central_meridian: 33,
    false_easting: -99516.9999999732,
    false_northing: -4998114.999999984,
    scale_factor: 0.9996,
  },
  MarianaIslands: {
    central_meridian: 147,
    false_easting: 238417.99999989968,
    false_northing: -1491840.000000048,
    scale_factor: 0.9996,
  },
  Syria: {
    central_meridian: 39,
    false_easting: 282801.00000003993,
    false_northing: -3879865.9999999935,
    scale_factor: 0.9996,
  },
  Nevada: {
    central_meridian: -117,
    false_easting: 292500,
    false_northing: -4265000,
    scale_factor: 0.9996,
  },
  Normandy: {
    central_meridian: -3,
    false_easting: 300000,
    false_northing: -5200000,
    scale_factor: 0.9996,
  },
  PersianGulf: {
    central_meridian: 51,
    false_easting: 300000,
    false_northing: -3000000,
    scale_factor: 0.9996,
  },
  TheChannel: {
    central_meridian: -2,
    false_easting: 300000,
    false_northing: -5700000,
    scale_factor: 0.9996,
  },
  Falklands: {
    central_meridian: -60,
    false_easting: 300000,
    false_northing: -5700000,
    scale_factor: 0.9996,
  },
  Sinai: {
    central_meridian: 33,
    false_easting: 300000,
    false_northing: -3400000,
    scale_factor: 0.9996,
  },
  Kola: {
    central_meridian: 33,
    false_easting: 300000,
    false_northing: -7500000,
    scale_factor: 0.9996,
  },
  GermanyCW: {
    central_meridian: 10.5,
    false_easting: 300000,
    false_northing: -5500000,
    scale_factor: 0.9996,
  },
};

function getProjString(params: ProjectionParams): string {
  return `+proj=tmerc +lat_0=0 +lon_0=${params.central_meridian} +k_0=${params.scale_factor} +x_0=${params.false_easting} +y_0=${params.false_northing} +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +axis=neu`;
}

const projCache = new Map<string, proj4.Converter>();

function getConverter(theatre: string): proj4.Converter | null {
  const params = PROJECTIONS[theatre];
  if (!params) return null;
  
  if (!projCache.has(theatre)) {
    const projStr = getProjString(params);
    const converter = proj4(projStr, 'EPSG:4326');
    projCache.set(theatre, converter);
  }
  
  return projCache.get(theatre)!;
}

export function dcsToLatLon(theatre: string, x: number, y: number): [number, number] | null {
  const converter = getConverter(theatre);
  if (!converter) return null;
  
  const result = converter.forward([y, x]);
  return [result[1], result[0]];
}

export function latLonToDCS(theatre: string, lat: number, lon: number): [number, number] | null {
  const converter = getConverter(theatre);
  if (!converter) return null;
  
  const result = converter.inverse([lon, lat]);
  return [result[1], result[0]];
}

export function formatCoordinate(
  lat: number,
  lon: number,
  format: CoordinateFormat,
  mgrsAccuracy: number = DEFAULT_MGRS_ACCURACY,
): string {
  switch (format) {
    case 'DEC':
      return `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
    case 'DDM':
      return formatDDM(lat, lon);
    case 'DMS':
      return formatDMS(lat, lon);
    case 'MGRS':
      return formatMGRS(lat, lon, mgrsAccuracy);
    default:
      return formatDDM(lat, lon);
  }
}

function formatDDM(lat: number, lon: number): string {
  const latDeg = Math.floor(Math.abs(lat));
  const latMin = (Math.abs(lat) - latDeg) * 60;
  const lonDeg = Math.floor(Math.abs(lon));
  const lonMin = (Math.abs(lon) - lonDeg) * 60;
  
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  return `${latDeg}°${latMin.toFixed(2).padStart(5, '0')}′${latDir} ${lonDeg}°${lonMin.toFixed(2).padStart(5, '0')}′${lonDir}`;
}

function formatDMS(lat: number, lon: number): string {
  const latDeg = Math.floor(Math.abs(lat));
  const latMinFull = (Math.abs(lat) - latDeg) * 60;
  const latMin = Math.floor(latMinFull);
  const latSec = (latMinFull - latMin) * 60;
  
  const lonDeg = Math.floor(Math.abs(lon));
  const lonMinFull = (Math.abs(lon) - lonDeg) * 60;
  const lonMin = Math.floor(lonMinFull);
  const lonSec = (lonMinFull - lonMin) * 60;
  
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  return `${latDeg}°${latMin.toString().padStart(2, '0')}′${latSec.toFixed(2).padStart(5, '0')}″${latDir} ${lonDeg}°${lonMin.toString().padStart(2, '0')}′${lonSec.toFixed(2).padStart(5, '0')}″${lonDir}`;
}

function normalizeMGRSAccuracy(accuracy: number): MGRSAccuracy {
  if (accuracy >= 1 && accuracy <= 5 && Number.isInteger(accuracy)) {
    return accuracy as MGRSAccuracy;
  }
  return DEFAULT_MGRS_ACCURACY;
}

function formatMGRSFallback(lat: number, lon: number): string {
  const formatValue = (value: number): string => Number.isFinite(value) ? value.toFixed(4) : 'invalid';
  return `MGRS unavailable: ${formatValue(lat)}°, ${formatValue(lon)}°`;
}

/**
 * Convert WGS84 latitude/longitude to MGRS.
 *
 * The npm implementation also emits UPS references near the poles, but DCS
 * coordinate entry and this utility's FR-12 contract are UTM-oriented.  Keep
 * a deterministic decimal fallback for polar, invalid, or library-failure
 * inputs instead of allowing a conversion exception to reach the UI.
 */
export function formatMGRS(lat: number, lon: number, accuracy: number = DEFAULT_MGRS_ACCURACY): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -84 || lat > 84 || lon < -180 || lon > 180) {
    return formatMGRSFallback(lat, lon);
  }

  try {
    return mgrs.forward([lon, lat], normalizeMGRSAccuracy(accuracy));
  } catch {
    return formatMGRSFallback(lat, lon);
  }
}

const AIRCRAFT_DEFAULTS = aircraftCoordinateDefaults as Record<string, string>;

function isCoordinateFormat(value: string | undefined): value is CoordinateFormat {
  return value === 'DDM' || value === 'DMS' || value === 'MGRS' || value === 'DEC';
}

/**
 * Return the coordinate format normally used by a DCS unit type.
 * Unknown or empty types intentionally fall back to the application default.
 */
export function getDefaultCoordinateFormat(aircraftType: string | null | undefined): CoordinateFormat {
  const value = typeof aircraftType === 'string' ? AIRCRAFT_DEFAULTS[aircraftType.trim()] : undefined;
  return isCoordinateFormat(value) ? value : 'DDM';
}

/** Alias kept explicit for callers that phrase the lookup as aircraft format. */
export const getAircraftCoordinateFormat = getDefaultCoordinateFormat;

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

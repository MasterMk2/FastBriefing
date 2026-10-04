import proj4 from 'proj4';
import { forward as mgrsForward } from 'mgrs';
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

// These values mirror pydcs master dcs/terrain/*/projection.py.  Keep the
// false-northing sign exactly as published; Falklands is intentionally positive.
// Afghanistan/Iraq additionally cross-checked against independently calibrated
// VEAF/dcs-maps data; pinned sources and fixture provenance: docs/projection-sources.md.
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
    false_easting: -193996.80999964548,
    false_northing: -4410028.063999966,
    scale_factor: 0.9996,
  },
  Normandy: {
    central_meridian: -3,
    false_easting: -195526.00000000204,
    false_northing: -5484812.999999951,
    scale_factor: 0.9996,
  },
  PersianGulf: {
    central_meridian: 57,
    false_easting: 75755.99999999645,
    false_northing: -2894933.0000000377,
    scale_factor: 0.9996,
  },
  TheChannel: {
    central_meridian: 3,
    false_easting: 99376.00000000288,
    false_northing: -5636889.00000001,
    scale_factor: 0.9996,
  },
  Falklands: {
    central_meridian: -57,
    false_easting: 147639.99999997593,
    false_northing: 5815417.000000032,
    scale_factor: 0.9996,
  },
  Sinai: {
    central_meridian: 33,
    false_easting: 169221.9999999585,
    false_northing: -3325312.9999999693,
    scale_factor: 0.9996,
  },
  Kola: {
    central_meridian: 21,
    false_easting: -62702.00000000087,
    false_northing: -7543624.999999979,
    scale_factor: 0.9996,
  },
  Afghanistan: {
    central_meridian: 63,
    false_easting: -300149.9999999864,
    false_northing: -3759657.000000049,
    scale_factor: 0.9996,
  },
  Iraq: {
    central_meridian: 45,
    false_easting: 72290.00000004497,
    false_northing: -3680057.0,
    scale_factor: 0.9996,
  },
  GermanyCW: {
    central_meridian: 21,
    false_easting: 35427.619999985734,
    false_northing: -6061633.128000011,
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
  const latComponent = formatDDMComponent(lat, 90);
  const lonComponent = formatDDMComponent(lon, 180);
  
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  return `${latComponent.degrees}°${latComponent.minutes.toFixed(2).padStart(5, '0')}′${latDir} ${lonComponent.degrees}°${lonComponent.minutes.toFixed(2).padStart(5, '0')}′${lonDir}`;
}

function formatDMS(lat: number, lon: number): string {
  const latComponent = formatDMSComponent(lat, 90);
  const lonComponent = formatDMSComponent(lon, 180);
  
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  return `${latComponent.degrees}°${latComponent.minutes.toString().padStart(2, '0')}′${latComponent.seconds.toFixed(2).padStart(5, '0')}″${latDir} ${lonComponent.degrees}°${lonComponent.minutes.toString().padStart(2, '0')}′${lonComponent.seconds.toFixed(2).padStart(5, '0')}″${lonDir}`;
}

interface DDMComponent {
  degrees: number;
  minutes: number;
}

function formatDDMComponent(value: number, maximumDegrees: number): DDMComponent {
  const magnitude = Math.min(Math.abs(value), maximumDegrees);
  let degrees = Math.floor(magnitude);
  let minutes = Number(((magnitude - degrees) * 60).toFixed(2));

  // Round first, then carry 60.00 minutes into the degree component.
  if (minutes >= 60) {
    degrees += 1;
    minutes = 0;
  }

  if (degrees >= maximumDegrees) {
    degrees = maximumDegrees;
    minutes = 0;
  }

  return { degrees, minutes };
}

interface DMSComponent {
  degrees: number;
  minutes: number;
  seconds: number;
}

function formatDMSComponent(value: number, maximumDegrees: number): DMSComponent {
  const magnitude = Math.min(Math.abs(value), maximumDegrees);
  let degrees = Math.floor(magnitude);
  const minutesFull = (magnitude - degrees) * 60;
  let minutes = Math.floor(minutesFull);
  let seconds = Number(((minutesFull - minutes) * 60).toFixed(2));

  // Round first, then carry 60.00 seconds through minutes and degrees.
  if (seconds >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }

  if (degrees >= maximumDegrees) {
    degrees = maximumDegrees;
    minutes = 0;
    seconds = 0;
  }

  return { degrees, minutes, seconds };
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
    return mgrsForward([lon, lat], normalizeMGRSAccuracy(accuracy));
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

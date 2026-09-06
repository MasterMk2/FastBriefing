import type { Weather, WindLayer } from '../types/mission';

export interface MetarOptions {
  /** Optional ICAO station designator. */
  station?: string;
  /** Optional observation time. Date, ISO string, or epoch milliseconds. */
  time?: Date | string | number;
  /** Alias for callers that use the domain wording from the requirements. */
  referenceTime?: Date | string | number;
  windLevel?: WindLayer['level'];
  /** Q uses hPa; A uses hundredths of inHg. */
  pressureFormat?: 'Q' | 'A';
}
function pad(value: number, width: number): string {
  return Math.trunc(Math.abs(value)).toString().padStart(width, '0');
}

function signedMetarTemperature(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? 'M' : ''}${pad(rounded, 2)}`;
}

function formatObservationTime(value: MetarOptions['time']): string | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${pad(date.getUTCDate(), 2)}${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}Z`;
}

function formatWind(weather: Weather, level: WindLayer['level']): string {
  const wind = weather.wind.find(layer => layer.level === level) ?? weather.wind[0];
  if (!wind || !Number.isFinite(wind.speed)) return '00000KT';

  const direction = Number.isFinite(wind.from) ? Math.round(wind.from / 10) * 10 : 0;
  const normalizedDirection = direction === 360 ? 360 : ((direction % 360) + 360) % 360;
  const speedKt = Math.max(0, Math.round(wind.speed * 1.94384));
  return `${pad(normalizedDirection, 3)}${pad(speedKt, 2)}KT`;
}

function formatVisibility(weather: Weather): string {
  if (!Number.isFinite(weather.visibility) || weather.visibility <= 0 || weather.visibility >= 10000) {
    return '9999';
  }
  return pad(Math.round(weather.visibility), 4);
}

function cloudCoverage(weather: Weather): string | undefined {
  const coverage = weather.clouds.coverage?.toUpperCase();
  if (coverage === 'SKC' || coverage === 'FEW' || coverage === 'SCT' || coverage === 'BKN' || coverage === 'OVC') {
    return coverage;
  }

  const label = weather.clouds.label.toLowerCase();
  if (label.includes('overcast') || label.includes('broken')) return label.includes('broken') ? 'BKN' : 'OVC';
  if (label.includes('scattered')) return 'SCT';
  if (label.includes('few') || label.includes('light')) return 'FEW';
  if (weather.clouds.base <= 0) return 'SKC';
  return 'SCT';
}

function formatClouds(weather: Weather): string | undefined {
  const coverage = cloudCoverage(weather);
  if (!coverage || coverage === 'SKC') return coverage;

  // METAR cloud bases are hundreds of feet; DCS stores the base in metres.
  const hundredsOfFeet = Math.max(0, Math.round((weather.clouds.base * 3.28084) / 100));
  return `${coverage}${pad(hundredsOfFeet, 3)}`;
}

function formatPressure(weather: Weather, pressureFormat: 'Q' | 'A'): string {
  if (pressureFormat === 'A') {
    return `A${pad(Math.round(weather.qnh.inHg * 100), 4)}`;
  }
  return `Q${pad(Math.round(weather.qnh.hPa), 4)}`;
}

/**
 * Build a compact standard METAR observation from normalized DCS weather.
 * Cloud coverage and cloud-base conversion are intentionally approximate:
 * DCS presets describe multiple layers while this output contains one layer.
 */
export function buildMetar(weather: Weather, opts: MetarOptions = {}): string {
  const parts: string[] = [];
  if (opts.station) parts.push(opts.station.toUpperCase());

  const observationTime = formatObservationTime(opts.time ?? opts.referenceTime);
  if (observationTime) parts.push(observationTime);

  parts.push(formatWind(weather, opts.windLevel ?? 'ground'));
  parts.push(formatVisibility(weather));

  if (weather.clouds.weather?.toUpperCase().includes('RA') || weather.clouds.label.toLowerCase().includes('rain')) {
    parts.push('-RA');
  }

  const clouds = formatClouds(weather);
  if (clouds) parts.push(clouds);

  if (Number.isFinite(weather.temperature)) {
    const dewPoint = weather.dewPoint;
    parts.push(dewPoint === undefined
      ? `${signedMetarTemperature(weather.temperature)}//`
      : `${signedMetarTemperature(weather.temperature)}/${signedMetarTemperature(dewPoint)}`);
  }

  parts.push(formatPressure(weather, opts.pressureFormat ?? 'Q'));
  return parts.join(' ');
}

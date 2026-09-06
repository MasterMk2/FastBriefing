// 単位系の表示整形。値の保持は正規化層 (MissionNormalizer) が担い、
// ここでは選択された単位を「選ぶ」だけで、二重換算しない。

export function formatAltitude(meters: number, unit: 'ft' | 'm'): string {
  if (unit === 'ft') {
    return `${Math.round(meters * 3.28084)} ft`;
  }
  return `${Math.round(meters)} m`;
}

export function formatSpeed(ms: number, unit: 'kt' | 'kmh'): string {
  if (unit === 'kt') {
    return `${Math.round(ms * 1.94384)} kt`;
  }
  return `${Math.round(ms * 3.6)} km/h`;
}

export function formatDistance(meters: number, unit: 'nm' | 'km'): string {
  if (unit === 'nm') {
    return `${(meters / 1852).toFixed(1)} nm`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatTemperature(celsius: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    return `${(celsius * 9 / 5 + 32).toFixed(1)}°F`;
  }
  return `${celsius.toFixed(1)}°C`;
}

export function windFromTo(dirTo: number): { from: number; to: number } {
  const from = (dirTo + 180) % 360;
  return { from, to: dirTo };
}

/** The three pressure values carried by the normalized weather model. */
export interface PressureValues {
  mmHg: number;
  hPa: number;
  inHg: number;
}
export type PressureUnit = 'hPa' | 'inHg' | 'mmHg';

const HPA_PER_MMHG = 1.33322;
const INHG_PER_MMHG = 0.0393701;

export function pressureValuesFromMmHg(mmHg: number): PressureValues {
  return {
    mmHg,
    hPa: mmHg * HPA_PER_MMHG,
    inHg: mmHg * INHG_PER_MMHG,
  };
}

/**
 * Format a pressure value without applying a second conversion.
 *
 * The object overload is the preferred form: normalizeWeather computes all
 * three representations once and this function only selects one.  The
 * number overload is retained for existing component callers and interprets
 * the number as mmHg for backwards compatibility.
 */
export function formatPressure(qnh: PressureValues, unit: PressureUnit): string;
export function formatPressure(mmHg: number, unit: PressureUnit): string;
export function formatPressure(qnhOrMmHg: PressureValues | number, unit: PressureUnit): string {
  const qnh = typeof qnhOrMmHg === 'number'
    ? pressureValuesFromMmHg(qnhOrMmHg)
    : qnhOrMmHg;

  switch (unit) {
    case 'hPa':
      return `${qnh.hPa.toFixed(1)} hPa`;
    case 'inHg':
      return `${qnh.inHg.toFixed(2)} inHg`;
    case 'mmHg':
      return `${qnh.mmHg.toFixed(1)} mmHg`;
  }
}

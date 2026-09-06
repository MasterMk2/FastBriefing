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

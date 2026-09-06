import SunCalc from 'suncalc';

export type NullableDate = Date | null;

export interface SunTimes {
  solarNoon: NullableDate;
  nadir: NullableDate;
  sunrise: NullableDate;
  sunset: NullableDate;
  sunriseEnd: NullableDate;
  sunsetStart: NullableDate;
  dawn: NullableDate;
  dusk: NullableDate;
  nauticalDawn: NullableDate;
  nauticalDusk: NullableDate;
  nightEnd: NullableDate;
  night: NullableDate;
  goldenHourEnd: NullableDate;
  goldenHour: NullableDate;
}

export interface MoonInfo {
  /** SunCalc phase in the range [0, 1], where 0 and 1 are new moon. */
  phase: number;
  /** Illuminated fraction in the range [0, 1]. */
  fraction: number;
  /** Alias for fraction, convenient for UI callers. */
  illumination: number;
  /** Approximate age derived from phase, in days. */
  ageDays: number;
  /** Alias for ageDays. */
  moonAge: number;
  /** SunCalc signed phase angle in radians. */
  angle: number;
  rise: NullableDate;
  set: NullableDate;
  moonrise: NullableDate;
  moonset: NullableDate;
  alwaysUp: boolean;
  alwaysDown: boolean;
}

function utcDateOrNull(value: Date | undefined): NullableDate {
  if (!value || !Number.isFinite(value.getTime())) return null;
  // Date stores an absolute UTC instant; cloning prevents callers from
  // modifying the object retained by the underlying library.
  return new Date(value.getTime());
}

/**
 * Calculate solar events for a UTC instant and WGS84 latitude/longitude.
 *
 * The input Date is treated as an instant and is never converted with local
 * getters/setters.  SunCalc's Date results are returned as UTC instants; a
 * caller that needs DCS map-local time should add the theatre's fixed offset
 * separately.
 */
export function getSunTimes(date: Date, lat: number, lon: number): SunTimes {
  const times = SunCalc.getTimes(new Date(date.getTime()), lat, lon);
  return {
    solarNoon: utcDateOrNull(times.solarNoon),
    nadir: utcDateOrNull(times.nadir),
    sunrise: utcDateOrNull(times.sunrise),
    sunset: utcDateOrNull(times.sunset),
    sunriseEnd: utcDateOrNull(times.sunriseEnd),
    sunsetStart: utcDateOrNull(times.sunsetStart),
    dawn: utcDateOrNull(times.dawn),
    dusk: utcDateOrNull(times.dusk),
    nauticalDawn: utcDateOrNull(times.nauticalDawn),
    nauticalDusk: utcDateOrNull(times.nauticalDusk),
    nightEnd: utcDateOrNull(times.nightEnd),
    night: utcDateOrNull(times.night),
    goldenHourEnd: utcDateOrNull(times.goldenHourEnd),
    goldenHour: utcDateOrNull(times.goldenHour),
  };
}

/**
 * Calculate moon illumination, phase, and UTC rise/set events.
 *
 * `getMoonTimes(..., true)` is important here: it makes the day boundary UTC
 * based even when this code runs in a browser configured for another zone.
 */
export function getMoonInfo(date: Date, lat: number, lon: number): MoonInfo {
  const utcInput = new Date(date.getTime());
  const illumination = SunCalc.getMoonIllumination(utcInput);
  const moonTimes = SunCalc.getMoonTimes(utcInput, lat, lon, true);
  const ageDays = illumination.phase * 29.530588853;
  const rise = utcDateOrNull(moonTimes.rise);
  const set = utcDateOrNull(moonTimes.set);

  return {
    phase: illumination.phase,
    fraction: illumination.fraction,
    illumination: illumination.fraction,
    ageDays,
    moonAge: ageDays,
    angle: illumination.angle,
    rise,
    set,
    moonrise: rise,
    moonset: set,
    alwaysUp: moonTimes.alwaysUp === true,
    alwaysDown: moonTimes.alwaysDown === true,
  };
}

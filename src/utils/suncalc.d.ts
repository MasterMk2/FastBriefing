declare module 'suncalc' {
  export interface SunTimes {
    solarNoon: Date;
    nadir: Date;
    sunrise: Date;
    sunset: Date;
    sunriseEnd: Date;
    sunsetStart: Date;
    dawn: Date;
    dusk: Date;
    nauticalDawn: Date;
    nauticalDusk: Date;
    nightEnd: Date;
    night: Date;
    goldenHourEnd: Date;
    goldenHour: Date;
  }

  export interface MoonIllumination {
    fraction: number;
    phase: number;
    angle: number;
  }

  export interface MoonTimes {
    rise?: Date;
    set?: Date;
    alwaysUp?: boolean;
    alwaysDown?: boolean;
  }

  export interface SunCalcApi {
    getTimes(date: Date, lat: number, lon: number, height?: number): SunTimes;
    getMoonIllumination(date: Date): MoonIllumination;
    getMoonTimes(date: Date, lat: number, lon: number, inUTC?: boolean): MoonTimes;
  }

  const SunCalc: SunCalcApi;
  export default SunCalc;
}

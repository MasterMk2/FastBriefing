import { describe, expect, it } from 'vitest';
import { getMoonInfo, getSunTimes } from './astro';

const TEST_DATE = new Date(Date.UTC(2025, 4, 1, 0, 0, 0));
const TEST_LAT = 42.0;
const TEST_LON = 41.8;

describe('UTC solar and lunar calculations', () => {
  it('returns the requested solar events as UTC Date instants', () => {
    const originalTimestamp = TEST_DATE.getTime();
    const times = getSunTimes(TEST_DATE, TEST_LAT, TEST_LON);

    expect(TEST_DATE.getTime()).toBe(originalTimestamp);
    expect(times.sunrise).toBeInstanceOf(Date);
    expect(times.sunset).toBeInstanceOf(Date);
    expect(times.dawn).toBeInstanceOf(Date);
    expect(times.dusk).toBeInstanceOf(Date);
    expect(times.nauticalDawn).toBeInstanceOf(Date);
    expect(times.nauticalDusk).toBeInstanceOf(Date);
    expect(times.sunrise!.getTime()).toBeLessThan(times.sunset!.getTime());
  });

  it('does not change solar results when the host timezone changes', () => {
    const processRef = (globalThis as typeof globalThis & {
      process?: { env: Record<string, string | undefined> };
    }).process;

    if (!processRef) return;

    const previousTimezone = processRef.env.TZ;
    try {
      processRef.env.TZ = 'UTC';
      const utcTimes = getSunTimes(TEST_DATE, TEST_LAT, TEST_LON);
      processRef.env.TZ = 'Asia/Tokyo';
      const tokyoTimes = getSunTimes(TEST_DATE, TEST_LAT, TEST_LON);

      expect(tokyoTimes.sunrise?.getTime()).toBe(utcTimes.sunrise?.getTime());
      expect(tokyoTimes.sunset?.getTime()).toBe(utcTimes.sunset?.getTime());
      expect(tokyoTimes.nauticalDawn?.toISOString()).toBe(utcTimes.nauticalDawn?.toISOString());
      expect(tokyoTimes.nauticalDusk?.toISOString()).toBe(utcTimes.nauticalDusk?.toISOString());
    } finally {
      if (previousTimezone === undefined) {
        delete processRef.env.TZ;
      } else {
        processRef.env.TZ = previousTimezone;
      }
    }
  });

  it('returns a bounded moon phase, illumination, age, and UTC rise/set information', () => {
    const moon = getMoonInfo(TEST_DATE, TEST_LAT, TEST_LON);

    expect(moon.phase).toBeGreaterThanOrEqual(0);
    expect(moon.phase).toBeLessThanOrEqual(1);
    expect(moon.fraction).toBeGreaterThanOrEqual(0);
    expect(moon.fraction).toBeLessThanOrEqual(1);
    expect(moon.illumination).toBe(moon.fraction);
    expect(moon.ageDays).toBeGreaterThanOrEqual(0);
    expect(moon.ageDays).toBeLessThanOrEqual(29.530588853);
    expect(moon.moonAge).toBe(moon.ageDays);
    expect(moon.rise === null || moon.rise instanceof Date).toBe(true);
    expect(moon.set === null || moon.set instanceof Date).toBe(true);
  });
});

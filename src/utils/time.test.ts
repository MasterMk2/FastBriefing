import { describe, expect, it } from 'vitest';
import {
  etaLocalDate,
  etaZuluDate,
  formatDateYMD,
  formatTimeHHMM,
  formatTimeHHMMSS,
  missionLocalDate,
  missionZuluDate,
} from './time';

const BASE_META = {
  date: { Year: 2025, Month: 5, Day: 1 },
  startTime: 28800,
  utcOffset: 4,
};

describe('mission time utilities', () => {
  it('calculates map-local and Zulu start times from Date.UTC', () => {
    const localDate = missionLocalDate(BASE_META);
    const zuluDate = missionZuluDate(BASE_META);

    expect(localDate.toISOString()).toBe('2025-05-01T08:00:00.000Z');
    expect(zuluDate.toISOString()).toBe('2025-05-01T04:00:00.000Z');
    expect(formatTimeHHMM(localDate)).toBe('08:00');
    expect(formatTimeHHMM(zuluDate)).toBe('04:00');
  });

  it('is unchanged when the process timezone changes', () => {
    const processRef = (globalThis as typeof globalThis & {
      process?: { env: Record<string, string | undefined> };
    }).process;

    if (!processRef) return;

    const previousTimezone = processRef.env.TZ;
    try {
      processRef.env.TZ = 'Asia/Tokyo';
      const tokyoLocal = missionLocalDate(BASE_META);
      const tokyoZulu = missionZuluDate(BASE_META);

      processRef.env.TZ = 'America/New_York';
      const newYorkLocal = missionLocalDate(BASE_META);
      const newYorkZulu = missionZuluDate(BASE_META);

      expect(tokyoLocal.toISOString()).toBe('2025-05-01T08:00:00.000Z');
      expect(tokyoZulu.toISOString()).toBe('2025-05-01T04:00:00.000Z');
      expect(newYorkLocal.toISOString()).toBe(tokyoLocal.toISOString());
      expect(newYorkZulu.toISOString()).toBe(tokyoZulu.toISOString());
    } finally {
      if (previousTimezone === undefined) {
        delete processRef.env.TZ;
      } else {
        processRef.env.TZ = previousTimezone;
      }
    }
  });

  it('handles previous-day, next-day, and same-day Zulu dates', () => {
    const previousDay = missionZuluDate({
      date: { Year: 2025, Month: 5, Day: 1 },
      startTime: 19800,
      utcOffset: 10,
    });
    expect(previousDay.toISOString()).toBe('2025-04-30T19:30:00.000Z');
    expect(formatDateYMD(previousDay)).toBe('2025-04-30');
    expect(formatTimeHHMM(previousDay)).toBe('19:30');

    const nextDay = missionZuluDate({
      date: { Year: 2025, Month: 5, Day: 1 },
      startTime: 72000,
      utcOffset: -8,
    });
    expect(nextDay.toISOString()).toBe('2025-05-02T04:00:00.000Z');
    expect(formatDateYMD(nextDay)).toBe('2025-05-02');

    const sameDay = missionZuluDate({
      date: { Year: 2025, Month: 5, Day: 1 },
      startTime: 84600,
      utcOffset: 10,
    });
    expect(sameDay.toISOString()).toBe('2025-05-01T13:30:00.000Z');
  });

  it('handles year rollover at the date boundary', () => {
    const zuluDate = missionZuluDate({
      date: { Year: 2025, Month: 12, Day: 31 },
      startTime: 84600,
      utcOffset: -2,
    });

    expect(zuluDate.toISOString()).toBe('2026-01-01T01:30:00.000Z');
    expect(formatDateYMD(zuluDate)).toBe('2026-01-01');
  });

  it('adds elapsed seconds to the mission start for local and Zulu ETA', () => {
    const localEta = etaLocalDate(BASE_META, 3661);
    const zuluEta = etaZuluDate(BASE_META, 3661);

    expect(localEta.toISOString()).toBe('2025-05-01T09:01:01.000Z');
    expect(zuluEta.toISOString()).toBe('2025-05-01T05:01:01.000Z');
    expect(formatTimeHHMMSS(localEta)).toBe('09:01:01');
    expect(formatTimeHHMMSS(zuluEta)).toBe('05:01:01');
  });
});

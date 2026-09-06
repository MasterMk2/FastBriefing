import { describe, expect, it } from 'vitest';
import type { Weather } from '../types/mission';
import { buildMetar } from './metar';

const weather: Weather = {
  temperature: 8,
  dewPoint: -2,
  qnh: { mmHg: 763.8, hPa: 1018.3, inHg: 30.07 },
  wind: [
    { level: 'ground', from: 270, to: 90, speed: 2.06 },
    { level: '2000', from: 280, to: 100, speed: 4 },
    { level: '8000', from: 290, to: 110, speed: 8 },
  ],
  clouds: { preset: 'Preset1', label: 'Light Scattered 1', base: 2500, coverage: 'SCT' },
  visibility: 10000,
  fog: { thickness: 0, visibility: 0, enabled: false },
  dust: { density: 0, enabled: false },
  turbulence: { ground: 0 },
};

describe('buildMetar', () => {
  it('formats the standard wind, visibility, cloud, temperature and QNH groups', () => {
    expect(buildMetar(weather, {
      station: 'RJTT',
      time: new Date(Date.UTC(2024, 0, 3, 12, 30)),
    })).toBe('RJTT 031230Z 27004KT 9999 SCT082 08/M02 Q1018');
  });

  it('supports altimeter A pressure notation', () => {
    expect(buildMetar(weather, { pressureFormat: 'A' })).toContain('A3007');
  });
});

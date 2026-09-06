import { describe, expect, it } from 'vitest';
import { formatPressure, pressureValuesFromMmHg } from './units';

describe('pressure formatting', () => {
  it('converts a legacy mmHg number once for compatibility callers', () => {
    expect(formatPressure(760, 'hPa')).toBe('1013.2 hPa');
    expect(formatPressure(760, 'inHg')).toBe('29.92 inHg');
    expect(formatPressure(760, 'mmHg')).toBe('760.0 mmHg');
    expect(formatPressure(763.778, 'hPa')).toBe('1018.3 hPa');
  });

  it('selects a value already held by normalized QNH without converting it again', () => {
    const qnh = pressureValuesFromMmHg(760);
    expect(formatPressure(qnh, 'hPa')).toBe('1013.2 hPa');
    expect(formatPressure(qnh, 'inHg')).toBe('29.92 inHg');
  });
});

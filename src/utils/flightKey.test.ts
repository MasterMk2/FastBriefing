import { describe, expect, it } from 'vitest';
import { flightKey } from './flightKey';

describe('flightKey', () => {
  it('joins the side and the DCS group id, and keeps the two sides apart', () => {
    expect(flightKey('blue', 7)).toBe('blue:7');
    expect(flightKey('red', 7)).not.toBe(flightKey('blue', 7));
  });
});

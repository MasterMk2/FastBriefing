import { describe, expect, it } from 'vitest';
import { flightKey, parseFlightKey } from './flightKey';

describe('flightKey', () => {
  it('joins the side and the DCS group id, and keeps the two sides apart', () => {
    expect(flightKey('blue', 7)).toBe('blue:7');
    expect(flightKey('red', 7)).not.toBe(flightKey('blue', 7));
  });

  it('uses the same neutral form as the neutral notes key', () => {
    expect(flightKey('neutral', 9)).toBe('neutral:9');
  });
});

describe('parseFlightKey', () => {
  it('reads blue, red and neutral keys back into their side and group id', () => {
    expect(parseFlightKey('blue:12')).toEqual({ side: 'blue', groupId: 12 });
    expect(parseFlightKey('red:3')).toEqual({ side: 'red', groupId: 3 });
    expect(parseFlightKey('neutral:5')).toEqual({ side: 'neutral', groupId: 5 });
  });

  it('returns null for an empty, unknown or malformed key', () => {
    expect(parseFlightKey(null)).toBeNull();
    expect(parseFlightKey('')).toBeNull();
    expect(parseFlightKey('green:1')).toBeNull();
    expect(parseFlightKey('blue:x')).toBeNull();
    expect(parseFlightKey('blue:1:2')).toBeNull();
  });
});

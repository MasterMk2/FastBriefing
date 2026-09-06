import { describe, expect, it } from 'vitest';
import {
  detectFrequencyConflicts,
  type CommunicationFrequency,
} from './CommsTab';

function frequencyEntry(overrides: Partial<CommunicationFrequency>): CommunicationFrequency {
  return {
    id: 'entry',
    source: 'flight',
    side: 'Blue',
    callsign: 'Viper 1-1',
    flight: 'Viper',
    flightId: 1,
    unitKey: 'Blue:1:1',
    channel: 1,
    frequencyMHz: 251.000,
    modulation: 'AM',
    name: 'Tactical',
    ...overrides,
  };
}

describe('CommsTab frequency conflict detection', () => {
  it('classifies duplicate presets within the same aircraft', () => {
    const conflicts = detectFrequencyConflicts([
      frequencyEntry({ id: 'preset-1', channel: 1 }),
      frequencyEntry({ id: 'preset-2', channel: 2 }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].types).toEqual(['same-aircraft-preset']);
  });

  it('classifies different flights while respecting the 1 kHz tolerance', () => {
    const conflicts = detectFrequencyConflicts([
      frequencyEntry({ id: 'viper', flightId: 1, unitKey: 'Blue:1:1', frequencyMHz: 243.000 }),
      frequencyEntry({ id: 'bandit', flightId: 2, unitKey: 'Red:2:1', side: 'Red', frequencyMHz: 243.0009 }),
      frequencyEntry({ id: 'far-away', flightId: 3, unitKey: 'Red:3:1', side: 'Red', frequencyMHz: 243.005 }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].types).toEqual(['different-flight']);
    expect(conflicts[0].users.map(user => user.id)).toEqual(['bandit', 'viper']);
  });

  it('classifies support collisions and ignores different modulation', () => {
    const conflicts = detectFrequencyConflicts([
      frequencyEntry({ id: 'flight-am', frequencyMHz: 305.000 }),
      frequencyEntry({
        id: 'tanker-am',
        source: 'support',
        side: 'Support',
        callsign: 'Texaco',
        flight: 'tanker',
        supportKind: 'tanker',
        unitKey: undefined,
        flightId: undefined,
        frequencyMHz: 305.0005,
        modulation: 'AM',
        name: 'tanker',
      }),
      frequencyEntry({
        id: 'tanker-fm',
        source: 'support',
        side: 'Support',
        callsign: 'Texaco',
        flight: 'tanker',
        supportKind: 'tanker',
        unitKey: undefined,
        flightId: undefined,
        frequencyMHz: 305.0005,
        modulation: 'FM',
        name: 'tanker',
      }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].types).toEqual(['support']);
    expect(conflicts[0].users.map(user => user.id)).toEqual(['flight-am', 'tanker-am']);
  });
});

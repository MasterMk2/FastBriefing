import { describe, expect, it } from 'vitest';
import {
  collectFrequencyEntries,
  collectMainFrequencyEntries,
  conflictAnchor,
  conflictSide,
  detectFrequencyConflicts,
  detectMainFrequencyConflicts,
  formatRadioChannel,
  ownerKeyOf,
  type CommunicationFrequency,
} from './frequencyConflicts';
import { makeCoalition, makeFlight, makeMission, makeSupport, makeUnit } from '../__tests__/testMission';

function frequencyEntry(overrides: Partial<CommunicationFrequency>): CommunicationFrequency {
  return {
    id: 'entry',
    source: 'flight',
    side: 'blue',
    callsign: 'Viper 1-1',
    flightId: 1,
    unitKey: 'blue:1:1:0',
    channel: 1,
    frequencyMHz: 251.000,
    modulation: 'AM',
    name: 'Tactical',
    ...overrides,
  };
}

describe('frequency conflict detection', () => {
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
      frequencyEntry({ id: 'viper', flightId: 1, unitKey: 'blue:1:1:0', frequencyMHz: 243.000 }),
      frequencyEntry({ id: 'bandit', flightId: 2, unitKey: 'red:2:1:0', side: 'red', frequencyMHz: 243.0009 }),
      frequencyEntry({ id: 'far-away', flightId: 3, unitKey: 'red:3:1:0', side: 'red', frequencyMHz: 243.005 }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].types).toEqual(['different-flight']);
    expect(conflicts[0].users.map(user => user.id)).toEqual(['bandit', 'viper']);
  });

  it('keeps a difference of exactly 1 kHz inside the tolerance and drops 1.1 kHz', () => {
    const exact = detectFrequencyConflicts([
      frequencyEntry({ id: 'a', flightId: 1, frequencyMHz: 243.000 }),
      frequencyEntry({ id: 'b', flightId: 2, unitKey: 'x:2', frequencyMHz: 243.001 }),
    ]);
    const wider = detectFrequencyConflicts([
      frequencyEntry({ id: 'a', flightId: 1, frequencyMHz: 243.000 }),
      frequencyEntry({ id: 'b', flightId: 2, unitKey: 'x:2', frequencyMHz: 243.0011 }),
    ]);

    expect(exact).toHaveLength(1);
    expect(wider).toHaveLength(0);
  });

  it('does not join two entries through a third entry that is out of tolerance with one of them', () => {
    // 243.000 and 243.0018 differ by 1.8 kHz, so they do not conflict; each of them conflicts with 243.0009.
    const conflicts = detectFrequencyConflicts([
      frequencyEntry({ id: 'a', flightId: 1, unitKey: 'blue:1:1:0', frequencyMHz: 243.000 }),
      frequencyEntry({ id: 'b', flightId: 2, unitKey: 'blue:2:1:0', frequencyMHz: 243.0009 }),
      frequencyEntry({ id: 'c', flightId: 3, unitKey: 'blue:3:1:0', frequencyMHz: 243.0018 }),
    ]);

    expect(conflicts.map(conflict => conflict.users.map(user => user.id))).toEqual([['a', 'b'], ['b', 'c']]);
    expect(conflicts.some(conflict => conflict.users.some(user => user.id === 'a') && conflict.users.some(user => user.id === 'c'))).toBe(false);
  });

  it('classifies support collisions and ignores different modulation', () => {
    const conflicts = detectFrequencyConflicts([
      frequencyEntry({ id: 'flight-am', frequencyMHz: 305.000 }),
      frequencyEntry({
        id: 'tanker-am',
        source: 'support',
        side: 'blue',
        callsign: 'Texaco',
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
        side: 'blue',
        callsign: 'Texaco',
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

describe('collectFrequencyEntries', () => {
  it('does not report the same preset of two wingmen in one flight', () => {
    const preset = { channel: 1, frequency: 251000000, modulation: 0, name: 'Tac' };
    const flight = makeFlight({
      units: [
        makeUnit({ unitId: 1, radios: [preset] }),
        makeUnit({ unitId: 2, radios: [preset] }),
      ],
    });
    const mission = makeMission({ blue: makeCoalition({ flights: [flight] }) });

    expect(detectFrequencyConflicts(collectFrequencyEntries(mission))).toEqual([]);
  });

  it('reports two different flights that share a radio preset frequency', () => {
    const preset = { channel: 1, frequency: 251000000, modulation: 0, name: 'Tac' };
    const mission = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, units: [makeUnit({ radios: [preset] })] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', units: [makeUnit({ unitId: 9, radios: [preset] })] })] }),
    });

    const conflicts = detectFrequencyConflicts(collectFrequencyEntries(mission));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].types).toEqual(['different-flight']);
  });

  it('adds the group frequency only when asked, and only for lint', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ frequency: 251000000, modulation: 0 })] }),
    });

    expect(collectFrequencyEntries(mission)).toHaveLength(0);
    const withGroup = collectFrequencyEntries(mission, { includeGroupFrequency: true });
    expect(withGroup).toHaveLength(1);
    expect(withGroup[0].groupFrequency).toBe(true);
  });

  it('keeps each support asset with its own coalition and a stable owner key', () => {
    const mission = makeMission({
      red: makeCoalition({ support: [makeSupport({ kind: 'awacs', callsign: 'Darkstar', frequency: 270000000 })] }),
    });

    const [entry] = collectFrequencyEntries(mission);
    expect(entry.side).toBe('red');
    expect(entry.source).toBe('support');
    expect(ownerKeyOf(entry)).toBe('red:support:0');
  });

  it('limits the entries to one coalition when side is given', () => {
    const mission = makeMission({
      blue: makeCoalition({ support: [makeSupport({ frequency: 305000000 })] }),
      red: makeCoalition({ support: [makeSupport({ callsign: 'Other', frequency: 305000000 })] }),
    });

    const red = collectFrequencyEntries(mission, { side: 'red' });
    expect(red.map(entry => entry.callsign)).toEqual(['Other']);
    expect(red[0].side).toBe('red');
  });
});

describe('radio channel labels', () => {
  it('distinguishes channels from separate radio banks', () => {
    expect(formatRadioChannel({ radio: 2, channel: 3 })).toBe('R2 / CH3');
    expect(formatRadioChannel({ channel: 3 })).toBe('CH3');
  });
});

describe('main frequency conflicts (Lead decision 1)', () => {
  const client = (overrides: Parameters<typeof makeUnit>[0] = {}) => makeUnit({ skill: 'Client', ...overrides });
  const preset = (frequencyHz: number) => ({ channel: 1, frequency: frequencyHz, modulation: 0, name: 'Tactical' });

  it('does not count two presets of the same aircraft type on one frequency as a conflict', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, callsign: 'Viper 1-1', frequency: 0, units: [client({ radios: [preset(251000000)] })] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', frequency: 0, units: [client({ unitId: 2, radios: [preset(251000000)] })] }),
      ] }),
    });

    expect(detectMainFrequencyConflicts(mission)).toEqual([]);
    // The comms table still lists both presets.
    expect(collectFrequencyEntries(mission)).toHaveLength(2);
  });

  it('counts two flights whose main frequencies are the same', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, callsign: 'Viper 1-1', frequency: 251000000, units: [client()] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', frequency: 251000000, units: [client({ unitId: 2 })] }),
      ] }),
    });

    const conflicts = detectMainFrequencyConflicts(mission);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].types).toEqual(['different-flight']);
    expect(conflicts[0].users.map(user => user.callsign)).toEqual(['Viper 1-1', 'Viper 2-1']);
  });

  it('counts a flight main frequency that matches a support asset', () => {
    const mission = makeMission({
      blue: makeCoalition({
        flights: [makeFlight({ groupId: 1, frequency: 305000000, units: [client()] })],
        support: [makeSupport({ callsign: 'Texaco', frequency: 305000000 })],
      }),
    });

    const conflicts = detectMainFrequencyConflicts(mission);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].types).toEqual(['support']);
  });

  it('keeps a main frequency that is 1 kHz away and drops one that is 1.1 kHz away', () => {
    const near = makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, frequency: 251000000, units: [client()] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', frequency: 251001000, units: [client({ unitId: 2 })] }),
      ] }),
    });
    const far = makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, frequency: 251000000, units: [client()] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', frequency: 251001100, units: [client({ unitId: 2 })] }),
      ] }),
    });

    expect(detectMainFrequencyConflicts(near)).toHaveLength(1);
    expect(detectMainFrequencyConflicts(far)).toEqual([]);
  });

  it('does not join AM and FM on the same nominal frequency', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, frequency: 251000000, modulation: 0, units: [client()] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', frequency: 251000000, modulation: 1, units: [client({ unitId: 2 })] }),
      ] }),
    });

    expect(detectMainFrequencyConflicts(mission)).toEqual([]);
  });

  it('marks a conflict across both coalitions as neutral, and a single-coalition one with its side', () => {
    const mixed = makeMission({
      blue: makeCoalition({ flights: [makeFlight({ groupId: 1, frequency: 251000000, units: [client()] })] }),
      red: makeCoalition({ flights: [makeFlight({ groupId: 2, callsign: 'Ford 1-1', frequency: 251000000, units: [client({ unitId: 9 })] })] }),
    });
    const blueOnly = makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, frequency: 251000000, units: [client()] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', frequency: 251000000, units: [client({ unitId: 2 })] }),
      ] }),
    });

    expect(conflictSide(detectMainFrequencyConflicts(mixed)[0])).toBe('neutral');
    expect(conflictSide(detectMainFrequencyConflicts(blueOnly)[0])).toBe('blue');
  });

  it('gives one conflict per frequency, with the anchor the comms screen and lint use', () => {
    const mission = makeMission({
      blue: makeCoalition({ flights: [
        makeFlight({ groupId: 1, frequency: 251000000, units: [client()] }),
        makeFlight({ groupId: 2, callsign: 'Viper 2-1', frequency: 251000000, units: [client({ unitId: 2 })] }),
        makeFlight({ groupId: 3, callsign: 'Viper 3-1', frequency: 251000000, units: [client({ unitId: 3 })] }),
      ] }),
    });

    const conflicts = detectMainFrequencyConflicts(mission);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].users).toHaveLength(3);
    expect(conflictAnchor(conflicts[0])).toBe('comms:conflict:AM:251.000');
    expect(collectMainFrequencyEntries(mission).every(entry => entry.groupFrequency === true || entry.source === 'support')).toBe(true);
  });
});

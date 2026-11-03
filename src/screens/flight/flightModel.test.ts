import { describe, expect, it } from 'vitest';
import type { Coalition, Flight, MissionData, RadioPreset, RoutePoint, Unit, WaypointAnnotation } from '../../types/mission';
import {
  annotationFieldCount,
  findSelectedFlight,
  flightNotesFromDraft,
  formatMegahertz,
  isClientFlight,
  isResolvedPoint,
  link16DiffersFromLead,
  parseFlightKey,
  parseFuelDraft,
  radioDiffersFromLead,
  toMegahertz,
} from './flightModel';

function radio(channel: number, frequency: number, modulation = 0): RadioPreset {
  return { channel, frequency, modulation, name: `R${channel}` };
}

function unit(skill: string): Unit {
  return {
    unitId: 1,
    name: 'F-15C',
    tailNumber: '101',
    skill,
    livery: '',
    payload: { pylons: [], fuel: 0, chaff: 0, flare: 0, gun: 0, weight: 0 },
    radios: [],
    props: {},
  };
}

function flight(groupId: number, skill = 'Client'): Flight {
  return {
    groupId,
    name: `Flight ${groupId}`,
    callsign: `CS${groupId}`,
    type: 'F-15C',
    task: 'CAP',
    frequency: 251_000_000,
    modulation: 0,
    hidden: false,
    units: [unit(skill)],
    route: [],
  };
}

function coalition(flights: Flight[]): Coalition {
  return {
    bullseye: { xy: [0, 0], latlon: [0, 0], latlonResolved: true },
    navPoints: [],
    airbases: [],
    flights,
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  };
}

function viewWith(blue: Flight[], red: Flight[]): MissionData {
  return {
    coalitions: { blue: coalition(blue), red: coalition(red), neutral: coalition([]) },
  } as unknown as MissionData;
}

describe('frequency display', () => {
  it('reads MHz values as they are and converts Hz values (same rule as the comms screen)', () => {
    expect(toMegahertz(251)).toBe(251);
    expect(toMegahertz(251_000_000)).toBe(251);
    expect(formatMegahertz(251)).toBe('251.000 MHz');
    expect(formatMegahertz(251_000_000)).toBe('251.000 MHz');
  });
});

describe('radio difference from the lead', () => {
  const lead = [radio(1, 251, 0), radio(2, 305.5, 1)];

  it('is not a difference when channel, frequency and modulation match', () => {
    expect(radioDiffersFromLead(radio(1, 251, 0), lead)).toBe(false);
  });

  it('treats a frequency difference of 0.0004 MHz as the same and 0.001 MHz as different', () => {
    expect(radioDiffersFromLead(radio(1, 251.0004, 0), lead)).toBe(false);
    expect(radioDiffersFromLead(radio(1, 251.001, 0), lead)).toBe(true);
  });

  it('is a difference when the modulation differs or the channel does not exist in the lead', () => {
    expect(radioDiffersFromLead(radio(2, 305.5, 0), lead)).toBe(true);
    expect(radioDiffersFromLead(radio(9, 251, 0), lead)).toBe(true);
  });

  it('compares Link16 settings by flight lead and team', () => {
    const leadLink = { flightLead: true, team: 1 };
    expect(link16DiffersFromLead({ flightLead: true, team: 1 }, leadLink)).toBe(false);
    expect(link16DiffersFromLead({ flightLead: false, team: 1 }, leadLink)).toBe(true);
    expect(link16DiffersFromLead(undefined, leadLink)).toBe(false);
  });
});

describe('route point positions', () => {
  const point = (overrides: Partial<RoutePoint>): RoutePoint => ({
    index: 1,
    name: 'WP',
    action: '',
    xy: [0, 0],
    latlon: [42, 41],
    alt: 0,
    altType: 'BARO',
    speed: 0,
    eta: 0,
    tasks: [],
    ...overrides,
  });

  it('is resolved only when the flag is not false and the pair is finite', () => {
    expect(isResolvedPoint(point({}))).toBe(true);
    expect(isResolvedPoint(point({ latlonResolved: false }))).toBe(false);
    expect(isResolvedPoint(point({ latlon: [Number.NaN, 41] }))).toBe(false);
  });

  it('never treats (0, 0) as a position, even when the flag is not set', () => {
    expect(isResolvedPoint(point({ latlon: [0, 0] }))).toBe(false);
    expect(isResolvedPoint(point({ latlon: [0, 0], latlonResolved: true }))).toBe(false);
    expect(isResolvedPoint(point({ latlon: [0, 1] }))).toBe(true);
  });
});

describe('selected flight', () => {
  it('parses only blue or red keys', () => {
    expect(parseFlightKey('blue:12')).toEqual({ side: 'blue', groupId: 12 });
    expect(parseFlightKey('neutral:1')).toBeNull();
    expect(parseFlightKey('blue:x')).toBeNull();
    expect(parseFlightKey(null)).toBeNull();
  });

  it('finds the flight only inside the displayed view', () => {
    const view = viewWith([flight(1)], []);
    expect(findSelectedFlight(view, 'blue:1')?.flight.groupId).toBe(1);
    // A red flight that is not in the pilot view resolves to nothing, so its data is never shown (D1).
    expect(findSelectedFlight(view, 'red:2')).toBeNull();
    expect(findSelectedFlight(view, null)).toBeNull();
  });
});

describe('client flights and annotation counts', () => {
  it('counts Client and Player units as client flights', () => {
    expect(isClientFlight(flight(1, 'Client'))).toBe(true);
    expect(isClientFlight(flight(2, 'player'))).toBe(true);
    expect(isClientFlight(flight(3, 'AI'))).toBe(false);
  });

  it('counts the filled purpose and notes fields of one waypoint', () => {
    const empty: WaypointAnnotation = { purpose: '', notes: '' };
    expect(annotationFieldCount(undefined)).toBe(0);
    expect(annotationFieldCount(empty)).toBe(0);
    expect(annotationFieldCount({ purpose: 'IP', notes: '  ' })).toBe(1);
    expect(annotationFieldCount({ purpose: 'IP', notes: 'Hold' })).toBe(2);
  });
});

describe('fuel draft', () => {
  it('treats an empty entry as not entered and accepts zero or more', () => {
    expect(parseFuelDraft('')).toEqual({ ok: true, value: null });
    expect(parseFuelDraft('  ')).toEqual({ ok: true, value: null });
    expect(parseFuelDraft('0')).toEqual({ ok: true, value: 0 });
    expect(parseFuelDraft('1200.5')).toEqual({ ok: true, value: 1200.5 });
  });

  it('refuses a negative or non-numeric value with a reason', () => {
    expect(parseFuelDraft('-5')).toEqual({ ok: false, reason: 'negative' });
    expect(parseFuelDraft('abc')).toEqual({ ok: false, reason: 'notNumber' });
  });

  it('does not produce saved notes while any fuel field is refused', () => {
    const result = flightNotesFromDraft({ joker: '-1', bingo: '900', tot: '', pilotName: '', customNotes: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.joker).toEqual({ ok: false, reason: 'negative' });
    expect(result.bingo).toBeNull();
  });

  it('builds the saved notes from a valid draft', () => {
    const result = flightNotesFromDraft({ joker: '800', bingo: '', tot: '12:30', pilotName: 'Lead', customNotes: 'x' });
    expect(result).toEqual({
      ok: true,
      notes: { jokerFuel: 800, bingoFuel: null, tot: '12:30', pilotName: 'Lead', customNotes: 'x' },
    });
  });
});

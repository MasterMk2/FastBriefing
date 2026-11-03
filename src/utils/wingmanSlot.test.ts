// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flight, MissionData, Unit } from '../types/mission';
import {
  getWingmanSlot,
  isWingmanUnit,
  parseWingmanSlot,
  reloadWingmanSlot,
  sideOfFlight,
  WINGMAN_STORAGE_KEY,
  writeWingmanSlot,
  type WingmanSlot,
} from './wingmanSlot';

const slot: WingmanSlot = { missionKey: 'mission-A', flightKey: 'blue:5', unitId: 11 };

function fakeStorage(overrides: Partial<Pick<Storage, 'setItem' | 'removeItem'>> = {}) {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: overrides.setItem ?? ((key: string, value: string) => { items.set(key, value); }),
    removeItem: overrides.removeItem ?? ((key: string) => { items.delete(key); }),
  };
}

function flight(groupId: number): Flight {
  return {
    groupId,
    name: `flight ${groupId}`,
    callsign: `Viper ${groupId}`,
    type: 'F-16C_50',
    task: 'CAP',
    frequency: 251000000,
    modulation: 0,
    hidden: false,
    units: [{ unitId: 11, name: 'Viper 1-1' } as Unit],
    route: [],
  };
}

function viewWith(blue: Flight[], red: Flight[]): MissionData {
  const coalition = (flights: Flight[]) => ({
    bullseye: { xy: [0, 0], latlon: [0, 0] },
    navPoints: [],
    airbases: [],
    flights,
    support: [],
    aiGroups: [],
    zones: [],
    drawings: [],
  });
  return {
    coalitions: { blue: coalition(blue), red: coalition(red), neutral: coalition([]) },
  } as unknown as MissionData;
}

beforeEach(() => {
  localStorage.clear();
  reloadWingmanSlot();
});

describe('parseWingmanSlot', () => {
  it('accepts a well-formed value', () => {
    expect(parseWingmanSlot(slot)).toEqual(slot);
    expect(parseWingmanSlot({ ...slot, flightKey: 'red:12', unitId: 0 })).toEqual({ ...slot, flightKey: 'red:12', unitId: 0 });
  });

  it('treats anything unexpected as not chosen', () => {
    expect(parseWingmanSlot(null)).toBeNull();
    expect(parseWingmanSlot([slot])).toBeNull();
    expect(parseWingmanSlot('blue:5')).toBeNull();
    expect(parseWingmanSlot({ flightKey: 'blue:5', unitId: 11 })).toBeNull();
    expect(parseWingmanSlot({ ...slot, missionKey: '' })).toBeNull();
    expect(parseWingmanSlot({ ...slot, missionKey: 3 })).toBeNull();
    expect(parseWingmanSlot({ ...slot, flightKey: 'green:5' })).toBeNull();
    expect(parseWingmanSlot({ ...slot, flightKey: 'blue:x' })).toBeNull();
    expect(parseWingmanSlot({ ...slot, unitId: '11' })).toBeNull();
    expect(parseWingmanSlot({ ...slot, unitId: 1.5 })).toBeNull();
    expect(parseWingmanSlot({ ...slot, unitId: Number.NaN })).toBeNull();
  });
});

describe('writeWingmanSlot and reloadWingmanSlot', () => {
  it('writes the choice as JSON under the fastbriefing-wingman key and reads it back', () => {
    const storage = fakeStorage();
    expect(writeWingmanSlot(slot, storage)).toBe(true);
    expect(JSON.parse(storage.items.get(WINGMAN_STORAGE_KEY) ?? 'null')).toEqual(slot);

    reloadWingmanSlot(null);
    expect(getWingmanSlot()).toBeNull();
    reloadWingmanSlot(storage);
    expect(getWingmanSlot()).toEqual(slot);

    // A clear removes the stored item and empties the page's value.
    expect(writeWingmanSlot(null, storage)).toBe(true);
    expect(storage.items.has(WINGMAN_STORAGE_KEY)).toBe(false);
    expect(getWingmanSlot()).toBeNull();
  });

  it('reports a refused write as not saved, stores nothing, but keeps the choice in memory for this page', () => {
    const storage = fakeStorage({ setItem: () => { throw new Error('quota'); } });
    expect(writeWingmanSlot(slot, storage)).toBe(false);
    expect(storage.items.has(WINGMAN_STORAGE_KEY)).toBe(false);
    expect(getWingmanSlot()).toEqual(slot);
  });

  it('reports no storage as not saved, without throwing, and keeps the choice in memory', () => {
    expect(writeWingmanSlot(slot, null)).toBe(false);
    expect(getWingmanSlot()).toEqual(slot);
  });

  it('treats a broken or incomplete stored record as not chosen', () => {
    const storage = fakeStorage();
    storage.items.set(WINGMAN_STORAGE_KEY, JSON.stringify(slot));
    reloadWingmanSlot(storage);
    expect(getWingmanSlot()).toEqual(slot);

    storage.items.set(WINGMAN_STORAGE_KEY, '{broken');
    expect(() => reloadWingmanSlot(storage)).not.toThrow();
    expect(getWingmanSlot()).toBeNull();

    storage.items.set(WINGMAN_STORAGE_KEY, JSON.stringify(slot));
    reloadWingmanSlot(storage);
    expect(getWingmanSlot()).toEqual(slot);

    storage.items.set(WINGMAN_STORAGE_KEY, JSON.stringify({ missionKey: 'mission-A' }));
    expect(() => reloadWingmanSlot(storage)).not.toThrow();
    expect(getWingmanSlot()).toBeNull();
  });
});

describe('read failures', () => {
  it('treats a store whose read throws as not chosen, without throwing', () => {
    writeWingmanSlot(slot, null);
    expect(getWingmanSlot()).toEqual(slot);

    const throwingStorage = { getItem: () => { throw new Error('denied'); } };
    expect(() => reloadWingmanSlot(throwingStorage)).not.toThrow();
    expect(getWingmanSlot()).toBeNull();
  });

  it('treats an unreadable localStorage as not chosen, without throwing', () => {
    writeWingmanSlot(slot, null);
    const access = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      expect(() => reloadWingmanSlot()).not.toThrow();
      expect(getWingmanSlot()).toBeNull();
    } finally {
      access.mockRestore();
    }
  });
});

describe('sideOfFlight', () => {
  it('finds the side of the flight objects that are in the view', () => {
    const blueFlight = flight(5);
    const redFlight = flight(9);
    const view = viewWith([blueFlight], [redFlight]);

    expect(sideOfFlight(view, blueFlight)).toBe('blue');
    expect(sideOfFlight(view, redFlight)).toBe('red');
  });

  it('returns null for a flight that is not in the view (for example, the other side in pilot view)', () => {
    const view = viewWith([flight(5)], []);
    expect(sideOfFlight(view, flight(9))).toBeNull();
  });

  it('does not match a copy by group id: a group id can name a flight of the other side', () => {
    const blueFlight = flight(5);
    const view = viewWith([blueFlight], [flight(9)]);
    expect(sideOfFlight(view, flight(5))).toBeNull();
    expect(sideOfFlight(view, flight(9))).toBeNull();
    expect(sideOfFlight(view, blueFlight)).toBe('blue');
  });
});

describe('isWingmanUnit', () => {
  it('matches only the same mission, flight, side and unit', () => {
    const f = flight(5);
    expect(isWingmanUnit(slot, 'mission-A', 'blue', f, 11)).toBe(true);
    expect(isWingmanUnit(slot, 'mission-B', 'blue', f, 11)).toBe(false);
    expect(isWingmanUnit(slot, 'mission-A', 'red', f, 11)).toBe(false);
    expect(isWingmanUnit(slot, 'mission-A', 'blue', flight(6), 11)).toBe(false);
    expect(isWingmanUnit(slot, 'mission-A', 'blue', f, 12)).toBe(false);
    expect(isWingmanUnit(null, 'mission-A', 'blue', f, 11)).toBe(false);
  });

  it('never matches when the mission has no key', () => {
    expect(isWingmanUnit({ ...slot, missionKey: '' }, '', 'blue', flight(5), 11)).toBe(false);
  });
});

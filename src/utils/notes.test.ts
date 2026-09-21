import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMissionKey,
  emptyFlightNotes,
  emptyUserNotes,
  parseNotesSidecar,
  readStoredNotes,
  saveStoredNotes,
  serializeNotesSidecar,
  MAX_FLIGHT_NOTES,
  updateFlightNotes,
} from './notes';

afterEach(() => vi.unstubAllGlobals());

describe('mission notes identity and sidecar', () => {
  it('binds notes to both filename and exact file contents', async () => {
    const first = await createMissionKey(new File(['mission A'], 'sortie.miz'));
    expect(await createMissionKey(new File(['mission A'], 'sortie.miz'))).toBe(first);
    expect(await createMissionKey(new File(['mission B'], 'sortie.miz'))).not.toBe(first);
    expect(await createMissionKey(new File(['mission A'], 'other.miz'))).not.toBe(first);
  });

  it('round-trips SMEAC and flight notes and rejects another mission', () => {
    const notes = emptyUserNotes('v1-mission');
    notes.smeac.situation = 'Weather and threat picture';
    notes.perFlight['blue:42'] = {
      ...emptyFlightNotes(), pilotName: 'Pilot 1', jokerFuel: 3200, bingoFuel: 2100,
    };
    const json = serializeNotesSidecar(notes);
    expect(parseNotesSidecar(json, notes.missionKey)).toEqual(notes);
    expect(() => parseNotesSidecar(json, 'v1-other')).toThrow();
  });

  it('rejects malformed flight notes', () => {
    const notes = emptyUserNotes('v1-mission');
    const json = JSON.parse(serializeNotesSidecar(notes));
    json.perFlight['__proto__'] = { pilotName: 'bad' };
    json.perFlight['red:8'] = { ...emptyFlightNotes(), jokerFuel: -100 };
    expect(() => parseNotesSidecar(JSON.stringify(json), notes.missionKey)).toThrow();
  });

  it('restores only the matching mission from browser storage', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    const notes = emptyUserNotes('v1-mission');
    notes.smeac.mission = 'Protect the convoy';
    expect(saveStoredNotes(notes)).toBe(true);
    expect(readStoredNotes('v1-mission')).toEqual(notes);
    expect(readStoredNotes('v1-other')).toBeNull();
  });

  it('round-trips exactly the supported flight-note boundary and rejects overflow before saving', () => {
    const notes = emptyUserNotes('v1-boundary');
    for (let index = 0; index < MAX_FLIGHT_NOTES; index += 1) {
      notes.perFlight[`blue:${index + 1}`] = { ...emptyFlightNotes(), pilotName: `Pilot ${index + 1}` };
    }
    expect(parseNotesSidecar(serializeNotesSidecar(notes), notes.missionKey)).toEqual(notes);

    notes.perFlight[`neutral:${MAX_FLIGHT_NOTES + 1}`] = { ...emptyFlightNotes(), customNotes: 'overflow' };
    expect(() => serializeNotesSidecar(notes)).toThrow('Too many flight notes');
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    expect(saveStoredNotes(notes)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('rejects a new flight-note edit at the boundary but allows freeing and reusing a slot', () => {
    let notes = emptyUserNotes('v1-edit-boundary');
    for (let index = 0; index < MAX_FLIGHT_NOTES; index += 1) {
      notes.perFlight[`blue:${index + 1}`] = { ...emptyFlightNotes(), pilotName: `Pilot ${index + 1}` };
    }
    expect(updateFlightNotes(notes, 'red:999', { ...emptyFlightNotes(), customNotes: 'blocked' })).toBeNull();
    notes = updateFlightNotes(notes, 'blue:1', emptyFlightNotes())!;
    const reused = updateFlightNotes(notes, 'red:999', { ...emptyFlightNotes(), customNotes: 'accepted' });
    expect(reused?.perFlight['blue:1']).toBeUndefined();
    expect(reused?.perFlight['red:999']?.customNotes).toBe('accepted');
  });

  it('drops content-empty imported records before applying the saved-record limit', () => {
    const missionKey = 'v1-legacy-empty-records';
    const perFlight: Record<string, ReturnType<typeof emptyFlightNotes>> = {};
    for (let index = 0; index < MAX_FLIGHT_NOTES; index += 1) {
      perFlight[`red:${index + 1}`] = emptyFlightNotes();
    }
    perFlight['neutral:999'] = { ...emptyFlightNotes(), customNotes: 'orphaned but meaningful' };

    const imported = parseNotesSidecar(JSON.stringify({
      version: 1,
      ...emptyUserNotes(missionKey),
      perFlight,
    }), missionKey);

    expect(Object.keys(imported.perFlight)).toEqual(['neutral:999']);
    const updated = updateFlightNotes(imported, 'blue:1', { ...emptyFlightNotes(), pilotName: 'New pilot' });
    expect(updated?.perFlight['blue:1']?.pilotName).toBe('New pilot');
  });

  it('migrates a version 1 sidecar and writes bounded map and waypoint annotations as version 2', () => {
    const missionKey = 'v1-migrate';
    const legacy = {
      version: 1,
      missionKey,
      smeac: { situation: '', mission: '', execution: '', adminLogistics: '', commandSignal: '' },
      perFlight: {},
    };
    expect(parseNotesSidecar(JSON.stringify(legacy), missionKey)).toEqual(emptyUserNotes(missionKey));

    const notes = emptyUserNotes(missionKey);
    notes.waypoints['blue:1:0'] = { purpose: 'IP', notes: 'Push at 14:30Z', syncGroupId: 'sync_1' };
    notes.mapAnnotations = [
      { id: 'pin_1', kind: 'pin', position: [42, 43], label: 'Target', notes: 'North to south', color: '#e53935' },
      { id: 'stroke_1', kind: 'stroke', points: [[42, 43], [42.01, 43.01]], color: '#0066ff', width: 4 },
    ];
    const serialized = serializeNotesSidecar(notes);
    expect(JSON.parse(serialized).version).toBe(2);
    expect(parseNotesSidecar(serialized, missionKey)).toEqual(notes);
  });

  it('rejects invalid imported map coordinates and waypoint keys', () => {
    const notes = emptyUserNotes('v1-invalid-annotations');
    const invalidCoordinate = JSON.parse(serializeNotesSidecar(notes));
    invalidCoordinate.mapAnnotations = [{ id: 'pin', kind: 'pin', position: [95, 0], label: '', notes: '', color: '#e53935' }];
    expect(() => parseNotesSidecar(JSON.stringify(invalidCoordinate), notes.missionKey)).toThrow('Invalid map coordinate');

    const invalidWaypoint = JSON.parse(serializeNotesSidecar(notes));
    invalidWaypoint.waypoints = { '../escape': { purpose: 'bad', notes: '' } };
    expect(() => parseNotesSidecar(JSON.stringify(invalidWaypoint), notes.missionKey)).toThrow('Invalid waypoint annotation');
  });
});

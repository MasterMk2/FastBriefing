import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMissionKey,
  emptyFlightNotes,
  emptyUserNotes,
  parseNotesSidecar,
  readStoredNotes,
  saveStoredNotes,
  serializeNotesSidecar,
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
});

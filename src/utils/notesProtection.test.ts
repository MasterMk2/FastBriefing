import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emptyUserNotes,
  findPreviousStoredNotes,
  inspectStoredNotes,
  saveStoredNotes,
  setAsideAndSaveStoredNotes,
  setAsideStoredNotes,
} from './notes';

// Two versions of a file with the same name have keys that share the first two parts (F11, 前版の案内).
const firstKey = 'v1-0123456789abcdef-1f-89abcdef01234567';
const secondKey = 'v1-0123456789abcdef-20-fedcba9876543210';
const otherNameKey = 'v1-fedcba9876543210-1f-89abcdef01234567';
const storageKey = (key: string) => `fastbriefing:notes:${key}`;

function memoryStorage() {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem,
    removeItem: (key: string) => { values.delete(key); },
  };
  return { values, setItem, storage };
}

function notesWithText(key: string, text: string) {
  const notes = emptyUserNotes(key);
  notes.smeac.mission = text;
  return notes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notes store protection (F11)', () => {
  it('reports a missing, readable, broken, or unavailable record as different states', () => {
    const { values, storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(inspectStoredNotes(firstKey)).toEqual({ kind: 'absent' });
    expect(saveStoredNotes(notesWithText(firstKey, 'Hold'))).toBe(true);
    expect(inspectStoredNotes(firstKey).kind).toBe('ok');
    values.set(storageKey(secondKey), '{not json');
    expect(inspectStoredNotes(secondKey)).toEqual({ kind: 'corrupt' });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(inspectStoredNotes(firstKey)).toEqual({ kind: 'unavailable' });
  });

  it('refuses to overwrite a broken record and keeps its text unchanged', () => {
    const { values, setItem, storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    values.set(storageKey(firstKey), '{"broken":');
    setItem.mockClear();

    expect(saveStoredNotes(notesWithText(firstKey, 'Must not replace'))).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(values.get(storageKey(firstKey))).toBe('{"broken":');
  });

  it('does not write empty notes when nothing is stored, so opening a file leaves the store alone', () => {
    const { values, setItem, storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(saveStoredNotes(emptyUserNotes(firstKey))).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it('sets a broken record aside under a backup key, then starts from empty notes', () => {
    const { values, storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const raw = '{"broken":';
    values.set(storageKey(firstKey), raw);
    const now = new Date('2026-11-03T00:00:00.000Z');

    const backupKey = setAsideStoredNotes(firstKey, now);

    expect(backupKey).toBe(`fastbriefing-notes-backup:${firstKey}:2026-11-03T00:00:00.000Z`);
    expect(values.get(backupKey as string)).toBe(raw);
    expect(values.has(storageKey(firstKey))).toBe(false);
    expect(saveStoredNotes(emptyUserNotes(firstKey))).toBe(true);
  });

  it('sets a broken record aside and saves the notes on screen again, reporting the save', () => {
    const { values, storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    values.set(storageKey(firstKey), '{"broken":');

    const result = setAsideAndSaveStoredNotes(notesWithText(firstKey, 'Typed on screen'), new Date('2026-11-03T00:00:00.000Z'));

    expect(result.saved).toBe(true);
    expect(values.get(result.backupKey ?? '')).toBe('{"broken":');
    expect(JSON.parse(values.get(storageKey(firstKey)) ?? '{}')).toMatchObject({ smeac: { mission: 'Typed on screen' } });
  });

  it('reports no save when the store refuses the write, and still keeps the backup', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === storageKey(firstKey)) throw new Error('QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => { values.delete(key); },
    };
    vi.stubGlobal('localStorage', storage);
    values.set(storageKey(firstKey), '{"broken":');

    const result = setAsideAndSaveStoredNotes(notesWithText(firstKey, 'Typed on screen'));

    expect(result.saved).toBe(false);
    expect(values.get(result.backupKey ?? '')).toBe('{"broken":');
    expect(values.has(storageKey(firstKey))).toBe(false);
  });

  it('returns null when there is nothing to set aside', () => {
    const { storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(setAsideStoredNotes(firstKey)).toBeNull();
  });

  it('finds the latest saved version of the same file name, and nothing for another name', () => {
    const { storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(saveStoredNotes(notesWithText(firstKey, 'Carry the old plan'))).toBe(true);

    expect(findPreviousStoredNotes(secondKey)?.smeac.mission).toBe('Carry the old plan');
    expect(findPreviousStoredNotes(firstKey)).toBeNull();
    expect(findPreviousStoredNotes(otherNameKey)).toBeNull();
  });

  it('keeps the previous version pointer when the new version is opened with empty notes', () => {
    const { storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    saveStoredNotes(notesWithText(firstKey, 'Carry the old plan'));

    expect(saveStoredNotes(emptyUserNotes(secondKey))).toBe(true);

    expect(findPreviousStoredNotes(secondKey)?.smeac.mission).toBe('Carry the old plan');
  });
});

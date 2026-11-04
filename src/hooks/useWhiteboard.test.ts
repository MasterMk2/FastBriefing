import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MissionData } from '../types/mission';
import {
  MAX_POINTS_PER_STROKE,
  MAX_WHITEBOARD_NOTES,
  WHITEBOARD_STORAGE_PREFIX,
  WHITEBOARD_VERSION,
  getMissionWhiteboardId,
  inspectWhiteboard,
  loadWhiteboard,
  normalizeWhiteboard,
  parseWhiteboardSidecar,
  saveWhiteboard,
  serializeWhiteboardSidecar,
  type WhiteboardStorage,
} from './useWhiteboard';

function createStorage(initialValue: string | null = null): WhiteboardStorage {
  let value = initialValue;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => { value = nextValue; },
  };
}

function mission(overrides: Partial<MissionData['meta']> = {}): MissionData {
  return {
    sourceFingerprint: 'archive-one',
    meta: {
      sortie: 'Night Hawk',
      description: '',
      descriptionBlueTask: '',
      descriptionRedTask: '',
      descriptionNeutralTask: '',
      theatre: 'Caucasus',
      date: { Year: 2026, Month: 9, Day: 21 },
      startTime: 3600,
      utcOffset: 3,
      meVersion: 22,
      images: [],
      ...overrides,
    },
  } as MissionData;
}

afterEach(() => vi.restoreAllMocks());

describe('whiteboard persistence', () => {
  it('bounds and validates persisted content', () => {
    const points = Array.from({ length: MAX_POINTS_PER_STROKE + 20 }, (_, index) => ({ x: index, y: index }));
    const normalized = normalizeWhiteboard({
      version: WHITEBOARD_VERSION,
      notes: 'x'.repeat(MAX_WHITEBOARD_NOTES + 20),
      strokes: [
        { id: 'valid', color: '#b42318', width: 6, points },
        { id: 'invalid', color: 'javascript:red', width: 999, points: [{ x: 'bad', y: 2 }] },
      ],
    });

    expect(normalized.notes).toHaveLength(MAX_WHITEBOARD_NOTES);
    expect(normalized.strokes).toHaveLength(1);
    expect(normalized.strokes[0].points).toHaveLength(MAX_POINTS_PER_STROKE);
  });

  it('round-trips a versioned board under the mission key', () => {
    const storage = createStorage();
    const data = { notes: 'Push at 14:30Z', strokes: [{ id: 'one', color: '#175cd3', width: 3, points: [{ x: 10, y: 20 }] }] };
    expect(saveWhiteboard('mission-a', data, storage)).toBe(true);

    expect(loadWhiteboard('mission-a', storage)).toEqual(data);
    expect(storage.getItem(`${WHITEBOARD_STORAGE_PREFIX}mission-a`)).toContain(`"version":${WHITEBOARD_VERSION}`);
  });

  it('falls back safely for malformed and blocked storage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadWhiteboard('mission-a', createStorage('{bad json'))).toEqual({ notes: '', strokes: [] });
    const throwingStorage: WhiteboardStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(loadWhiteboard('mission-a', throwingStorage)).toEqual({ notes: '', strokes: [] });
    expect(saveWhiteboard('mission-a', { notes: '', strokes: [] }, throwingStorage)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('keys boards by archive content even when mission metadata is identical', () => {
    expect(getMissionWhiteboardId(mission())).toBe(getMissionWhiteboardId(mission()));
    expect(getMissionWhiteboardId(mission())).not.toBe(getMissionWhiteboardId({
      ...mission(),
      sourceFingerprint: 'archive-two',
    }));
  });

  it('shares bounded JSON only with the matching source mission', () => {
    const data = { notes: 'Package flow', strokes: [{ id: 'one', color: '#067647', width: 6, points: [{ x: 12, y: 34 }] }] };
    const sidecar = serializeWhiteboardSidecar('archive-one', data);

    expect(parseWhiteboardSidecar(sidecar, 'archive-one')).toEqual(data);
    expect(() => parseWhiteboardSidecar(sidecar, 'archive-two')).toThrow();
    expect(() => parseWhiteboardSidecar('{"version":1}', 'archive-one')).toThrow();
  });
});

describe('whiteboard stored state (F11)', () => {
  const storedValue = (value: unknown) => createStorage(typeof value === 'string' ? value : JSON.stringify(value));
  const id = 'archive-one';

  it('treats a board written by the app as readable', () => {
    const storage = createStorage();
    saveWhiteboard(id, {
      notes: 'Push at 14:30Z',
      strokes: [{ id: 'one', color: '#b42318', width: 6, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }],
    }, storage);

    expect(inspectWhiteboard(id, storage)).toBe('ok');
    expect(inspectWhiteboard(id, createStorage())).toBe('absent');
  });

  it.each([
    ['broken JSON', '{"broken":'],
    ['notes that are not text', { version: 1, notes: 5, strokes: [] }],
    ['strokes that are not a list', { version: 1, notes: '', strokes: 'x' }],
    ['a stroke without points', { version: 1, notes: '', strokes: [{ id: 'one', color: '#b42318', width: 6 }] }],
    ['a stroke whose points are all invalid', { version: 1, notes: '', strokes: [{ points: [{ x: 'bad', y: 2 }] }] }],
    ['a stroke that is not a record', { version: 1, notes: '', strokes: ['line'] }],
    ['a stroke list over the limit', { version: 1, notes: '', strokes: Array.from({ length: 301 }, () => ({ points: [{ x: 1, y: 1 }] })) }],
    ['notes over the limit', { version: 1, notes: 'x'.repeat(MAX_WHITEBOARD_NOTES + 1), strokes: [] }],
    ['more points in total than the board holds', { version: 1, notes: '', strokes: Array.from({ length: 9 }, () => ({ points: Array.from({ length: MAX_POINTS_PER_STROKE }, () => ({ x: 1, y: 1 })) })) }],
    ['another version', { version: 2, notes: '', strokes: [] }],
  ])('marks a record with %s as corrupt', (_label, value) => {
    expect(inspectWhiteboard(id, storedValue(value))).toBe('corrupt');
  });
});

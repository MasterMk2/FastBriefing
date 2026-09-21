import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MissionData } from '../types/mission';
import {
  MAX_POINTS_PER_STROKE,
  MAX_WHITEBOARD_NOTES,
  WHITEBOARD_STORAGE_PREFIX,
  WHITEBOARD_VERSION,
  getMissionWhiteboardId,
  loadWhiteboard,
  normalizeWhiteboard,
  saveWhiteboard,
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
    saveWhiteboard('mission-a', data, storage);

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
    expect(() => saveWhiteboard('mission-a', { notes: '', strokes: [] }, throwingStorage)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('keeps identifiers stable for one mission and different across mission revisions', () => {
    expect(getMissionWhiteboardId(mission())).toBe(getMissionWhiteboardId(mission()));
    expect(getMissionWhiteboardId(mission())).not.toBe(getMissionWhiteboardId(mission({ startTime: 7200 })));
  });
});

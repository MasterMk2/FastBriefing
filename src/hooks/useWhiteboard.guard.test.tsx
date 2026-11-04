// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionData } from '../types/mission';
import { getMissionWhiteboardId, useWhiteboard, WHITEBOARD_STORAGE_PREFIX } from './useWhiteboard';

// A broken board must never be overwritten by the empty board the screen shows (F11).
type Board = ReturnType<typeof useWhiteboard>;
let latest: Board | null = null;
function Probe({ mission }: { mission: MissionData }) {
  latest = useWhiteboard(mission);
  return null;
}

const mission = { sourceFingerprint: 'guard-test' } as unknown as MissionData;
const key = `${WHITEBOARD_STORAGE_PREFIX}${getMissionWhiteboardId(mission)}`;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  latest = null;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

async function render() {
  await act(async () => { root.render(<Probe mission={mission} />); });
  if (!latest) throw new Error('whiteboard not rendered');
  return latest;
}

describe('whiteboard protection (F11)', () => {
  it('blocks saving a board it cannot read, and keeps the stored text', async () => {
    localStorage.setItem(key, '{"broken":');
    const board = await render();
    expect(board.persistenceStatus).toBe('blocked');
    expect(board.storedState).toBe('corrupt');

    await act(async () => { board.setNotes('typed on screen'); });

    expect(localStorage.getItem(key)).toBe('{"broken":');
  });

  it('blocks a version 1 record whose contents are broken, not only one that fails to parse', async () => {
    localStorage.setItem(key, '{"version":1,"notes":5,"strokes":"x"}');
    const board = await render();
    expect(board.storedState).toBe('corrupt');
    expect(board.persistenceStatus).toBe('blocked');

    await act(async () => { board.setNotes('typed on screen'); });

    expect(localStorage.getItem(key)).toBe('{"version":1,"notes":5,"strokes":"x"}');
  });

  it('sets the broken board aside, then saves the board on screen under the mission key', async () => {
    localStorage.setItem(key, '{"broken":');
    await render();
    await act(async () => { latest!.setNotes('typed on screen'); });
    // Typing does not overwrite the broken record while it is blocked.
    expect(localStorage.getItem(key)).toBe('{"broken":');

    const outcome = { current: null as ReturnType<Board['setAside']> | null };
    await act(async () => { outcome.current = latest!.setAside(); });

    const result = outcome.current!;
    expect(result.saved).toBe(true);
    expect(result.backupKey).toContain('fastbriefing-whiteboard-backup:');
    expect(localStorage.getItem(result.backupKey ?? '')).toBe('{"broken":');
    expect(latest!.persistenceStatus).toBe('saved');
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ version: 1, notes: 'typed on screen', strokes: [] });
    expect(latest!.data.notes).toBe('typed on screen');
  });

  it('keeps the board on screen and reports no save when the store refuses the write', async () => {
    localStorage.setItem(key, '{"broken":');
    await render();
    await act(async () => { latest!.setNotes('kept'); });
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) {
      if (name === key) throw new Error('QuotaExceededError');
      nativeSetItem.call(this, name, value);
    });

    const outcome = { current: null as ReturnType<Board['setAside']> | null };
    await act(async () => { outcome.current = latest!.setAside(); });

    expect(outcome.current!.saved).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
    expect(latest!.data.notes).toBe('kept');
  });

  it('reports a replaced board as saved only when the store keeps it', async () => {
    const outcome = { current: null as boolean | null };
    const board = await render();
    await act(async () => { outcome.current = board.replaceData({ notes: 'Replaced', strokes: [] }); });
    expect(outcome.current).toBe(true);
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ notes: 'Replaced' });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    await act(async () => { outcome.current = latest!.replaceData({ notes: 'Refused', strokes: [] }); });

    expect(outcome.current).toBe(false);
    expect(latest!.data.notes).toBe('Refused');
  });

  it('saves normally when nothing is stored yet', async () => {
    const board = await render();
    expect(board.persistenceStatus).toBe('saved');
    await act(async () => { board.setNotes('Push at 14:30Z'); });
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').notes).toBe('Push at 14:30Z');
  });
});

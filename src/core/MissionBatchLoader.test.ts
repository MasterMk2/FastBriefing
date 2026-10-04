import { describe, expect, it, vi } from 'vitest';
import { MissionBatchLoader, validateMissionFiles } from './MissionBatchLoader';
const file = (name: string) => ({ name }) as File;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

describe('mission batch selection', () => {
  it('accepts one or two miz files including uppercase extension', () => {
    expect(validateMissionFiles([file('a.MIZ')])).toBeNull();
    expect(validateMissionFiles([file('a.miz'), file('b.miz')])).toBeNull();
  });
  it('rejects mixed, empty or excessive selections without ignoring any file', () => {
    expect(validateMissionFiles([])).toBe('invalidMizOnly');
    expect(validateMissionFiles([file('a.miz'), file('notes.txt')])).toBe('invalidMizOnly');
    expect(validateMissionFiles(['a', 'b', 'c'].map(n => file(n + '.miz')))).toBe('tooManyFiles');
  });
});

describe('mission batch lifecycle', () => {
  it('parses serially and publishes only when both files finish', async () => {
    const first = deferred<string>(), second = deferred<string>();
    const parser = { parse: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise), cancel: vi.fn() };
    const loader = new MissionBatchLoader(() => parser);
    const done = vi.fn(); const pending = loader.load([file('a.miz'), file('b.miz')]).then(done);
    expect(parser.parse).toHaveBeenCalledTimes(1); first.resolve('a'); await Promise.resolve();
    expect(parser.parse).toHaveBeenCalledTimes(2); expect(done).not.toHaveBeenCalled();
    second.resolve('b'); await pending; expect(done).toHaveBeenCalledWith(['a', 'b']);
  });
  it('rejects the entire batch when its second file fails', async () => {
    const parser = { parse: vi.fn().mockResolvedValueOnce('a').mockRejectedValueOnce(new Error('bad archive')), cancel: vi.fn() };
    await expect(new MissionBatchLoader(() => parser).load([file('a'), file('b')])).rejects.toThrow('bad archive');
    expect(parser.cancel).toHaveBeenCalled();
  });
  it('discards a stale success and never starts its second file after replacement', async () => {
    const stale = deferred<string>();
    const first = { parse: vi.fn().mockReturnValue(stale.promise), cancel: vi.fn() };
    const second = { parse: vi.fn().mockResolvedValue('new'), cancel: vi.fn() };
    const loader = new MissionBatchLoader(vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second));
    const old = loader.load([file('a'), file('b')]); const current = loader.load([file('c')]);
    stale.resolve('stale'); expect(await old).toBeNull(); expect(await current).toEqual(['new']);
    expect(first.parse).toHaveBeenCalledTimes(1); expect(first.cancel).toHaveBeenCalled();
  });
  it('ignores stale failures after reset/unmount/invalid selection cancellation', async () => {
    const stale = deferred<string>();
    const loader = new MissionBatchLoader(() => ({ parse: () => stale.promise, cancel: vi.fn() }));
    const pending = loader.load([file('a')]); loader.cancel(); stale.reject(new Error('late'));
    expect(await pending).toBeNull();
  });
  it('can retry the same files after a failed batch', async () => {
    let count = 0;
    const loader = new MissionBatchLoader(() => ({ parse: async () => { if (!count++) throw new Error('failed'); return 'ok'; }, cancel: vi.fn() }));
    await expect(loader.load([file('a')])).rejects.toThrow('failed');
    await expect(loader.load([file('a')])).resolves.toEqual(['ok']);
  });
});

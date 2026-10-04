// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { SettingsProvider } from './hooks/useSettings';
import { i18nReady } from './i18n';

const mocks = vi.hoisted(() => ({ parse: vi.fn(), cancel: vi.fn() }));
vi.mock('./core/MissionParser', async importOriginal => ({
  ...await importOriginal<typeof import('./core/MissionParser')>(),
  MissionParser: class {
  parse = mocks.parse;
  cancel = mocks.cancel;
} }));
vi.mock('./components/MissionView', () => ({ default: ({ mission }: { mission: { meta: { sortie: string } } }) => <div data-testid="mission-view">{mission.meta.sortie}</div> }));
vi.mock('./components/RevisionMap', () => ({ default: () => <div data-testid="revision-map">Map</div> }));
vi.mock('./utils/notes', async importOriginal => ({
  ...await importOriginal<typeof import('./utils/notes')>(),
  createMissionKey: async (file: File) => file.name,
  readStoredNotes: () => null, saveStoredNotes: () => true,
}));

const file = (name: string) => new File(['fixture'], name);
function parsed(name: string, start = 36000) { return {
  mission: { sortie: name, start_time: start, weather: {} }, sourceFingerprint: name,
  theatre: 'Caucasus', dictionary: {}, mapResource: {}, warehouses: {},
}; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const input = () => container.querySelector('input[type=file]') as HTMLInputElement;
async function choose(files: File[]) {
  Object.defineProperty(input(), 'files', { configurable: true, value: files });
  await act(async () => { input().dispatchEvent(new Event('change', { bubbles: true })); });
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === text);
  expect(button).toBeDefined(); await act(async () => { button!.click(); });
}
const mission = () => container.querySelector('[data-testid=mission-view]')?.textContent;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); await i18nReady;
  mocks.parse.mockReset(); mocks.cancel.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(<SettingsProvider><App /></SettingsProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('two-file revision UI', () => {
  it('loads both files in selection order, swaps the comparison, and closes without losing the revised briefing', async () => {
    expect(input().multiple).toBe(true);
    mocks.parse.mockResolvedValueOnce(parsed('old')).mockResolvedValueOnce(parsed('new', 37000));
    await choose([file('old.miz'), file('new.miz')]);
    expect(mission()).toBe('new');
    expect(container.textContent).toContain('変更前: old.miz → 変更後: new.miz');
    expect(container.textContent).toContain('start_time');
    await click('変更前／変更後を入れ替え');
    expect(container.textContent).toContain('変更前: new.miz → 変更後: old.miz');
    expect(mission()).toBe('new');
    await click('差分を閉じる');
    expect(container.querySelector('.revision-comparison')).toBeNull(); expect(mission()).toBe('new');
  });
  it('uses the same batch handling for a window drop and clears comparison on a later single file', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('a')).mockResolvedValueOnce(parsed('b'));
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file('a.miz'), file('b.miz')], types: ['Files'] } });
    await act(async () => { window.dispatchEvent(event); });
    expect(container.querySelector('.revision-comparison')).not.toBeNull();
    mocks.parse.mockResolvedValueOnce(parsed('c')); await choose([file('c.miz')]);
    expect(mission()).toBe('c'); expect(container.querySelector('.revision-comparison')).toBeNull();
  });
  it('rejects 3 files or mixed formats without changing the current mission', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('original')); await choose([file('a.miz')]);
    await choose([file('a.miz'), file('b.miz'), file('c.miz')]);
    expect(container.querySelector('[role=alert]')).not.toBeNull(); expect(mission()).toBe('original');
    await choose([file('a.miz'), file('notes.txt')]); expect(mocks.parse).toHaveBeenCalledTimes(1);
  });
  it('keeps the previous mission when the second archive fails, then permits selecting the same names again', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('original')); await choose([file('a.miz')]);
    mocks.parse.mockResolvedValueOnce(parsed('old')).mockRejectedValueOnce(new Error('invalid archive'));
    await choose([file('old.miz'), file('new.miz')]); expect(mission()).toBe('original');
    expect(container.querySelector('.revision-comparison')).toBeNull(); expect(input().value).toBe('');
    expect(container.querySelector('[role=alert]')).not.toBeNull();
    mocks.parse.mockResolvedValueOnce(parsed('old')).mockResolvedValueOnce(parsed('new'));
    await choose([file('old.miz'), file('new.miz')]); expect(mission()).toBe('new');
    expect(container.querySelector('[role=alert]')).toBeNull();
  });
  it('discards a late old result after a newer selection, and after explicit cancel', async () => {
    const old = deferred<ReturnType<typeof parsed>>(); mocks.parse.mockReturnValueOnce(old.promise);
    await choose([file('old.miz'), file('old2.miz')]);
    mocks.parse.mockResolvedValueOnce(parsed('new')); await choose([file('new.miz')]);
    await act(async () => { old.resolve(parsed('stale')); }); expect(mission()).toBe('new');
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    const canceled = deferred<ReturnType<typeof parsed>>(); mocks.parse.mockReturnValueOnce(canceled.promise);
    await choose([file('cancel.miz')]); await click('読込をキャンセル');
    await act(async () => { canceled.resolve(parsed('canceled')); }); expect(mission()).toBe('new');
    expect(container.querySelector('.loading-overlay')).toBeNull();
  });
  it('invalidates a pending batch on an invalid drop rather than later replacing the current mission', async () => {
    const pending = deferred<ReturnType<typeof parsed>>(); mocks.parse.mockReturnValueOnce(pending.promise);
    await choose([file('pending.miz')]); await choose([file('bad.txt')]);
    await act(async () => { pending.resolve(parsed('stale')); }); expect(mission()).toBeUndefined();
    expect(container.querySelector('[role=alert]')).not.toBeNull();
  });
  it('ignores a canceled file picker and renders untrusted filenames as text', async () => {
    await choose([]); expect(container.querySelector('[role=alert]')).toBeNull();
    mocks.parse.mockResolvedValueOnce(parsed('a')).mockResolvedValueOnce(parsed('b'));
    await choose([file('<img src=x onerror=alert(1)>.miz'), file('b.miz')]);
    expect(container.querySelector('.revision-comparison img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>.miz');
  });
});

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
// The mission name is read from the shell header; the carried-over tab screens are not under test here.
const emptyScreen = () => null;
vi.mock('./screens/OverviewScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/FlightScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/MapScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/CommsScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/SupportScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/ThreatsScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/NotesScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/ExportScreen', () => ({ default: emptyScreen }));
vi.mock('./screens/BriefingMode', () => ({ default: emptyScreen }));
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
// Screens are lazy-loaded, so let pending module loads and state updates settle before asserting.
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function choose(files: File[]) {
  Object.defineProperty(input(), 'files', { configurable: true, value: files });
  await act(async () => { input().dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
}
// The comparison input picks the older version from the file menu (F10); the open mission is not replaced.
async function chooseCompare(files: File[]) {
  const compareInput = container.querySelector<HTMLInputElement>('#compare-file-input');
  if (!compareInput) throw new Error('compare input not rendered');
  Object.defineProperty(compareInput, 'files', { configurable: true, value: files });
  await act(async () => { compareInput.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
}
// Wait until the lazily loaded revision screen shows the expected text (bounded, so a missing text still fails).
async function waitForText(text: string) {
  for (let attempt = 0; attempt < 100 && !container.textContent?.includes(text); attempt += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  }
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === text);
  expect(button).toBeDefined(); await act(async () => { button!.click(); });
  await settle();
}
const mission = () => container.querySelector('.shell-mission-name')?.textContent;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); await i18nReady;
  mocks.parse.mockReset(); mocks.cancel.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(<SettingsProvider><App /></SettingsProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('two-file revision UI', () => {
  it('loads both files in selection order, keeps the direction fixed (no swap), and closes without losing the revised briefing', async () => {
    expect(input().multiple).toBe(true);
    mocks.parse.mockResolvedValueOnce(parsed('old')).mockResolvedValueOnce(parsed('new', 37000));
    await choose([file('old.miz'), file('new.miz')]);
    expect(mission()).toBe('new');
    await waitForText('変更前: old.miz → 変更後: new.miz');
    expect(container.textContent).toContain('変更前: old.miz → 変更後: new.miz');
    expect(container.textContent).toContain('start_time');
    // F10: the direction is fixed; there is no swap control.
    expect([...container.querySelectorAll('button')].some(button => button.textContent?.includes('入れ替え'))).toBe(false);
    expect(mission()).toBe('new');
    await click('差分を閉じる');
    expect(container.querySelector('.revision-comparison')).toBeNull(); expect(mission()).toBe('new');
  });
  it('compares the open mission with an older file chosen from the file menu, and keeps the open mission', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('new', 37000));
    await choose([file('new.miz')]);
    expect(mission()).toBe('new');
    await click('ファイル ▾');
    await click('改版を比べる');
    mocks.parse.mockResolvedValueOnce(parsed('old'));
    await chooseCompare([file('old.miz')]);
    await waitForText('変更前: old.miz → 変更後: new.miz');
    expect(container.textContent).toContain('変更前: old.miz → 変更後: new.miz');
    expect(mission()).toBe('new');
    expect(mocks.parse).toHaveBeenCalledTimes(2);
  });
  it('uses the same batch handling for a window drop and clears comparison on a later single file', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('a')).mockResolvedValueOnce(parsed('b'));
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file('a.miz'), file('b.miz')], types: ['Files'] } });
    await act(async () => { window.dispatchEvent(event); });
    await settle();
    expect(container.querySelector('.revision-comparison')).not.toBeNull();
    mocks.parse.mockResolvedValueOnce(parsed('c')); await choose([file('c.miz')]);
    expect(mission()).toBe('c'); expect(container.querySelector('.revision-comparison')).toBeNull();
  });
  it('rejects 3 files or mixed formats without changing the current mission', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('original')); await choose([file('a.miz')]);
    await choose([file('a.miz'), file('b.miz'), file('c.miz')]);
    expect(container.querySelector('.app-error')).not.toBeNull(); expect(mission()).toBe('original');
    await choose([file('a.miz'), file('notes.txt')]); expect(mocks.parse).toHaveBeenCalledTimes(1);
  });
  it('keeps the previous mission when the second archive fails, then permits selecting the same names again', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('original')); await choose([file('a.miz')]);
    mocks.parse.mockResolvedValueOnce(parsed('old')).mockRejectedValueOnce(new Error('invalid archive'));
    await choose([file('old.miz'), file('new.miz')]); expect(mission()).toBe('original');
    expect(container.querySelector('.revision-comparison')).toBeNull(); expect(input().value).toBe('');
    expect(container.querySelector('.app-error')).not.toBeNull();
    mocks.parse.mockResolvedValueOnce(parsed('old')).mockResolvedValueOnce(parsed('new'));
    await choose([file('old.miz'), file('new.miz')]); expect(mission()).toBe('new');
    expect(container.querySelector('.app-error')).toBeNull();
  });
  it('discards a late old result after a newer selection, and after explicit cancel', async () => {
    const old = deferred<ReturnType<typeof parsed>>(); mocks.parse.mockReturnValueOnce(old.promise);
    await choose([file('old.miz'), file('old2.miz')]);
    mocks.parse.mockResolvedValueOnce(parsed('new')); await choose([file('new.miz')]);
    await act(async () => { old.resolve(parsed('stale')); }); await settle(); expect(mission()).toBe('new');
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    const canceled = deferred<ReturnType<typeof parsed>>(); mocks.parse.mockReturnValueOnce(canceled.promise);
    await choose([file('cancel.miz')]); await click('読込をキャンセル');
    await act(async () => { canceled.resolve(parsed('canceled')); }); await settle(); expect(mission()).toBe('new');
    expect(container.querySelector('.loading-overlay')).toBeNull();
  });
  it('invalidates a pending batch on an invalid drop rather than later replacing the current mission', async () => {
    const pending = deferred<ReturnType<typeof parsed>>(); mocks.parse.mockReturnValueOnce(pending.promise);
    await choose([file('pending.miz')]); await choose([file('bad.txt')]);
    await act(async () => { pending.resolve(parsed('stale')); }); expect(mission()).toBeUndefined();
    // No mission is open, so the error is on the initial screen, not in the band (never both).
    expect(container.querySelector('.initial-error[role=alert]')).not.toBeNull();
    expect(container.querySelector('.app-error')).toBeNull();
  });
  it('shows a failed first read under the drop area with a way to choose another file, and only there', async () => {
    mocks.parse.mockRejectedValueOnce(new Error('invalid archive'));
    await choose([file('broken.miz')]);
    const alert = container.querySelector('.initial-error[role=alert]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('ミッションファイルの解析に失敗しました');
    expect(container.querySelector('.initial-drop + .initial-error')).toBe(alert);
    expect(container.querySelector('.app-error')).toBeNull();
    const pick = vi.spyOn(input(), 'click').mockImplementation(() => {});
    await act(async () => { alert!.querySelector<HTMLButtonElement>('button')!.click(); });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.initial-error')).toBeNull();
  });
  it('ignores a canceled file picker and renders untrusted filenames as text', async () => {
    await choose([]); expect(container.querySelector('.app-error')).toBeNull();
    mocks.parse.mockResolvedValueOnce(parsed('a')).mockResolvedValueOnce(parsed('b'));
    await choose([file('<img src=x onerror=alert(1)>.miz'), file('b.miz')]);
    expect(container.querySelector('.revision-comparison img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>.miz');
  });
  it('keeps the open mission when the old file is not a .miz, and re-picks only the old version (no reset)', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('new', 37000));
    await choose([file('new.miz')]);
    await click('ファイル ▾'); await click('改版を比べる');
    const replacePick = vi.spyOn(input(), 'click');
    const oldPick = vi.spyOn(container.querySelector<HTMLInputElement>('#compare-file-input')!, 'click').mockImplementation(() => {});
    await chooseCompare([file('old.txt')]);
    expect(mission()).toBe('new');
    const band = container.querySelector('.app-error');
    expect(band).not.toBeNull();
    expect([...band!.querySelectorAll('button')].map(node => node.textContent)).toEqual(['旧版を選び直す', '閉じる']);
    await act(async () => { band!.querySelector<HTMLButtonElement>('button')!.click(); });
    expect(oldPick).toHaveBeenCalledTimes(1);
    expect(replacePick).not.toHaveBeenCalled();
  });
  it('keeps the open mission when the old file cannot be parsed, and closes the band without touching it', async () => {
    mocks.parse.mockResolvedValueOnce(parsed('new', 37000));
    await choose([file('new.miz')]);
    await click('ファイル ▾'); await click('改版を比べる');
    mocks.parse.mockRejectedValueOnce(new Error('invalid archive'));
    await chooseCompare([file('old.miz')]);
    expect(mission()).toBe('new');
    expect(container.querySelector('.revision-comparison')).toBeNull();
    const band = container.querySelector('.app-error');
    expect([...band!.querySelectorAll('button')].map(node => node.textContent)).not.toContain('やり直す');
    await act(async () => { [...band!.querySelectorAll<HTMLButtonElement>('button')][1].click(); });
    expect(container.querySelector('.app-error')).toBeNull();
    expect(mission()).toBe('new');
  });
});

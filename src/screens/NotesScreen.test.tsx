// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMission } from '../core/MissionNormalizer';
import { SETTINGS_STORAGE_KEY, SETTINGS_VERSION, SettingsProvider } from '../hooks/useSettings';
import { createEmptyWhiteboard, getMissionWhiteboardId, serializeWhiteboardSidecar } from '../hooks/useWhiteboard';
import { i18nReady } from '../i18n';
import notesJa from '../i18n/locales/ja/notes.json';
import { MissionProvider } from '../shell/MissionContext';
import { WorkspaceProvider } from '../shell/workspace';
import type { Flight, MapAnnotation, MissionData, UserNotes } from '../types/mission';
import { emptyFlightNotes, emptyUserNotes, serializeNotesSidecar } from '../utils/notes';
import NotesScreen from './NotesScreen';

const KEY = 'test-notes-key';
const STORAGE_KEY = `fastbriefing:notes:${KEY}`;
// Keys in the shape that stored notes use, so that "the previous version of the same file" can be found (F10).
const CURRENT_KEY = 'v1-0123456789abcdef-20-fedcba9876543210';
const PREVIOUS_KEY = 'v1-0123456789abcdef-1f-aaaaaaaaaaaaaaaa';
const MAP_PIN: MapAnnotation = { id: 'pin-1', kind: 'pin', position: [35.1, 139.2], label: 'SAM site', notes: 'Enemy', color: '#b42318' };

function flight(groupId: number, callsign: string): Flight {
  return {
    groupId,
    name: `${callsign} group`,
    callsign,
    type: 'F-16C_50',
    task: 'CAP',
    frequency: 251,
    modulation: 0,
    hidden: false,
    units: [],
    route: [],
  };
}

/** One blue and one red flight; pilot view shows the blue side only (D1). */
function fixtureMission(notes: UserNotes = emptyUserNotes(KEY)): MissionData {
  const base = normalizeMission({
    mission: { sortie: 'Notes test', start_time: 0, weather: {} },
    theatre: 'Caucasus',
    warehouses: {},
    dictionary: {},
    mapResource: {},
  }, { coordinateFormat: 'DDM', unitSystem: 'metric', viewMode: 'pilot' });
  return {
    ...base,
    userNotes: notes,
    coalitions: {
      ...base.coalitions,
      blue: { ...base.coalitions.blue, flights: [flight(1, 'BLUE1')] },
      red: { ...base.coalitions.red, flights: [flight(2, 'RED1')] },
    },
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  await i18nReady;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

interface HarnessOptions {
  mission?: MissionData;
  storageFailed?: boolean;
  onNotesChange?: (notes: UserNotes) => void;
}

/** Feeds each change back into the mission, as App does, so that the screen reads what it wrote. */
function NotesHarness({ initial, storageFailed, onNotesChange }: Required<Omit<HarnessOptions, 'mission'>> & { initial: MissionData }) {
  const [mission, setMission] = useState(initial);
  return (
    <SettingsProvider>
      <MissionProvider
        mission={mission}
        sourceFile={null}
        storageFailed={storageFailed}
        revisions={null}
        onNotesChange={next => {
          onNotesChange(next);
          setMission(current => ({ ...current, userNotes: next }));
        }}
        onCloseRevisions={() => {}}
      >
        <WorkspaceProvider>
          <NotesScreen />
        </WorkspaceProvider>
      </MissionProvider>
    </SettingsProvider>
  );
}

async function renderNotes({ mission = fixtureMission(), storageFailed = false, onNotesChange = () => {} }: HarnessOptions = {}) {
  await act(async () => {
    root.render(<NotesHarness initial={mission} storageFailed={storageFailed} onNotesChange={onNotesChange} />);
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text);
  if (!found) throw new Error(`button not found: ${text}`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => { element.click(); });
}

/** Types into a React-controlled field: set the value through the native setter, then fire input. */
async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function notesWith(situation: string): UserNotes {
  const notes = emptyUserNotes(KEY);
  notes.smeac.situation = situation;
  return notes;
}

/** Makes the browser store refuse writes to one key; other keys are written as usual. */
function refuseWritesTo(key: string) {
  const nativeSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) {
    if (name === key) throw new Error('QuotaExceededError');
    nativeSetItem.call(this, name, value);
  });
}

/** Chooses a file in a hidden file input and fires its change event, as the browser does after the picker closes. */
async function chooseFile(input: HTMLInputElement, text: string) {
  const file = { size: text.length, text: () => Promise.resolve(text) } as unknown as File;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function fileInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not rendered');
  return input;
}

function messageText(): string | null | undefined {
  return container.querySelector('.notes-message')?.textContent;
}

describe('notes screen', () => {
  it('lists only the displayed side in pilot view (D1)', async () => {
    await renderNotes();
    await click(button('フライト別'));

    expect(container.textContent).toContain('BLUE1');
    expect(container.textContent).not.toContain('RED1');
  });

  it('writes SMEAC text through setNotes', async () => {
    const changes: UserNotes[] = [];
    await renderNotes({ onNotesChange: notes => changes.push(notes) });
    await click(button('状況（S）'));

    await type(container.querySelector<HTMLTextAreaElement>('textarea.notes-textarea')!, 'Enemy air over the strait');

    expect(changes[changes.length - 1]?.smeac.situation).toBe('Enemy air over the strait');
  });

  it('does not save a negative fuel value and says why', async () => {
    const changes: UserNotes[] = [];
    await renderNotes({ onNotesChange: notes => changes.push(notes) });
    await click(button('フライト別'));
    await click(button('BLUE1 — BLUE1 group'));

    const joker = container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    await type(joker, '-5');

    expect(changes).toHaveLength(0);
    expect(container.textContent).toContain('0 以上の数値で入力してください');
  });

  it('keeps a saved fuel value while the entry is incomplete, and says why (F11)', async () => {
    const notes = emptyUserNotes(KEY);
    notes.perFlight = { 'blue:1': { ...emptyFlightNotes(), jokerFuel: 3200 } };
    const changes: UserNotes[] = [];
    await renderNotes({ mission: fixtureMission(notes), onNotesChange: next => changes.push(next) });
    await click(button('フライト別'));
    await click(button('BLUE1 — BLUE1 group'));
    const joker = container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    expect(joker.value).toBe('3200');

    for (const draft of ['-', '1e', '-5']) {
      await type(joker, draft);
      expect(joker.value).toBe(draft);
      expect(container.textContent).toContain('0 以上の数値で入力してください');
    }

    expect(changes).toHaveLength(0);
  });

  it('clears a saved fuel value only when the field is emptied', async () => {
    const notes = emptyUserNotes(KEY);
    notes.perFlight = { 'blue:1': { ...emptyFlightNotes(), jokerFuel: 3200 } };
    const changes: UserNotes[] = [];
    await renderNotes({ mission: fixtureMission(notes), onNotesChange: next => changes.push(next) });
    await click(button('フライト別'));
    await click(button('BLUE1 — BLUE1 group'));

    await type(container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, '');

    // An entry with no content left is pruned, so the saved value is gone either way.
    expect(changes[changes.length - 1]?.perFlight['blue:1']?.jokerFuel ?? null).toBeNull();
    expect(changes).toHaveLength(1);
  });

  it('stops writes and sets a broken record aside when the store cannot be read (F11)', async () => {
    localStorage.setItem(STORAGE_KEY, '{"broken":');
    const changes: UserNotes[] = [];
    await renderNotes({ storageFailed: true, onNotesChange: notes => changes.push(notes) });

    expect(container.textContent).toContain('保存された注記を読めないため');
    expect(container.textContent).toContain('いま画面にある内容をこの端末に保存し直します');
    await click(button('退避して保存し直す'));

    expect(changes[changes.length - 1]).toEqual(emptyUserNotes(KEY));
    const names = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '');
    const backup = names.find(name => name.startsWith(`fastbriefing-notes-backup:${KEY}:`));
    expect(backup).toBeDefined();
    expect(localStorage.getItem(backup ?? '')).toBe('{"broken":');
  });

  it('keeps the notes on screen and saves them again after the broken record is set aside (F11)', async () => {
    localStorage.setItem(STORAGE_KEY, '{"broken":');
    const notes = emptyUserNotes(KEY);
    notes.smeac.situation = 'Typed on screen';
    await renderNotes({ mission: fixtureMission(notes), storageFailed: true });

    await click(button('退避して保存し直す'));

    expect(container.querySelector<HTMLTextAreaElement>('textarea.notes-textarea')?.value).toBe('Typed on screen');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ smeac: { situation: 'Typed on screen' } });
    expect(container.textContent).toContain('元のデータを');
    expect(container.textContent).toContain('に退避しました');
  });

  it('does not report the set-aside as done when the store refuses the save (F11)', async () => {
    localStorage.setItem(STORAGE_KEY, '{"broken":');
    const notes = emptyUserNotes(KEY);
    notes.smeac.situation = 'Typed on screen';
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) {
      if (name === STORAGE_KEY) throw new Error('QuotaExceededError');
      nativeSetItem.call(this, name, value);
    });
    await renderNotes({ mission: fixtureMission(notes), storageFailed: true });

    await click(button('退避して保存し直す'));

    expect(container.textContent).toContain('いまの内容を保存できませんでした');
    expect(container.textContent).not.toContain('に退避しました');
  });

  it('stops the import while the saved notes cannot be read, and says why (F11)', async () => {
    localStorage.setItem(STORAGE_KEY, '{"broken":');
    await renderNotes({ storageFailed: true });
    await click(button('保存'));

    expect(button('JSON から読み込む').disabled).toBe(true);
    expect(container.textContent).toContain('読み込みは止めています');
  });

  it('stops the board import while the saved board cannot be read, and keeps the board on screen (F11)', async () => {
    const mission = fixtureMission();
    const boardKey = `fastbriefing-whiteboard:${getMissionWhiteboardId(mission)}`;
    localStorage.setItem(boardKey, '{"broken":');
    await renderNotes({ mission });
    await click(button('白板'));

    expect(button('JSON から読み込む').disabled).toBe(true);
    expect(container.querySelector('#notes-board-import-blocked')?.textContent).toContain(notesJa.whiteboard.importBlocked);
    await type(container.querySelector<HTMLTextAreaElement>('#notes-board-text-input')!, 'Kept on board');
    await click(button('退避して白板を保存し直す'));

    expect(JSON.parse(localStorage.getItem(boardKey) ?? '{}')).toMatchObject({ notes: 'Kept on board' });
    expect(container.querySelector<HTMLTextAreaElement>('#notes-board-text-input')!.value).toBe('Kept on board');
  });

  it('does not report the board set-aside as done when the store refuses the board save (F11)', async () => {
    const mission = fixtureMission();
    const boardKey = `fastbriefing-whiteboard:${getMissionWhiteboardId(mission)}`;
    localStorage.setItem(boardKey, '{"broken":');
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) {
      if (name === boardKey) throw new Error('QuotaExceededError');
      nativeSetItem.call(this, name, value);
    });
    await renderNotes({ mission });
    await click(button('白板'));

    await click(button('退避して白板を保存し直す'));

    expect(container.textContent).toContain('いまの白板を保存できませんでした');
    expect(container.textContent).not.toContain('退避しました');
  });

  it('does not take a notes file while the saved notes cannot be read, even through the hidden input (F11)', async () => {
    localStorage.setItem(STORAGE_KEY, '{"broken":');
    await renderNotes({ storageFailed: true });
    await click(button('保存'));
    expect(fileInput().disabled).toBe(true);

    await chooseFile(fileInput(), serializeNotesSidecar(notesWith('Imported text')));

    expect(messageText()).toBeFalsy();
    expect(container.textContent).not.toContain(notesJa.storage.imported);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"broken":');
  });

  it('reports the notes import as done when the store keeps it (F11)', async () => {
    await renderNotes();
    await click(button('保存'));

    await chooseFile(fileInput(), serializeNotesSidecar(notesWith('Imported text')));

    expect(messageText()).toBe(notesJa.storage.imported);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ smeac: { situation: 'Imported text' } });
  });

  it('says the notes import is not saved when the store refuses the write, and keeps the notes on screen (F11)', async () => {
    refuseWritesTo(STORAGE_KEY);
    await renderNotes();
    await click(button('保存'));

    await chooseFile(fileInput(), serializeNotesSidecar(notesWith('Imported text')));

    expect(messageText()).toBe(notesJa.storage.importedUnsaved);
    await click(button(notesJa.sections.situation));
    expect(container.querySelector<HTMLTextAreaElement>('textarea.notes-textarea')?.value).toBe('Imported text');
  });

  it('does not take a board file while the saved board cannot be read, even through the hidden input (F11)', async () => {
    const mission = fixtureMission();
    const boardKey = `fastbriefing-whiteboard:${getMissionWhiteboardId(mission)}`;
    localStorage.setItem(boardKey, '{"broken":');
    await renderNotes({ mission });
    await click(button('白板'));
    expect(fileInput().disabled).toBe(true);
    expect(container.querySelector('#notes-board-import-blocked')?.textContent).toContain(notesJa.whiteboard.importBlocked);

    await chooseFile(fileInput(), serializeWhiteboardSidecar(mission.sourceFingerprint, { ...createEmptyWhiteboard(), notes: 'Imported board' }));

    expect(container.textContent).not.toContain(notesJa.whiteboard.imported);
    expect(localStorage.getItem(boardKey)).toBe('{"broken":');
  });

  it('reports the board import as done when the store keeps it (F11)', async () => {
    const mission = fixtureMission();
    const boardKey = `fastbriefing-whiteboard:${getMissionWhiteboardId(mission)}`;
    await renderNotes({ mission });
    await click(button('白板'));

    await chooseFile(fileInput(), serializeWhiteboardSidecar(mission.sourceFingerprint, { ...createEmptyWhiteboard(), notes: 'Imported board' }));

    expect(messageText()).toBe(notesJa.whiteboard.imported);
    expect(JSON.parse(localStorage.getItem(boardKey) ?? '{}')).toMatchObject({ notes: 'Imported board' });
  });

  it('says the board import is not saved when the store refuses the write, and keeps the board on screen (F11)', async () => {
    const mission = fixtureMission();
    refuseWritesTo(`fastbriefing-whiteboard:${getMissionWhiteboardId(mission)}`);
    await renderNotes({ mission });
    await click(button('白板'));

    await chooseFile(fileInput(), serializeWhiteboardSidecar(mission.sourceFingerprint, { ...createEmptyWhiteboard(), notes: 'Imported board' }));

    expect(messageText()).toBe(notesJa.whiteboard.importedUnsaved);
    expect(container.querySelector<HTMLTextAreaElement>('#notes-board-text-input')?.value).toBe('Imported board');
  });

  it('keys the notes of a neutral flight as neutral:<groupId>, the same key as its selection', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ settingsVersion: SETTINGS_VERSION, viewMode: 'creator' }));
    const mission = fixtureMission();
    mission.coalitions.neutral.flights = [flight(3, 'NEU1')];
    const changes: UserNotes[] = [];
    await renderNotes({ mission, onNotesChange: next => changes.push(next) });
    await click(button('フライト別'));
    await click(button('NEU1 — NEU1 group'));
    await type(container.querySelector<HTMLInputElement>('input[type="text"]')!, 'Neutral pilot');

    expect(changes[changes.length - 1]?.perFlight['neutral:3']?.pilotName).toBe('Neutral pilot');
  });

  it('exports only the flights shown in pilot view, and no map notes (D1)', async () => {
    const notes = emptyUserNotes(KEY);
    notes.perFlight = {
      'blue:1': { ...emptyFlightNotes(), pilotName: 'Shown' },
      'red:2': { ...emptyFlightNotes(), pilotName: 'Hidden' },
    };
    notes.mapAnnotations = [MAP_PIN];
    const written = await exportWrittenNotes(notes);

    expect(Object.keys(written.perFlight)).toEqual(['blue:1']);
    expect(written.mapAnnotations).toEqual([]);
    expect(container.textContent).not.toContain('Hidden');
  });

  it('exports map notes in creator view', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ settingsVersion: SETTINGS_VERSION, viewMode: 'creator' }));
    const notes = emptyUserNotes(KEY);
    notes.mapAnnotations = [MAP_PIN];
    const written = await exportWrittenNotes(notes);

    expect(written.mapAnnotations).toEqual([MAP_PIN]);
    expect(Object.keys(written.perFlight)).toEqual([]);
  });

  it('keeps a decimal fuel entry as typed and saves its value (F3)', async () => {
    const changes: UserNotes[] = [];
    await renderNotes({ onNotesChange: next => changes.push(next) });
    await click(button('フライト別'));
    await click(button('BLUE1 — BLUE1 group'));
    const joker = container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;

    // Typed one key at a time, as a pilot does: "12." is a stage on the way to 12.5, not an error.
    for (const step of ['1', '12', '12.']) {
      await type(joker, step);
      expect(joker.value).toBe(step);
      expect(container.textContent).not.toContain('0 以上の数値で入力してください');
    }
    expect(changes[changes.length - 1]?.perFlight['blue:1']?.jokerFuel).toBe(12);

    await type(joker, '12.5');

    expect(joker.value).toBe('12.5');
    expect(changes[changes.length - 1]?.perFlight['blue:1']?.jokerFuel).toBe(12.5);
  });

  it('offers the notes of the previous version of the same file and loads them on request', async () => {
    const previous = emptyUserNotes(PREVIOUS_KEY);
    previous.smeac.situation = 'Earlier situation';
    localStorage.setItem(`fastbriefing:notes:${PREVIOUS_KEY}`, serializeNotesSidecar(previous));
    localStorage.setItem('fastbriefing-notes-index', JSON.stringify({ 'v1-0123456789abcdef': PREVIOUS_KEY }));
    const changes: UserNotes[] = [];
    await renderNotes({ mission: fixtureMission(emptyUserNotes(CURRENT_KEY)), onNotesChange: next => changes.push(next) });

    expect(container.textContent).toContain('同じ名前の前の版に注記があります');
    await click(button('前版の注記を読み込む'));

    expect(changes[changes.length - 1]?.smeac.situation).toBe('Earlier situation');
    expect(changes[changes.length - 1]?.missionKey).toBe(CURRENT_KEY);
    expect(container.textContent).toContain('前版の注記を読み込みました');
  });

  it('drops an invalid fuel entry when a previous version is loaded', async () => {
    const previous = emptyUserNotes(PREVIOUS_KEY);
    previous.smeac.situation = 'Earlier situation';
    localStorage.setItem(`fastbriefing:notes:${PREVIOUS_KEY}`, serializeNotesSidecar(previous));
    localStorage.setItem('fastbriefing-notes-index', JSON.stringify({ 'v1-0123456789abcdef': PREVIOUS_KEY }));
    await renderNotes({ mission: fixtureMission(emptyUserNotes(CURRENT_KEY)) });
    await click(button('フライト別'));
    await click(button('BLUE1 — BLUE1 group'));
    await type(container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, '-5');
    expect(container.textContent).toContain('0 以上の数値で入力してください');

    await click(button('前版の注記を読み込む'));

    expect(container.textContent).not.toContain('0 以上の数値で入力してください');
    expect(container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe('');
  });

  it('says in the header whether notes are saved', async () => {
    await renderNotes();
    expect(container.querySelector('.notes-save-state')?.textContent).toBe('変更はこの端末に自動で保存されます');
  });

  it('says in the header that notes cannot be saved while the store is unavailable', async () => {
    await renderNotes({ storageFailed: true });

    expect(container.querySelector('.notes-save-state')?.textContent).toBe('保存できません');
    expect(container.textContent).toContain('この端末には保存できません');
  });

  it('saves whiteboard text and strokes under the mission board, and undoes a stroke', async () => {
    const mission = fixtureMission();
    const boardKey = `fastbriefing-whiteboard:${getMissionWhiteboardId(mission)}`;
    const stored = () => JSON.parse(localStorage.getItem(boardKey) ?? '{}') as { notes?: string; strokes?: unknown[] };
    await renderNotes({ mission });
    await click(button('白板'));
    expect(container.querySelector('button[aria-label="赤 で描く"]')).not.toBeNull();

    await type(container.querySelector<HTMLTextAreaElement>('#notes-board-text-input')!, 'Push at 14:30Z');
    expect(stored().notes).toBe('Push at 14:30Z');

    const surface = container.querySelector<SVGSVGElement>('.notes-board-input')!;
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
      return act(async () => { surface.dispatchEvent(event); });
    };
    // jsdom has no layout or pointer capture: the surface is 1200 x 675 at the origin, and capture is a no-op.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1200, height: 675, right: 1200, bottom: 675, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const capture: Partial<Element> = { setPointerCapture: () => {}, releasePointerCapture: () => {}, hasPointerCapture: () => true };
    Object.assign(Element.prototype, capture);
    try {
      await pointer('pointerdown', 100, 100);
      await pointer('pointermove', 300, 300);
      await pointer('pointerup', 300, 300);
      expect(stored().strokes).toHaveLength(1);

      await click(button('直前の線を取り消す'));
      expect(stored().strokes).toHaveLength(0);
    } finally {
      rect.mockRestore();
      for (const name of Object.keys(capture)) delete (Element.prototype as unknown as Record<string, unknown>)[name];
    }
  });
});

/** Clicks export in the storage section and reads what was written (pilot or creator view by settings). */
async function exportWrittenNotes(notes: UserNotes): Promise<UserNotes> {
  let exported: Blob | null = null;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => { exported = blob; return 'blob:notes'; }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await renderNotes({ mission: fixtureMission(notes) });
  await click(button('保存'));
  await click(button('注記を JSON で書き出す'));
  expect(exported).not.toBeNull();
  return JSON.parse(await readBlob(exported!)) as UserNotes;
}

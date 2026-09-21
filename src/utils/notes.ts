import type { FlightNotes, SMEACNotes, UserNotes } from '../types/mission';

const STORAGE_PREFIX = 'fastbriefing:notes:';
const SIDECAR_VERSION = 1;
const MAX_NOTE_LENGTH = 10000;
export const MAX_FLIGHT_NOTES = 200;

const smeacFields: (keyof SMEACNotes)[] = [
  'situation', 'mission', 'execution', 'adminLogistics', 'commandSignal',
];

/** A stable content fingerprint for note identity, not a security digest. */
function fingerprint(bytes: Uint8Array): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193);
    second = Math.imul(second ^ byte, 0x5bd1e995);
  }
  return [first, second].map(value => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

export async function createMissionKey(file: File): Promise<string> {
  const filename = new TextEncoder().encode(file.name);
  const content = new Uint8Array(await file.arrayBuffer());
  return `v1-${fingerprint(filename)}-${content.length.toString(16)}-${fingerprint(content)}`;
}

export function emptyUserNotes(missionKey: string): UserNotes {
  return {
    missionKey,
    smeac: {
      situation: '', mission: '', execution: '', adminLogistics: '', commandSignal: '',
    },
    perFlight: {},
  };
}

export function emptyFlightNotes(): FlightNotes {
  return { jokerFuel: null, bingoFuel: null, tot: '', pilotName: '', customNotes: '' };
}

export function updateFlightNotes(notes: UserNotes, key: string, value: FlightNotes): UserNotes | null {
  const perFlight = { ...notes.perFlight };
  if (!hasFlightNoteContent(value)) {
    delete perFlight[key];
  } else {
    if (!Object.prototype.hasOwnProperty.call(perFlight, key) && Object.keys(perFlight).length >= MAX_FLIGHT_NOTES) return null;
    perFlight[key] = value;
  }
  return { ...notes, perFlight };
}

export function readStoredNotes(missionKey: string): UserNotes | null {
  try {
    const json = localStorage.getItem(STORAGE_PREFIX + missionKey);
    return json ? parseNotesSidecar(json, missionKey) : null;
  } catch {
    return null;
  }
}

export function saveStoredNotes(notes: UserNotes): boolean {
  try {
    localStorage.setItem(STORAGE_PREFIX + notes.missionKey, serializeNotesSidecar(notes));
    return true;
  } catch {
    return false;
  }
}

export function serializeNotesSidecar(notes: UserNotes): string {
  const envelope = JSON.stringify({ version: SIDECAR_VERSION, ...notes });
  const validated = parseNotesSidecar(envelope, notes.missionKey);
  return JSON.stringify({ version: SIDECAR_VERSION, ...validated }, null, 2);
}

export function parseNotesSidecar(json: string, expectedMissionKey: string): UserNotes {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || value.version !== SIDECAR_VERSION || value.missionKey !== expectedMissionKey) {
    throw new Error('Notes sidecar does not match this mission');
  }
  if (!isRecord(value.smeac) || !isRecord(value.perFlight)) {
    throw new Error('Invalid notes sidecar');
  }

  const smeac = {} as SMEACNotes;
  for (const field of smeacFields) {
    smeac[field] = readText(value.smeac[field]);
  }

  const entries = Object.entries(value.perFlight);
  const perFlight: Record<string, FlightNotes> = {};
  for (const [key, item] of entries) {
    if (!/^(blue|red|neutral):\d+$/.test(key) || !isRecord(item)) throw new Error('Invalid flight notes');
    const flightNotes = {
      jokerFuel: readFuel(item.jokerFuel),
      bingoFuel: readFuel(item.bingoFuel),
      tot: readText(item.tot),
      pilotName: readText(item.pilotName),
      customNotes: readText(item.customNotes),
    };
    if (!hasFlightNoteContent(flightNotes)) continue;
    if (Object.keys(perFlight).length >= MAX_FLIGHT_NOTES) throw new Error('Too many flight notes');
    perFlight[key] = flightNotes;
  }

  return { missionKey: expectedMissionKey, smeac, perFlight };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_NOTE_LENGTH) throw new Error('Invalid note text');
  return value;
}

function readFuel(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid fuel value');
  return value;
}

function hasFlightNoteContent(notes: FlightNotes): boolean {
  return Boolean(notes.pilotName || notes.tot || notes.customNotes
    || notes.jokerFuel !== null || notes.bingoFuel !== null);
}

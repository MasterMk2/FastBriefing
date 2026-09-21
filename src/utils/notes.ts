import type { FlightNotes, MapAnnotation, SMEACNotes, UserNotes, WaypointAnnotation } from '../types/mission';
import {
  hasWaypointAnnotationContent,
  isSyncGroupId,
  isWaypointKey,
  MAX_WAYPOINT_ANNOTATIONS,
  MAX_WAYPOINT_NOTES_LENGTH,
  MAX_WAYPOINT_PURPOSE_LENGTH,
} from './waypointAnnotations';

const STORAGE_PREFIX = 'fastbriefing:notes:';
const SIDECAR_VERSION = 2;
const MAX_NOTE_LENGTH = 10000;
export const MAX_FLIGHT_NOTES = 200;
export const MAX_MAP_ANNOTATIONS = 200;
export const MAX_MAP_STROKE_POINTS = 2000;
export const MAX_MAP_POINTS_TOTAL = 10000;
export const MAX_MAP_LABEL_LENGTH = 80;
export const MAX_MAP_NOTE_LENGTH = 1000;

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
    waypoints: {},
    mapAnnotations: [],
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
  if (!isRecord(value) || (value.version !== 1 && value.version !== SIDECAR_VERSION) || value.missionKey !== expectedMissionKey) {
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

  const waypoints = readWaypointAnnotations(value.waypoints);
  const mapAnnotations = readMapAnnotations(value.mapAnnotations);
  return { missionKey: expectedMissionKey, smeac, perFlight, waypoints, mapAnnotations };
}

function readWaypointAnnotations(value: unknown): Record<string, WaypointAnnotation> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error('Invalid waypoint annotations');
  const result: Record<string, WaypointAnnotation> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isWaypointKey(key) || !isRecord(item)) throw new Error('Invalid waypoint annotation');
    if (Object.keys(result).length >= MAX_WAYPOINT_ANNOTATIONS) throw new Error('Too many waypoint annotations');
    const purpose = readBoundedText(item.purpose, MAX_WAYPOINT_PURPOSE_LENGTH, 'waypoint purpose');
    const notes = readBoundedText(item.notes, MAX_WAYPOINT_NOTES_LENGTH, 'waypoint notes');
    const syncGroupId = item.syncGroupId === undefined ? undefined : readSyncGroupId(item.syncGroupId);
    const annotation = { purpose, notes, ...(syncGroupId ? { syncGroupId } : {}) };
    if (hasWaypointAnnotationContent(annotation)) result[key] = annotation;
  }
  return result;
}

function readMapAnnotations(value: unknown): MapAnnotation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MAP_ANNOTATIONS) throw new Error('Invalid map annotations');
  let totalPoints = 0;
  return value.map(item => {
    if (!isRecord(item)) throw new Error('Invalid map annotation');
    const id = readId(item.id);
    const color = readColor(item.color);
    if (item.kind === 'pin') {
      return {
        id,
        kind: 'pin' as const,
        position: readLatLon(item.position),
        label: readBoundedText(item.label, MAX_MAP_LABEL_LENGTH, 'map label'),
        notes: readBoundedText(item.notes, MAX_MAP_NOTE_LENGTH, 'map notes'),
        color,
      };
    }
    if (item.kind === 'stroke') {
      if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > MAX_MAP_STROKE_POINTS) {
        throw new Error('Invalid map stroke');
      }
      totalPoints += item.points.length;
      if (totalPoints > MAX_MAP_POINTS_TOTAL) throw new Error('Too many map points');
      if (typeof item.width !== 'number' || !Number.isFinite(item.width) || item.width < 1 || item.width > 12) {
        throw new Error('Invalid map stroke width');
      }
      return {
        id,
        kind: 'stroke' as const,
        points: item.points.map(readLatLon),
        color,
        width: item.width,
      };
    }
    throw new Error('Invalid map annotation kind');
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_NOTE_LENGTH) throw new Error('Invalid note text');
  return value;
}

function readBoundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`Invalid ${label}`);
  return value;
}

function readId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error('Invalid annotation id');
  return value;
}

function readSyncGroupId(value: unknown): string {
  if (typeof value !== 'string' || !isSyncGroupId(value)) throw new Error('Invalid sync group');
  return value;
}

function readColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid annotation color');
  return value;
}

function readLatLon(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2
    || typeof value[0] !== 'number' || !Number.isFinite(value[0]) || value[0] < -90 || value[0] > 90
    || typeof value[1] !== 'number' || !Number.isFinite(value[1]) || value[1] < -180 || value[1] > 180) {
    throw new Error('Invalid map coordinate');
  }
  return [value[0], value[1]];
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

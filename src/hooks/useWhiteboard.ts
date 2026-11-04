import { useEffect, useMemo, useState } from 'react';
import type { MissionData } from '../types/mission';
import type { WhiteboardData, WhiteboardPoint, WhiteboardStroke } from '../types/whiteboard';

export const WHITEBOARD_VERSION = 1;
export const WHITEBOARD_STORAGE_PREFIX = 'fastbriefing-whiteboard:';
export const WHITEBOARD_BACKUP_PREFIX = 'fastbriefing-whiteboard-backup:';
export const WHITEBOARD_WIDTH = 1200;
export const WHITEBOARD_HEIGHT = 675;
export const WHITEBOARD_COLORS = ['#1f2937', '#b42318', '#175cd3', '#067647', '#b54708'] as const;
export const WHITEBOARD_PEN_WIDTHS = [3, 6, 10] as const;
export const MAX_WHITEBOARD_NOTES = 12_000;
export const MAX_WHITEBOARD_STROKES = 300;
export const MAX_POINTS_PER_STROKE = 1_500;
export const MAX_TOTAL_POINTS = 12_000;
export const MAX_WHITEBOARD_SIDECAR_BYTES = 2 * 1024 * 1024;
export const WHITEBOARD_SIDECAR_KIND = 'fastbriefing-whiteboard';

export type WhiteboardStorage = Pick<Storage, 'getItem' | 'setItem'>;

function getStorage(): WhiteboardStorage | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    console.warn('FastBriefing whiteboard storage is unavailable; using an in-memory board.');
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteCoordinate(value: unknown, maximum: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(0, value));
}

function normalizePoint(value: unknown): WhiteboardPoint | null {
  if (!isRecord(value)) return null;
  const x = finiteCoordinate(value.x, WHITEBOARD_WIDTH);
  const y = finiteCoordinate(value.y, WHITEBOARD_HEIGHT);
  return x === null || y === null ? null : { x, y };
}

function normalizeStroke(value: unknown, remainingPoints: number): WhiteboardStroke | null {
  if (!isRecord(value) || !Array.isArray(value.points) || remainingPoints <= 0) return null;

  const color = typeof value.color === 'string' && WHITEBOARD_COLORS.includes(value.color as typeof WHITEBOARD_COLORS[number])
    ? value.color
    : WHITEBOARD_COLORS[0];
  const width = typeof value.width === 'number' && WHITEBOARD_PEN_WIDTHS.includes(value.width as typeof WHITEBOARD_PEN_WIDTHS[number])
    ? value.width
    : WHITEBOARD_PEN_WIDTHS[1];
  const points = value.points
    .slice(0, Math.min(MAX_POINTS_PER_STROKE, remainingPoints))
    .map(normalizePoint)
    .filter((point): point is WhiteboardPoint => point !== null);

  if (points.length === 0) return null;
  return {
    id: typeof value.id === 'string' && value.id.length <= 100 ? value.id : `stroke-${points[0].x}-${points[0].y}`,
    color,
    width,
    points,
  };
}

export function createEmptyWhiteboard(): WhiteboardData {
  return { notes: '', strokes: [] };
}

export function normalizeWhiteboard(value: unknown): WhiteboardData {
  if (!isRecord(value) || value.version !== WHITEBOARD_VERSION) return createEmptyWhiteboard();

  const notes = typeof value.notes === 'string' ? value.notes.slice(0, MAX_WHITEBOARD_NOTES) : '';
  const strokes: WhiteboardStroke[] = [];
  let totalPoints = 0;

  if (Array.isArray(value.strokes)) {
    for (const candidate of value.strokes.slice(0, MAX_WHITEBOARD_STROKES)) {
      const stroke = normalizeStroke(candidate, MAX_TOTAL_POINTS - totalPoints);
      if (!stroke) continue;
      strokes.push(stroke);
      totalPoints += stroke.points.length;
      if (totalPoints >= MAX_TOTAL_POINTS) break;
    }
  }

  return { notes, strokes };
}

export function serializeWhiteboardSidecar(sourceFingerprint: string, data: WhiteboardData): string {
  const normalized = normalizeWhiteboard({ version: WHITEBOARD_VERSION, ...data });
  return JSON.stringify({
    kind: WHITEBOARD_SIDECAR_KIND,
    version: WHITEBOARD_VERSION,
    sourceFingerprint,
    data: normalized,
  }, null, 2);
}

export function parseWhiteboardSidecar(text: string, expectedFingerprint: string): WhiteboardData {
  if (new TextEncoder().encode(text).byteLength > MAX_WHITEBOARD_SIDECAR_BYTES) {
    throw new Error('Whiteboard sidecar is too large');
  }
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)
    || value.kind !== WHITEBOARD_SIDECAR_KIND
    || value.version !== WHITEBOARD_VERSION
    || value.sourceFingerprint !== expectedFingerprint
    || !isRecord(value.data)) {
    throw new Error('Whiteboard sidecar is invalid or belongs to another mission');
  }
  return normalizeWhiteboard({ version: WHITEBOARD_VERSION, ...value.data });
}

export function getMissionWhiteboardId(mission: MissionData): string {
  return `v1-${mission.sourceFingerprint}`;
}

export function loadWhiteboard(
  missionId: string,
  storage: WhiteboardStorage | null = getStorage(),
): WhiteboardData {
  if (!storage) return createEmptyWhiteboard();
  try {
    const value = storage.getItem(`${WHITEBOARD_STORAGE_PREFIX}${missionId}`);
    return value === null ? createEmptyWhiteboard() : normalizeWhiteboard(JSON.parse(value) as unknown);
  } catch {
    console.warn('FastBriefing whiteboard could not be read; using an empty board.');
    return createEmptyWhiteboard();
  }
}

export function saveWhiteboard(
  missionId: string,
  data: WhiteboardData,
  storage: WhiteboardStorage | null = getStorage(),
): boolean {
  if (!storage) return false;
  try {
    const normalized = normalizeWhiteboard({ version: WHITEBOARD_VERSION, ...data });
    storage.setItem(`${WHITEBOARD_STORAGE_PREFIX}${missionId}`, JSON.stringify({
      version: WHITEBOARD_VERSION,
      ...normalized,
    }));
    return true;
  } catch {
    console.warn('FastBriefing whiteboard could not be saved; continuing without persistence.');
    return false;
  }
}

/** What the browser store holds for one board. A broken record is `corrupt`: it is never overwritten (F11). */
export type WhiteboardStoredState = 'absent' | 'ok' | 'corrupt' | 'unavailable';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Whether a parsed record has the shape the board is written in. It is stricter than normalizeWhiteboard,
 * which fills in or drops bad parts silently: saving after such a load would overwrite the original (F11).
 * Anything the board writes itself passes this check.
 */
function hasIntactBoardShape(value: Record<string, unknown>): boolean {
  if (value.version !== WHITEBOARD_VERSION) return false;
  if (typeof value.notes !== 'string' || value.notes.length > MAX_WHITEBOARD_NOTES) return false;
  if (!Array.isArray(value.strokes) || value.strokes.length > MAX_WHITEBOARD_STROKES) return false;
  let totalPoints = 0;
  for (const stroke of value.strokes) {
    if (!isRecord(stroke) || !Array.isArray(stroke.points)) return false;
    if (stroke.points.length === 0 || stroke.points.length > MAX_POINTS_PER_STROKE) return false;
    if (!stroke.points.every(point => isRecord(point) && isFiniteNumber(point.x) && isFiniteNumber(point.y))) return false;
    totalPoints += stroke.points.length;
  }
  return totalPoints <= MAX_TOTAL_POINTS;
}

export function inspectWhiteboard(
  missionId: string,
  storage: WhiteboardStorage | null = getStorage(),
): WhiteboardStoredState {
  if (!storage) return 'unavailable';
  let value: string | null;
  try {
    value = storage.getItem(`${WHITEBOARD_STORAGE_PREFIX}${missionId}`);
  } catch {
    return 'unavailable';
  }
  if (value === null) return 'absent';
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) && hasIntactBoardShape(parsed) ? 'ok' : 'corrupt';
  } catch {
    return 'corrupt';
  }
}

/**
 * Moves a board that cannot be read under a backup key, then removes it. Returns the backup key,
 * or null when nothing was stored. Throws when the store refuses the backup.
 */
export function setAsideWhiteboard(
  missionId: string,
  storage: WhiteboardStorage | null = getStorage(),
  now: Date = new Date(),
): string | null {
  if (!storage) return null;
  const key = `${WHITEBOARD_STORAGE_PREFIX}${missionId}`;
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const backupKey = `${WHITEBOARD_BACKUP_PREFIX}${missionId}:${now.toISOString()}`;
  storage.setItem(backupKey, raw);
  (storage as WhiteboardStorage & { removeItem?: (name: string) => void }).removeItem?.(key);
  return backupKey;
}

export function useWhiteboard(mission: MissionData) {
  const missionId = useMemo(() => getMissionWhiteboardId(mission), [mission]);
  const [data, setData] = useState<WhiteboardData>(() => loadWhiteboard(missionId));
  const [stored, setStored] = useState<WhiteboardStoredState>(() => inspectWhiteboard(missionId));
  const [clearedStrokes, setClearedStrokes] = useState<WhiteboardStroke[] | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<'saved' | 'memory-only' | 'blocked'>('saved');

  useEffect(() => {
    if (stored === 'corrupt') {
      setPersistenceStatus('blocked');
      return;
    }
    setPersistenceStatus(saveWhiteboard(missionId, data) ? 'saved' : 'memory-only');
  }, [data, missionId, stored]);

  return {
    missionId,
    data,
    persistenceStatus,
    storedState: stored,
    /**
     * Keeps the unreadable board under a backup key, then saves the board the screen holds (F11). The screen data is
     * not replaced. `saved` is false when the store refuses the write; only a true `saved` may be reported as success.
     * Throws when the store refuses the backup, in which case nothing has been removed.
     */
    setAside: (): { backupKey: string | null; saved: boolean } => {
      const backupKey = setAsideWhiteboard(missionId);
      const saved = saveWhiteboard(missionId, data);
      setStored('absent');
      setClearedStrokes(null);
      return { backupKey, saved };
    },
    canUndo: data.strokes.length > 0 || clearedStrokes !== null,
    setNotes: (notes: string) => setData(current => ({
      ...current,
      notes: notes.slice(0, MAX_WHITEBOARD_NOTES),
    })),
    addStroke: (stroke: WhiteboardStroke) => {
      setClearedStrokes(null);
      setData(current => {
      const normalized = normalizeWhiteboard({
        version: WHITEBOARD_VERSION,
        ...current,
        strokes: [...current.strokes, stroke],
      });
      return normalized;
      });
    },
    undoStroke: () => {
      if (data.strokes.length === 0 && clearedStrokes) {
        setData(current => ({ ...current, strokes: clearedStrokes }));
        setClearedStrokes(null);
        return;
      }
      setClearedStrokes(null);
      setData(current => ({ ...current, strokes: current.strokes.slice(0, -1) }));
    },
    clearDrawing: () => {
      if (data.strokes.length === 0) return;
      setClearedStrokes(data.strokes);
      setData(current => ({ ...current, strokes: [] }));
    },
    /**
     * Shows the board given (an import). Returns true only when the store keeps it. A board that cannot be read is
     * never saved over (F11), so the result is false then.
     */
    replaceData: (next: WhiteboardData): boolean => {
      setClearedStrokes(null);
      const normalized = normalizeWhiteboard({ version: WHITEBOARD_VERSION, ...next });
      setData(normalized);
      return stored !== 'corrupt' && saveWhiteboard(missionId, normalized);
    },
  };
}

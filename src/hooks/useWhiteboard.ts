import { useEffect, useMemo, useState } from 'react';
import type { MissionData } from '../types/mission';
import type { WhiteboardData, WhiteboardPoint, WhiteboardStroke } from '../types/whiteboard';

export const WHITEBOARD_VERSION = 1;
export const WHITEBOARD_STORAGE_PREFIX = 'fastbriefing-whiteboard:';
export const WHITEBOARD_WIDTH = 1200;
export const WHITEBOARD_HEIGHT = 675;
export const WHITEBOARD_COLORS = ['#1f2937', '#b42318', '#175cd3', '#067647', '#b54708'] as const;
export const WHITEBOARD_PEN_WIDTHS = [3, 6, 10] as const;
export const MAX_WHITEBOARD_NOTES = 12_000;
export const MAX_WHITEBOARD_STROKES = 300;
export const MAX_POINTS_PER_STROKE = 1_500;
export const MAX_TOTAL_POINTS = 12_000;

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

export function useWhiteboard(mission: MissionData) {
  const missionId = useMemo(() => getMissionWhiteboardId(mission), [mission]);
  const [data, setData] = useState<WhiteboardData>(() => loadWhiteboard(missionId));
  const [clearedStrokes, setClearedStrokes] = useState<WhiteboardStroke[] | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<'saved' | 'memory-only'>('saved');

  useEffect(() => {
    setPersistenceStatus(saveWhiteboard(missionId, data) ? 'saved' : 'memory-only');
  }, [data, missionId]);

  return {
    missionId,
    data,
    persistenceStatus,
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
  };
}

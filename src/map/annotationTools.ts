import type { MapAnnotation } from '../types/mission';
import {
  MAX_MAP_ANNOTATIONS,
  MAX_MAP_LABEL_LENGTH,
  MAX_MAP_POINTS_TOTAL,
  MAX_MAP_STROKE_POINTS,
} from '../utils/notes';

export type LatLon = [number, number];
export type AnnotationTool = 'move' | 'pin' | 'line';

export type AnnotationLimitReason = 'annotations' | 'strokePoints' | 'totalPoints';
export interface AnnotationRejection {
  ok: false;
  reason: AnnotationLimitReason;
  limit: number;
  remaining: number;
}
export type AddCheck = { ok: true } | AnnotationRejection;

/** Minimum distance between two stroke points, in metres (drops jitter without losing shape). */
export const MIN_STROKE_STEP_METERS = 10;
/** A press that moves less than this many screen pixels is a tap. */
export const TAP_TOLERANCE_PX = 8;

export function strokePointTotal(annotations: readonly MapAnnotation[]): number {
  return annotations.reduce((sum, item) => sum + (item.kind === 'stroke' ? item.points.length : 0), 0);
}

/** Whether `candidate` fits. A rejection carries the reason and how much room is left. */
export function checkAdd(annotations: readonly MapAnnotation[], candidate: MapAnnotation): AddCheck {
  if (annotations.length >= MAX_MAP_ANNOTATIONS) {
    return { ok: false, reason: 'annotations', limit: MAX_MAP_ANNOTATIONS, remaining: 0 };
  }
  if (candidate.kind === 'stroke') {
    if (candidate.points.length > MAX_MAP_STROKE_POINTS) {
      return { ok: false, reason: 'strokePoints', limit: MAX_MAP_STROKE_POINTS, remaining: 0 };
    }
    const remaining = Math.max(0, MAX_MAP_POINTS_TOTAL - strokePointTotal(annotations));
    if (candidate.points.length > remaining) {
      return { ok: false, reason: 'totalPoints', limit: MAX_MAP_POINTS_TOTAL, remaining };
    }
  }
  return { ok: true };
}

export interface RemovedAnnotation {
  annotation: MapAnnotation;
  index: number;
}

export function removeAnnotation(
  annotations: readonly MapAnnotation[],
  id: string,
): { next: MapAnnotation[]; removed: RemovedAnnotation | null } {
  const index = annotations.findIndex(item => item.id === id);
  if (index < 0) return { next: [...annotations], removed: null };
  return {
    next: annotations.filter(item => item.id !== id),
    removed: { annotation: annotations[index], index },
  };
}

/** Removes the newest annotation (one step of undo). */
export function undoLast(annotations: readonly MapAnnotation[]): { next: MapAnnotation[]; removed: RemovedAnnotation | null } {
  if (annotations.length === 0) return { next: [], removed: null };
  return removeAnnotation(annotations, annotations[annotations.length - 1].id);
}

/** Puts a removed annotation back where it was. A rejection means the room is gone. */
export function restoreAnnotation(
  annotations: readonly MapAnnotation[],
  removed: RemovedAnnotation,
): { ok: true; next: MapAnnotation[] } | AnnotationRejection {
  if (annotations.some(item => item.id === removed.annotation.id)) {
    return { ok: true, next: [...annotations] };
  }
  const check = checkAdd(annotations, removed.annotation);
  if (!check.ok) return check;
  const index = Math.min(Math.max(0, removed.index), annotations.length);
  return { ok: true, next: [...annotations.slice(0, index), removed.annotation, ...annotations.slice(index)] };
}

/** Labels are cut to the stored length so a long name cannot break the popup or the marker. */
export function truncateLabel(label: string, max: number = MAX_MAP_LABEL_LENGTH): string {
  const chars = [...label];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : label;
}

export function createAnnotationId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random}`.slice(0, 64);
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type GestureResult =
  | { type: 'none' }
  | { type: 'pin'; at: LatLon }
  | { type: 'stroke'; points: LatLon[] };

const screenDistance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Turns pointer events into pins and strokes. It holds no DOM state, so the
 * touch rules can be tested directly:
 * - pin: a single pointer that lifts without moving (a tap, not a pan).
 * - line: a single pointer drags a stroke; a second pointer cancels it and
 *   blocks new strokes until every pointer has lifted (two fingers pan or zoom).
 */
export class PointerGestures {
  private readonly pointers = new Map<number, ScreenPoint>();
  private draftState: { id: number; points: LatLon[] } | null = null;
  private tapState: { id: number; start: ScreenPoint; at: LatLon; cancelled: boolean } | null = null;
  private multiTouch = false;

  constructor(
    private readonly tool: AnnotationTool,
    private readonly distance: (a: LatLon, b: LatLon) => number,
  ) {}

  /** Stroke being drawn (a copy), for the preview. */
  get draft(): LatLon[] | null {
    return this.draftState ? [...this.draftState.points] : null;
  }

  down(id: number, point: ScreenPoint, at: LatLon): void {
    this.pointers.set(id, point);
    if (this.pointers.size > 1) {
      this.multiTouch = true;
      this.draftState = null;
      if (this.tapState) this.tapState.cancelled = true;
      return;
    }
    if (this.multiTouch) return;
    if (this.tool === 'line') this.draftState = { id, points: [at] };
    if (this.tool === 'pin') this.tapState = { id, start: point, at, cancelled: false };
  }

  /** Adds a point to the stroke when it is far enough from the last one. Returns the preview. */
  move(id: number, point: ScreenPoint, at: LatLon): LatLon[] | null {
    if (!this.pointers.has(id)) return this.draft;
    this.pointers.set(id, point);
    if (this.tapState && this.tapState.id === id && screenDistance(this.tapState.start, point) > TAP_TOLERANCE_PX) {
      this.tapState.cancelled = true;
    }
    const draft = this.draftState;
    if (draft && draft.id === id && this.pointers.size === 1 && !this.multiTouch) {
      const last = draft.points[draft.points.length - 1];
      if (draft.points.length < MAX_MAP_STROKE_POINTS && this.distance(last, at) >= MIN_STROKE_STEP_METERS) {
        draft.points.push(at);
      }
    }
    return this.draft;
  }

  up(id: number, point: ScreenPoint): GestureResult {
    let result: GestureResult = { type: 'none' };
    const tap = this.tapState;
    if (tap && tap.id === id && !tap.cancelled && !this.multiTouch && this.pointers.size === 1
      && screenDistance(tap.start, point) <= TAP_TOLERANCE_PX) {
      result = { type: 'pin', at: tap.at };
    }
    const draft = this.draftState;
    if (draft && draft.id === id && !this.multiTouch && this.pointers.size === 1 && draft.points.length >= 2) {
      result = { type: 'stroke', points: [...draft.points] };
    }
    this.release(id);
    return result;
  }

  cancel(id: number): void {
    this.release(id);
  }

  /** Whether the stroke being drawn for `id` has used up its points. */
  hasReachedLimit(id: number): boolean {
    return this.draftState !== null && this.draftState.id === id && this.draftState.points.length >= MAX_MAP_STROKE_POINTS;
  }

  /** Ends the stroke for `id` with the points it has, and releases the pointer. Null when no stroke is being drawn for it. */
  endStroke(id: number): LatLon[] | null {
    if (!this.draftState || this.draftState.id !== id) return null;
    const points = [...this.draftState.points];
    this.release(id);
    return points;
  }

  private release(id: number): void {
    this.pointers.delete(id);
    if (this.draftState && this.draftState.id === id) this.draftState = null;
    if (this.tapState && this.tapState.id === id) this.tapState = null;
    if (this.pointers.size === 0) this.multiTouch = false;
  }
}

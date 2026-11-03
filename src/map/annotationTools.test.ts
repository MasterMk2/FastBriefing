import { describe, expect, it } from 'vitest';
import type { MapPinAnnotation, MapStrokeAnnotation } from '../types/mission';
import { MAX_MAP_ANNOTATIONS, MAX_MAP_POINTS_TOTAL, MAX_MAP_STROKE_POINTS } from '../utils/notes';
import {
  checkAdd,
  PointerGestures,
  removeAnnotation,
  restoreAnnotation,
  truncateLabel,
  undoLast,
} from './annotationTools';

const pin = (id: string): MapPinAnnotation => ({ id, kind: 'pin', position: [42, 43], label: id, notes: '', color: '#123456' });
const stroke = (id: string, count: number): MapStrokeAnnotation => ({
  id,
  kind: 'stroke',
  points: Array.from({ length: count }, (_, index): [number, number] => [42 + index * 0.001, 43]),
  color: '#123456',
  width: 4,
});

/** 1 metre is about 1e-5 degrees here, so 0.001 degrees is far above the 10 m stroke step. */
const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 111_000;

describe('checkAdd', () => {
  it('rejects a pin when the annotation count is at the limit and reports nothing left', () => {
    const full = Array.from({ length: MAX_MAP_ANNOTATIONS }, (_, index) => pin(`p${index}`));
    expect(checkAdd(full, pin('extra'))).toEqual({ ok: false, reason: 'annotations', limit: MAX_MAP_ANNOTATIONS, remaining: 0 });
  });

  it('rejects a stroke longer than the per-stroke point limit', () => {
    expect(checkAdd([], stroke('s', MAX_MAP_STROKE_POINTS + 1))).toMatchObject({ ok: false, reason: 'strokePoints' });
  });

  it('reports how many total stroke points remain when a new stroke would not fit', () => {
    // 4 x 2000 + 1600 = 9600 points used, so 400 remain and a 500-point stroke is refused.
    const existing = [
      stroke('a', MAX_MAP_STROKE_POINTS),
      stroke('b', MAX_MAP_STROKE_POINTS),
      stroke('c', MAX_MAP_STROKE_POINTS),
      stroke('d', MAX_MAP_STROKE_POINTS),
      stroke('e', 1600),
    ];
    const result = checkAdd(existing, stroke('f', 500));
    expect(result).toEqual({ ok: false, reason: 'totalPoints', limit: MAX_MAP_POINTS_TOTAL, remaining: 400 });
  });

  it('accepts a pin and a stroke that fit', () => {
    expect(checkAdd([pin('a')], pin('b'))).toEqual({ ok: true });
    expect(checkAdd([], stroke('s', 2))).toEqual({ ok: true });
  });
});

describe('undo and restore', () => {
  it('removes only the newest annotation and keeps its position for restore', () => {
    const list = [pin('a'), pin('b'), pin('c')];
    const undone = undoLast(list);
    expect(undone.next.map(item => item.id)).toEqual(['a', 'b']);
    expect(undone.removed).toEqual({ annotation: list[2], index: 2 });
  });

  it('restores a removed annotation at its old index', () => {
    const list = [pin('a'), pin('b'), pin('c')];
    const removed = removeAnnotation(list, 'a');
    const restored = restoreAnnotation(removed.next, removed.removed!);
    expect(restored).toEqual({ ok: true, next: list });
  });

  it('refuses to restore when the room has gone', () => {
    const removed = { annotation: pin('gone'), index: 0 };
    const full = Array.from({ length: MAX_MAP_ANNOTATIONS }, (_, index) => pin(`p${index}`));
    expect(restoreAnnotation(full, removed)).toMatchObject({ ok: false, reason: 'annotations' });
  });

  it('does nothing when there is nothing to undo', () => {
    expect(undoLast([])).toEqual({ next: [], removed: null });
  });
});

describe('truncateLabel', () => {
  it('cuts long names to the limit with an ellipsis and keeps short names', () => {
    expect(truncateLabel('短い', 80)).toBe('短い');
    const cut = truncateLabel('あ'.repeat(100), 80);
    expect([...cut]).toHaveLength(80);
    expect(cut.endsWith('…')).toBe(true);
  });
});

describe('PointerGestures', () => {
  it('treats a press that does not move as a pin', () => {
    const gestures = new PointerGestures('pin', distance);
    gestures.down(1, { x: 10, y: 10 }, [42, 43]);
    expect(gestures.up(1, { x: 11, y: 10 })).toEqual({ type: 'pin', at: [42, 43] });
  });

  it('does not treat a pan as a pin', () => {
    const gestures = new PointerGestures('pin', distance);
    gestures.down(1, { x: 10, y: 10 }, [42, 43]);
    gestures.move(1, { x: 60, y: 10 }, [42.001, 43]);
    expect(gestures.up(1, { x: 60, y: 10 })).toEqual({ type: 'none' });
  });

  it('draws a stroke from a single pointer and keeps points at least 10 m apart', () => {
    const gestures = new PointerGestures('line', distance);
    gestures.down(1, { x: 0, y: 0 }, [42, 43]);
    gestures.move(1, { x: 1, y: 0 }, [42.000001, 43]);
    const preview = gestures.move(1, { x: 40, y: 0 }, [42.001, 43]);
    expect(preview).toEqual([[42, 43], [42.001, 43]]);
    const result = gestures.up(1, { x: 40, y: 0 });
    expect(result).toEqual({ type: 'stroke', points: [[42, 43], [42.001, 43]] });
  });

  it('reaches the point limit and ends the stroke with exactly the limit of points', () => {
    const gestures = new PointerGestures('line', distance);
    gestures.down(1, { x: 0, y: 0 }, [42, 43]);
    for (let index = 1; index < MAX_MAP_STROKE_POINTS; index += 1) {
      gestures.move(1, { x: index, y: 0 }, [42 + index * 0.001, 43]);
    }
    expect(gestures.hasReachedLimit(1)).toBe(true);
    expect(gestures.hasReachedLimit(2)).toBe(false);
    const points = gestures.endStroke(1);
    expect(points).toHaveLength(MAX_MAP_STROKE_POINTS);
    expect(gestures.draft).toBeNull();
    expect(gestures.endStroke(1)).toBeNull();
  });

  it('needs at least two points for a stroke', () => {
    const gestures = new PointerGestures('line', distance);
    gestures.down(1, { x: 0, y: 0 }, [42, 43]);
    expect(gestures.up(1, { x: 0, y: 0 })).toEqual({ type: 'none' });
  });

  it('cancels the stroke when a second finger touches, and blocks new strokes until all lift', () => {
    const gestures = new PointerGestures('line', distance);
    gestures.down(1, { x: 0, y: 0 }, [42, 43]);
    gestures.move(1, { x: 40, y: 0 }, [42.001, 43]);
    gestures.down(2, { x: 80, y: 0 }, [42.002, 43]);
    expect(gestures.draft).toBeNull();
    expect(gestures.up(1, { x: 40, y: 0 })).toEqual({ type: 'none' });
    expect(gestures.up(2, { x: 80, y: 0 })).toEqual({ type: 'none' });
    // All fingers are up: a fresh single touch draws again.
    gestures.down(3, { x: 0, y: 0 }, [42, 43]);
    expect(gestures.draft).toEqual([[42, 43]]);
  });

  it('ignores a tap in pin mode when a second finger was involved', () => {
    const gestures = new PointerGestures('pin', distance);
    gestures.down(1, { x: 0, y: 0 }, [42, 43]);
    gestures.down(2, { x: 80, y: 0 }, [42.002, 43]);
    expect(gestures.up(1, { x: 0, y: 0 })).toEqual({ type: 'none' });
  });
});

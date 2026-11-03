// Owner: P6 (記入・改版・ファイル操作・初回画面). Whiteboard section of the notes screen (SPEC 1.3 記入, F11).
// The board state and its persistence live in useMission().whiteboard (useWhiteboard). Drawing uses
// WhiteboardDrawing (shared with the print document).
import { useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import WhiteboardDrawing from '../../components/WhiteboardDrawing';
import {
  MAX_POINTS_PER_STROKE,
  MAX_WHITEBOARD_NOTES,
  MAX_WHITEBOARD_SIDECAR_BYTES,
  WHITEBOARD_COLORS,
  WHITEBOARD_HEIGHT,
  WHITEBOARD_PEN_WIDTHS,
  WHITEBOARD_WIDTH,
  parseWhiteboardSidecar,
  serializeWhiteboardSidecar,
} from '../../hooks/useWhiteboard';
import { Notice } from '../../shell/Notice';
import { useMission } from '../../shell/MissionContext';
import type { WhiteboardPoint, WhiteboardStroke } from '../../types/whiteboard';

let nextStrokeId = 1;

/**
 * Names for the palette, in the order of WHITEBOARD_COLORS, so that a screen reader says the colour, not its hex value.
 * Only the order links the two lists, so a palette change must change this list too.
 */
const COLOR_NAME_KEYS = ['black', 'red', 'blue', 'green', 'orange'] as const;

export function WhiteboardPanel() {
  const { t } = useTranslation('notes');
  const { mission, whiteboard } = useMission();
  const { data, persistenceStatus, canUndo } = whiteboard;
  const [penColor, setPenColor] = useState<string>(WHITEBOARD_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(WHITEBOARD_PEN_WIDTHS[1]);
  const [draft, setDraft] = useState<WhiteboardStroke | null>(null);
  const [message, setMessage] = useState('');
  const draftRef = useRef<WhiteboardStroke | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const colorName = (color: string): string => {
    const key = COLOR_NAME_KEYS[WHITEBOARD_COLORS.indexOf(color as (typeof WHITEBOARD_COLORS)[number])];
    return key ? t(`notes:whiteboard.colorNames.${key}`) : color;
  };

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>): WhiteboardPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(WHITEBOARD_WIDTH, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * WHITEBOARD_WIDTH)),
      y: Math.min(WHITEBOARD_HEIGHT, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * WHITEBOARD_HEIGHT)),
    };
  };

  const beginStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    const stroke: WhiteboardStroke = {
      id: `stroke-${Date.now().toString(36)}-${nextStrokeId++}`,
      color: penColor,
      width: penWidth,
      points: [pointFromEvent(event)],
    };
    draftRef.current = stroke;
    setDraft(stroke);
  };

  const continueStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = draftRef.current;
    if (!current || pointerIdRef.current !== event.pointerId) return;
    if (current.points.length >= MAX_POINTS_PER_STROKE) {
      setMessage(t('notes:whiteboard.strokeLimit'));
      return;
    }
    event.preventDefault();
    const point = pointFromEvent(event);
    const previous = current.points[current.points.length - 1];
    if ((point.x - previous.x) ** 2 + (point.y - previous.y) ** 2 < 4) return;
    const next = { ...current, points: [...current.points, point] };
    draftRef.current = next;
    setDraft(next);
  };

  const finishStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const completed = draftRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
    draftRef.current = null;
    setDraft(null);
    if (!completed) return;
    // A tap becomes a short visible line so that it is kept as a stroke.
    const points = completed.points.length === 1
      ? [completed.points[0], { x: completed.points[0].x + 0.01, y: completed.points[0].y + 0.01 }]
      : completed.points;
    whiteboard.addStroke({ ...completed, points });
  };

  const cancelStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    draftRef.current = null;
    setDraft(null);
  };

  const exportBoard = () => {
    const blob = new Blob([serializeWhiteboardSidecar(mission.sourceFingerprint, data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fastbriefing-whiteboard.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage(t('notes:whiteboard.exported'));
  };

  const importBoard = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_WHITEBOARD_SIDECAR_BYTES) {
      setMessage(t('notes:whiteboard.importFailed'));
      return;
    }
    try {
      whiteboard.replaceData(parseWhiteboardSidecar(await file.text(), mission.sourceFingerprint));
      setMessage(t('notes:whiteboard.imported'));
    } catch {
      setMessage(t('notes:whiteboard.importFailed'));
    }
  };

  const setAside = () => {
    try {
      const backupKey = whiteboard.setAside();
      setMessage(backupKey ? t('notes:screen.board.setAsideDone', { key: backupKey }) : '');
    } catch {
      setMessage(t('notes:screen.board.setAsideFailed'));
    }
  };

  return (
    <div className="notes-board">
      <div className="notes-board-heading">
        <div>
          <h3>{t('notes:whiteboard.title')}</h3>
          <p className="hint">{t('notes:whiteboard.description')}</p>
        </div>
        <p className="notes-board-state" role="status">
          {persistenceStatus === 'saved' && t('notes:whiteboard.savedLocally')}
          {persistenceStatus === 'memory-only' && t('notes:whiteboard.memoryOnly')}
          {persistenceStatus === 'blocked' && t('notes:whiteboard.blocked')}
        </p>
      </div>

      {persistenceStatus === 'blocked' && (
        <Notice tone="error" title={t('notes:screen.board.blockedTitle')}>
          <p>{t('notes:screen.board.blockedBody')}</p>
          <button type="button" className="btn btn-secondary" onClick={setAside}>{t('notes:screen.board.setAside')}</button>
        </Notice>
      )}

      <div className="notes-board-toolbar" role="toolbar" aria-label={t('notes:whiteboard.toolbar')}>
        <div className="notes-board-colors" role="group" aria-label={t('notes:whiteboard.penColor')}>
          {WHITEBOARD_COLORS.map(color => (
            <button
              key={color}
              type="button"
              className="notes-board-color"
              style={{ backgroundColor: color }}
              aria-label={t('notes:whiteboard.selectColor', { color: colorName(color) })}
              aria-pressed={penColor === color}
              onClick={() => setPenColor(color)}
            />
          ))}
        </div>
        <label className="notes-board-width">
          {t('notes:whiteboard.penWidth')}
          <select value={penWidth} onChange={event => setPenWidth(Number(event.target.value))}>
            {WHITEBOARD_PEN_WIDTHS.map(width => (
              <option key={width} value={width}>{t('notes:whiteboard.widthValue', { width })}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-secondary" disabled={!canUndo} onClick={() => whiteboard.undoStroke()}>
          {t('notes:whiteboard.undo')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={data.strokes.length === 0}
          onClick={() => whiteboard.clearDrawing()}
        >
          {t('notes:whiteboard.clearDrawing')}
        </button>
      </div>

      <p className="hint" id="notes-board-pointer-help">{t('notes:whiteboard.pointerOnly')}</p>
      <div className="notes-board-surface">
        <WhiteboardDrawing strokes={data.strokes} draft={draft} label={t('notes:whiteboard.canvasLabel')} />
        <svg
          className="notes-board-input"
          viewBox={`0 0 ${WHITEBOARD_WIDTH} ${WHITEBOARD_HEIGHT}`}
          role="img"
          aria-label={t('notes:whiteboard.drawingSurface')}
          aria-describedby="notes-board-pointer-help"
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={cancelStroke}
        >
          <rect width={WHITEBOARD_WIDTH} height={WHITEBOARD_HEIGHT} fill="transparent" />
        </svg>
      </div>

      <div className="notes-board-text">
        <label htmlFor="notes-board-text-input"><strong>{t('notes:whiteboard.notes')}</strong></label>
        <p className="hint" id="notes-board-text-help">{t('notes:whiteboard.notesHelp')}</p>
        <textarea
          id="notes-board-text-input"
          value={data.notes}
          maxLength={MAX_WHITEBOARD_NOTES}
          aria-describedby="notes-board-text-help"
          placeholder={t('notes:whiteboard.notesPlaceholder')}
          onChange={event => whiteboard.setNotes(event.target.value)}
        />
      </div>

      <div className="notes-board-share">
        <h4>{t('notes:whiteboard.shareTitle')}</h4>
        <p className="hint">{t('notes:whiteboard.shareHelp')}</p>
        <div className="notes-actions">
          <button type="button" className="btn btn-secondary" onClick={exportBoard}>{t('notes:whiteboard.exportJson')}</button>
          <label className="btn btn-secondary">
            {t('notes:whiteboard.importJson')}
            <input className="visually-hidden" type="file" accept=".json,application/json" onChange={event => void importBoard(event)} />
          </label>
        </div>
      </div>
      {message && <p role="status" className="notes-message">{message}</p>}
    </div>
  );
}

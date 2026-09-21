import { useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
} from '../hooks/useWhiteboard';
import type { WhiteboardData, WhiteboardPoint, WhiteboardStroke } from '../types/whiteboard';
import WhiteboardDrawing from './WhiteboardDrawing';

interface WhiteboardTabProps {
  sourceFingerprint: string;
  data: WhiteboardData;
  persistenceStatus: 'saved' | 'memory-only';
  canUndo: boolean;
  onNotesChange: (notes: string) => void;
  onAddStroke: (stroke: WhiteboardStroke) => void;
  onUndoStroke: () => void;
  onClearDrawing: () => void;
  onReplaceData: (data: WhiteboardData) => void;
}

let nextStrokeId = 1;

export default function WhiteboardTab({
  sourceFingerprint,
  data,
  persistenceStatus,
  canUndo,
  onNotesChange,
  onAddStroke,
  onUndoStroke,
  onClearDrawing,
  onReplaceData,
}: WhiteboardTabProps) {
  const { t } = useTranslation();
  const [penColor, setPenColor] = useState<string>(WHITEBOARD_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(WHITEBOARD_PEN_WIDTHS[1]);
  const [draft, setDraft] = useState<WhiteboardStroke | null>(null);
  const [shareStatus, setShareStatus] = useState('');
  const draftRef = useRef<WhiteboardStroke | null>(null);
  const pointerIdRef = useRef<number | null>(null);

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
    if (!current || pointerIdRef.current !== event.pointerId || current.points.length >= MAX_POINTS_PER_STROKE) return;
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
    const points = completed.points.length === 1
      ? [completed.points[0], { x: completed.points[0].x + 0.01, y: completed.points[0].y + 0.01 }]
      : completed.points;
    onAddStroke({ ...completed, points });
  };

  const cancelStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    draftRef.current = null;
    setDraft(null);
  };

  const exportSidecar = () => {
    const blob = new Blob([serializeWhiteboardSidecar(sourceFingerprint, data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fastbriefing-whiteboard.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setShareStatus(t('whiteboard.exported'));
  };

  const importSidecar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_WHITEBOARD_SIDECAR_BYTES) {
      setShareStatus(t('whiteboard.importFailed'));
      return;
    }
    try {
      onReplaceData(parseWhiteboardSidecar(await file.text(), sourceFingerprint));
      setShareStatus(t('whiteboard.imported'));
    } catch {
      setShareStatus(t('whiteboard.importFailed'));
    }
  };

  return (
    <div className="tab-panel whiteboard">
      <section className="section">
        <div className="whiteboard-heading">
          <div>
            <h2>{t('whiteboard.title')}</h2>
            <p>{t('whiteboard.description')}</p>
          </div>
          <span className={`hint${persistenceStatus === 'memory-only' ? ' warning-text' : ''}`} role="status">
            {t(persistenceStatus === 'saved' ? 'whiteboard.savedLocally' : 'whiteboard.storageUnavailable')}
          </span>
        </div>

        <div className="whiteboard-toolbar" role="toolbar" aria-label={t('whiteboard.toolbar')}>
          <div className="whiteboard-tool-group" aria-label={t('whiteboard.penColor')}>
            {WHITEBOARD_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className={`whiteboard-color${penColor === color ? ' active' : ''}`}
                style={{ backgroundColor: color }}
                aria-label={t('whiteboard.selectColor', { color })}
                aria-pressed={penColor === color}
                onClick={() => setPenColor(color)}
              />
            ))}
          </div>
          <label>
            {t('whiteboard.penWidth')}
            <select value={penWidth} onChange={event => setPenWidth(Number(event.target.value))}>
              {WHITEBOARD_PEN_WIDTHS.map(width => (
                <option key={width} value={width}>{t('whiteboard.widthValue', { width })}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-secondary" disabled={!canUndo} onClick={onUndoStroke}>
            {t('whiteboard.undo')}
          </button>
          <button type="button" className="btn btn-secondary" disabled={data.strokes.length === 0} onClick={onClearDrawing}>
            {t('whiteboard.clearDrawing')}
          </button>
        </div>

        <div className="whiteboard-board">
          <WhiteboardDrawing strokes={data.strokes} draft={draft} label={t('whiteboard.canvasLabel')} />
          <svg
            className="whiteboard-input-layer"
            viewBox={`0 0 ${WHITEBOARD_WIDTH} ${WHITEBOARD_HEIGHT}`}
            aria-label={t('whiteboard.drawingSurface')}
            onPointerDown={beginStroke}
            onPointerMove={continueStroke}
            onPointerUp={finishStroke}
            onPointerCancel={cancelStroke}
          >
            <rect width={WHITEBOARD_WIDTH} height={WHITEBOARD_HEIGHT} fill="transparent" />
          </svg>
        </div>
      </section>

      <section className="section whiteboard-notes">
        <label htmlFor="whiteboard-notes"><strong>{t('whiteboard.notes')}</strong></label>
        <p className="hint" id="whiteboard-notes-help">{t('whiteboard.notesHelp')}</p>
        <textarea
          id="whiteboard-notes"
          value={data.notes}
          maxLength={MAX_WHITEBOARD_NOTES}
          aria-describedby="whiteboard-notes-help"
          placeholder={t('whiteboard.notesPlaceholder')}
          onChange={event => onNotesChange(event.target.value)}
        />
      </section>

      <section className="section whiteboard-share" aria-labelledby="whiteboard-share-title">
        <h3 id="whiteboard-share-title">{t('whiteboard.shareTitle')}</h3>
        <p className="hint">{t('whiteboard.shareHelp')}</p>
        <div className="export-actions">
          <button type="button" className="btn btn-secondary" onClick={exportSidecar}>{t('whiteboard.exportJson')}</button>
          <label className="btn btn-secondary">
            {t('whiteboard.importJson')}
            <input className="visually-hidden" type="file" accept=".json,application/json" onChange={event => void importSidecar(event)} />
          </label>
        </div>
        {shareStatus && <p role="status">{shareStatus}</p>}
      </section>
    </div>
  );
}

// Owner: P6 (記入・改版・ファイル操作・初回画面). Initial screen (SPEC 1.3 初回画面).
// Contract (frozen): default export InitialScreen, props InitialScreenProps below.
//   Shown by AppShell when no mission is open. A failed read in this state arrives as `error` (already
//   translated) and is shown directly under the drop area with role=alert and a "choose another file" button
//   (SPEC 3). App.tsx passes it only while no mission is open and then does not draw its own .app-error band,
//   so the message is never shown twice. The loading overlay is still rendered by App.tsx.
//   The hidden <input type="file" id="file-input"> lives in App.tsx;
//   onPickFiles opens it. Drop events are handled by App.tsx on the window.
import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface InitialScreenProps {
  /** A file read is in progress (aria-busy on the drop zone). */
  loading: boolean;
  /** A file is being dragged over the window. */
  isDragging: boolean;
  /** Opens the file picker. The same action as the drop area. */
  onPickFiles: () => void;
  /** A failed read (already translated), shown under the drop area. Null or omitted: no error. */
  error?: string | null;
  /** Chooses another file after the failure. Defaults to onPickFiles. */
  onRetry?: () => void;
}

/** After this long, a read is slow and the screen says that it can be cancelled from the overlay (SPEC 6 状態). */
const SLOW_LOAD_MS = 10_000;

/** True once a read has lasted SLOW_LOAD_MS; resets when the read ends. */
function useSlowLoad(loading: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [loading]);
  return loading && slow;
}

export default function InitialScreen({ loading, isDragging, onPickFiles, error = null, onRetry = onPickFiles }: InitialScreenProps) {
  const { t } = useTranslation('initial');
  const slow = useSlowLoad(loading);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // The whole drop area opens the picker, as the old label did (SPEC 1.3). The button has no handler of its
  // own: its click bubbles here once, so keyboard and mouse both call onPickFiles exactly once.
  const handleZonePress = () => {
    if (!loading) onPickFiles();
  };

  return (
    <section className="initial-screen">
      <div
        className={`initial-drop${isDragging ? ' dragging' : ''}`}
        role="region"
        aria-label={t('initial:dropZone')}
        aria-busy={loading}
        onDragOver={handleDragOver}
        onClick={handleZonePress}
      >
        <p className="initial-drop-title">{t('initial:dropFile')}</p>
        <p className="initial-drop-hint">{t('initial:dropHint')}</p>
        <button type="button" className="btn btn-primary initial-pick" disabled={loading}>
          {t('initial:pick')}
        </button>
        {loading && (
          <p className="initial-loading" role="status" aria-live="polite">
            {slow ? t('initial:slow') : t('initial:loading')}
          </p>
        )}
      </div>

      {/* Outside the drop area: a click here must not bubble to handleZonePress and open the picker twice. */}
      {error && (
        <div className="initial-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={onRetry} disabled={loading}>
            {t('initial:retry')}
          </button>
        </div>
      )}

      <section className="initial-guide" aria-labelledby="initial-guide-title">
        <h2 id="initial-guide-title">{t('initial:guideTitle')}</h2>
        <ul className="initial-points">
          <li>{t('initial:point1')}</li>
          <li>{t('initial:point2')}</li>
          <li>{t('initial:point3')}</li>
        </ul>
        <p className="initial-compare">{t('initial:compareHint')}</p>
      </section>
    </section>
  );
}

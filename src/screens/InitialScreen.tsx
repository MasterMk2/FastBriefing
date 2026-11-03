// Owner: P6 (記入・改版・ファイル操作・初回画面). Initial screen (SPEC 1.3 初回画面).
// Contract (frozen): default export InitialScreen, props InitialScreenProps below.
//   Shown by AppShell when no mission is open. Errors and the loading overlay are rendered by App.tsx
//   (the error band sits under the header). The hidden <input type="file" id="file-input"> lives in App.tsx;
//   onPickFiles opens it. Drop events are handled by App.tsx on the window.
import type { KeyboardEvent, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface InitialScreenProps {
  /** A file read is in progress (aria-busy on the drop zone). */
  loading: boolean;
  /** A file is being dragged over the window. */
  isDragging: boolean;
  /** Opens the file picker. The same action as the drop area. */
  onPickFiles: () => void;
}

export default function InitialScreen({ loading, isDragging, onPickFiles }: InitialScreenProps) {
  const { t } = useTranslation('initial');

  const handleKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPickFiles();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <section className="initial-screen">
      <div
        className={`drop-zone${isDragging ? ' dragging' : ''}`}
        onDragOver={handleDragOver}
        aria-label={t('initial:dropZone')}
        aria-busy={loading}
      >
        <label
          htmlFor="file-input"
          className="drop-label"
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-describedby="drop-hint"
        >
          <div className="drop-icon" aria-hidden="true">📁</div>
          <p>{t('initial:dropFile')}</p>
          <p className="drop-hint" id="drop-hint">{t('initial:dropHint')}</p>
        </label>
      </div>
      <ul className="initial-points">
        <li>{t('initial:point1')}</li>
        <li>{t('initial:point2')}</li>
        <li>{t('initial:point3')}</li>
      </ul>
      <p className="initial-compare">{t('initial:compareHint')}</p>
    </section>
  );
}

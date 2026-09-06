import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MissionParser } from './core/MissionParser';
import { normalizeMission } from './core/MissionNormalizer';
import type { DisplaySettings, MissionData } from './types/mission';
import MissionView from './components/MissionView';
import { useSettings } from './hooks/useSettings';
import { useTranslation } from 'react-i18next';

function App() {
  const [missionData, setMissionData] = useState<MissionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { settings, setViewMode, setLanguage } = useSettings();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const parserRef = useRef<MissionParser | null>(null);
  const parseGenerationRef = useRef(0);

  const handleFileDrop = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.miz')) {
      parserRef.current?.cancel();
      parserRef.current = null;
      parseGenerationRef.current += 1;
      setLoading(false);
      setError(t('app.invalidMiz'));
      return;
    }

    parserRef.current?.cancel();
    const parser = new MissionParser();
    parserRef.current = parser;
    const generation = ++parseGenerationRef.current;
    setLoading(true);
    setError(null);

    try {
      const parsed = await parser.parse(file);
      if (parserRef.current !== parser || parseGenerationRef.current !== generation) return;

      setMissionData(normalizeMission(parsed, settings));
    } catch (err) {
      if (parserRef.current === parser && parseGenerationRef.current === generation && !isAbortError(err)) {
        const message = err instanceof Error ? err.message : '';
        setError(message ? t('app.parseErrorDetails', { message }) : t('app.parseError'));
      }
    } finally {
      if (parserRef.current === parser) {
        parserRef.current = null;
        setLoading(false);
      }
    }
  }, [settings, t]);

  const handleFiles = useCallback((fileList: FileList | readonly File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) {
      setError(t('app.invalidMiz'));
      return;
    }

    const mizFiles = files.filter(file => file.name.toLowerCase().endsWith('.miz'));
    if (mizFiles.length === 0) {
      setError(t('app.invalidMizOnly'));
      setNotice(null);
      return;
    }

    if (files.length > 1) {
      const ignoredCount = files.length - 1;
      setNotice(t('app.multipleFiles', { fileName: mizFiles[0].name, count: ignoredCount }));
    } else {
      setNotice(null);
    }

    void handleFileDrop(mizFiles[0]);
  }, [handleFileDrop, t]);

  const handleWindowDragEnter = useCallback((event: globalThis.DragEvent) => {
    event.preventDefault();
    if (!hasFiles(event)) return;
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleWindowDragLeave = useCallback((event: globalThis.DragEvent) => {
    event.preventDefault();
    if (!hasFiles(event)) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleWindowDragOver = useCallback((event: globalThis.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleWindowDrop = useCallback((event: globalThis.DragEvent) => {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (event.dataTransfer?.files.length) {
      handleFiles(event.dataTransfer.files);
    }
  }, [handleFiles]);

  useEffect(() => {
    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleWindowDragEnter, handleWindowDragLeave, handleWindowDragOver, handleWindowDrop]);

  useEffect(() => () => {
    parserRef.current?.cancel();
  }, []);

  const handleDropZoneDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow selecting the same file again after a parse error.
    event.target.value = '';
    if (file) {
      setNotice(null);
      void handleFileDrop(file);
    }
  }, [handleFileDrop]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDropLabelKeyDown = useCallback((event: ReactKeyboardEvent<HTMLLabelElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  }, [openFilePicker]);

  const handleRetrySelection = useCallback(() => {
    setError(null);
    setNotice(null);
    openFilePicker();
  }, [openFilePicker]);

  const resetMission = useCallback(() => {
    parserRef.current?.cancel();
    parserRef.current = null;
    parseGenerationRef.current += 1;
    setLoading(false);
    setError(null);
    setNotice(null);
    setMissionData(null);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>FastBriefing</h1>
        <div className="header-controls">
          <label>
            <input type="checkbox" checked={settings.viewMode === 'creator'} onChange={() => setViewMode(settings.viewMode === 'creator' ? 'pilot' : 'creator')} />
            {settings.viewMode === 'creator' ? t('app.creatorView') : t('app.pilotView')}
          </label>
          <select value={settings.language} onChange={(event) => setLanguage(event.target.value as DisplaySettings['language'])} aria-label={t('app.displayLanguage')}>
            <option value="ja">{t('app.japanese')}</option>
            <option value="en">{t('app.english')}</option>
          </select>
        </div>
      </header>

      <main className="main">
        <input
          ref={fileInputRef}
          type="file"
          accept=".miz"
          onChange={handleFileSelect}
          id="file-input"
          className="visually-hidden"
          aria-label={t('app.selectMiz')}
        />

        {!missionData ? (
          <div
            className={`drop-zone${isDragging ? ' dragging' : ''}`}
            onDragOver={handleDropZoneDragOver}
            aria-label={t('app.dropZone')}
            aria-busy={loading}
          >
            <label
              htmlFor="file-input"
              className="drop-label"
              role="button"
              tabIndex={0}
              onKeyDown={handleDropLabelKeyDown}
              aria-describedby="drop-hint"
            >
              <div className="drop-icon" aria-hidden="true">📁</div>
              <p>{t('app.dropFile')}</p>
              <p className="drop-hint" id="drop-hint">{t('app.dropHint')}</p>
            </label>
          </div>
        ) : (
          <MissionView mission={missionData} settings={settings} />
        )}

        {isDragging && missionData && (
          <div className="drop-overlay" role="status" aria-live="polite">
            {t('app.dropFile')}
          </div>
        )}

        {notice && <div className="drop-notice" role="status">{notice}</div>}

        {error && (
          <div className="error app-error" role="alert">
            <p>{error}</p>
            <div className="error-actions">
              <button type="button" className="btn btn-secondary" onClick={handleRetrySelection}>{t('app.retry')}</button>
              <button type="button" className="btn btn-secondary" onClick={resetMission}>{t('app.reset')}</button>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true"></div>
            <p>{t('app.loading')}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function hasFiles(event: globalThis.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files') || Boolean(event.dataTransfer?.files.length);
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

export default App;

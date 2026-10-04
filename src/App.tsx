import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MissionParser } from './core/MissionParser';
import { MissionBatchLoader, validateMissionFiles } from './core/MissionBatchLoader';
import { createMissionRevision } from './utils/missionRevision';
import RevisionComparison from './components/RevisionComparison';
import type { LoadedRevision } from './components/RevisionComparison';
import { normalizeMission } from './core/MissionNormalizer';
import type { DisplaySettings, MissionData, UserNotes } from './types/mission';
import MissionView from './components/MissionView';
import { THEMES, useSettings } from './hooks/useSettings';
import { useTranslation } from 'react-i18next';
import { createMissionKey, emptyUserNotes, readStoredNotes, saveStoredNotes } from './utils/notes';
import { missionLoadErrorTranslationKey } from './utils/missionLoadError';

function App() {
  const [missionData, setMissionData] = useState<MissionData | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<[LoadedRevision, LoadedRevision] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const { settings, setViewMode, setLanguage, setTheme } = useSettings();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const loaderRef = useRef(new MissionBatchLoader(() => new MissionParser()));
  const parseGenerationRef = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = settings.theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [settings.theme]);

  const handleFiles = useCallback((fileList: FileList | readonly File[]) => {
    const files = Array.from(fileList);
    const generation = ++parseGenerationRef.current;
    loaderRef.current.cancel();
    const validationError = validateMissionFiles(files);
    if (validationError) {
      setLoading(false);
      setError(t(`app.${validationError}`));
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const parsed = await loaderRef.current.load(files);
        if (!parsed || parseGenerationRef.current !== generation) return;
        const latestFile = files[files.length - 1];
        const missionKey = await createMissionKey(latestFile);
        if (parseGenerationRef.current !== generation) return;
        const normalized = normalizeMission(parsed[parsed.length - 1], settings);
        normalized.userNotes = readStoredNotes(missionKey) ?? emptyUserNotes(missionKey);
        const snapshots = parsed.map((mission, index) => ({ name: files[index].name, fingerprint: mission.sourceFingerprint, revision: createMissionRevision(mission) }));
        setStorageFailed(false);
        setMissionData(normalized);
        setSourceFile(latestFile);
        setRevisions(snapshots.length === 2 ? [snapshots[0], snapshots[1]] : null);
      } catch (err) {
        if (parseGenerationRef.current === generation && !isAbortError(err)) {
          const message = err instanceof Error ? err.message : '';
          const translationKey = missionLoadErrorTranslationKey(err);
          setError(message ? t(translationKey, { message }) : t('app.parseError'));
        }
      } finally {
        if (parseGenerationRef.current === generation) setLoading(false);
      }
    })();
  }, [settings, t]);

  const handleNotesChange = useCallback((notes: UserNotes) => {
    setMissionData(current => current?.userNotes.missionKey === notes.missionKey
      ? { ...current, userNotes: notes }
      : current);
  }, []);

  useEffect(() => {
    if (!missionData?.userNotes.missionKey) return;
    setStorageFailed(!saveStoredNotes(missionData.userNotes));
  }, [missionData?.userNotes]);

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

  useEffect(() => {
    const loader = loaderRef.current;
    return () => {
      loader.cancel();
      parseGenerationRef.current += 1;
    };
  }, []);

  const handleDropZoneDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Snapshot before clearing, so the same selection can be retried.
    event.target.value = '';
    if (files.length) handleFiles(files);
  }, [handleFiles]);

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
    openFilePicker();
  }, [openFilePicker]);

  const resetMission = useCallback(() => {
    loaderRef.current.cancel();
    parseGenerationRef.current += 1;
    setLoading(false);
    setError(null);
    setMissionData(null);
    setSourceFile(null);
    setRevisions(null);
  }, []);

  return (
    <div className="app" data-theme={settings.theme}>
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
          {THEMES.length > 1 && (
            <select value={settings.theme} onChange={(event) => setTheme(event.target.value as DisplaySettings['theme'])} aria-label={t('app.theme')}>
              {THEMES.map(theme => <option key={theme} value={theme}>{t(`app.themes.${theme}`)}</option>)}
            </select>
          )}
        </div>
      </header>

      <main className="main">
        <input
          ref={fileInputRef}
          type="file"
          accept=".miz"
          multiple
          onChange={handleFileSelect}
          id="file-input"
          className="visually-hidden"
          aria-label={t('app.selectMiz')}
        />

        {missionData && <div className="revision-actions">
          <button type="button" className="btn btn-secondary" onClick={openFilePicker}>{t('revision.open')}</button>
          <span>{sourceFile?.name}</span>
        </div>}
        {revisions && <RevisionComparison
          key={`${revisions[0].fingerprint}:${revisions[1].fingerprint}`}
          revisions={revisions} settings={settings} onClose={() => setRevisions(null)}
        />}
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
          <MissionView mission={missionData} settings={settings} sourceFile={sourceFile} onNotesChange={handleNotesChange} storageFailed={storageFailed} />
        )}

        {isDragging && missionData && (
          <div className="drop-overlay" role="status" aria-live="polite">
            {t('app.dropFile')}
          </div>
        )}


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
            <button type="button" className="btn btn-secondary" onClick={() => {
              loaderRef.current.cancel();
              parseGenerationRef.current += 1;
              setLoading(false);
            }}>{t('revision.cancel')}</button>
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

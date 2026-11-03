import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { MissionParser } from './core/MissionParser';
import { MissionBatchLoader, validateMissionFiles } from './core/MissionBatchLoader';
import { createMissionRevision } from './utils/missionRevision';
import type { LoadedRevision } from './components/RevisionComparison';
import { normalizeMission } from './core/MissionNormalizer';
import type { MissionData, UserNotes } from './types/mission';
import AppShell from './shell/AppShell';
import { useSettings } from './hooks/useSettings';
import { useTranslation } from 'react-i18next';
import { createMissionKey, emptyUserNotes, readStoredNotes, saveStoredNotes } from './utils/notes';
import { missionLoadErrorTranslationKey } from './utils/missionLoadError';

function App() {
  const [missionData, setMissionData] = useState<MissionData | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failure of the old-version pick (F10). It has its own band, so the open mission is never reset from it.
  const [compareError, setCompareError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<[LoadedRevision, LoadedRevision] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const { settings } = useSettings();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compareInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const loaderRef = useRef(new MissionBatchLoader(() => new MissionParser()));
  const parseGenerationRef = useRef(0);
  // The revision snapshot of the open file, so that comparing parses only the older file (F10).
  const latestSnapshotRef = useRef<LoadedRevision | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.fontScale = settings.fontScale;
    return () => {
      delete document.documentElement.dataset.theme;
      delete document.documentElement.dataset.fontScale;
    };
  }, [settings.theme, settings.fontScale]);

  const handleFiles = useCallback((fileList: FileList | readonly File[]) => {
    const files = Array.from(fileList);
    const generation = ++parseGenerationRef.current;
    loaderRef.current.cancel();
    setCompareError(null);
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
        latestSnapshotRef.current = snapshots[snapshots.length - 1] ?? null;
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

  const handleFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Snapshot before clearing, so the same selection can be retried.
    event.target.value = '';
    if (files.length) handleFiles(files);
  }, [handleFiles]);

  /** The old version of a comparison: only that file is parsed; the open mission stays as it is (F10). */
  const handleCompareSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const current = latestSnapshotRef.current;
    if (files.length === 0 || !current) return;
    const [file] = files;
    setError(null);
    setCompareError(null);
    const validationError = validateMissionFiles([file]);
    if (validationError) {
      setCompareError(t(`legacy:app.${validationError}`));
      return;
    }
    const generation = ++parseGenerationRef.current;
    loaderRef.current.cancel();
    setLoading(true);
    void (async () => {
      try {
        const parsed = await loaderRef.current.load([file]);
        if (!parsed || parseGenerationRef.current !== generation) return;
        const before: LoadedRevision = {
          name: file.name,
          fingerprint: parsed[0].sourceFingerprint,
          revision: createMissionRevision(parsed[0]),
        };
        setRevisions([before, current]);
      } catch (err) {
        if (parseGenerationRef.current === generation && !isAbortError(err)) {
          const message = err instanceof Error ? err.message : '';
          const translationKey = missionLoadErrorTranslationKey(err);
          setCompareError(message ? t(`legacy:${translationKey}`, { message }) : t('legacy:app.parseError'));
        }
      } finally {
        if (parseGenerationRef.current === generation) setLoading(false);
      }
    })();
  }, [t]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRetrySelection = useCallback(() => {
    setError(null);
    openFilePicker();
  }, [openFilePicker]);

  /** Opens the comparison input (the old version), never the picker that replaces the mission (F10). */
  const openComparePicker = useCallback(() => {
    compareInputRef.current?.click();
  }, []);

  /** Chooses the old version again. */
  const handleRetryCompare = useCallback(() => {
    setCompareError(null);
    openComparePicker();
  }, [openComparePicker]);

  const resetMission = useCallback(() => {
    loaderRef.current.cancel();
    parseGenerationRef.current += 1;
    setLoading(false);
    setError(null);
    setCompareError(null);
    setMissionData(null);
    setSourceFile(null);
    setRevisions(null);
    latestSnapshotRef.current = null;
  }, []);

  return (
    <div className="app" data-theme={settings.theme} data-font-scale={settings.fontScale}>
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
      <input
        ref={compareInputRef}
        type="file"
        accept=".miz"
        onChange={handleCompareSelect}
        id="compare-file-input"
        className="visually-hidden"
        aria-label={t('revision:pickOld')}
      />

      <AppShell
        mission={missionData}
        sourceFile={sourceFile}
        storageFailed={storageFailed}
        revisions={revisions}
        loading={loading}
        isDragging={isDragging}
        onNotesChange={handleNotesChange}
        onPickFiles={openFilePicker}
        onCompare={openComparePicker}
        onCloseRevisions={() => setRevisions(null)}
        onCloseMission={resetMission}
      />

      {isDragging && missionData && (
        <div className="drop-overlay" role="status" aria-live="polite">
          {t('app.dropFile')}
        </div>
      )}

      {(compareError ?? error) && (
        <div className="error app-error" role="alert">
          <p>{compareError ?? error}</p>
          <div className="error-actions">
            {compareError ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={handleRetryCompare}>{t('revision:retryCompare')}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setCompareError(null)}>{t('revision:dismissCompare')}</button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={handleRetrySelection}>{t('app.retry')}</button>
                <button type="button" className="btn btn-secondary" onClick={resetMission}>{t('app.reset')}</button>
              </>
            )}
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

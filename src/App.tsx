import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MissionParser } from './core/MissionParser';
import { normalizeMission } from './core/MissionNormalizer';
import type { DisplaySettings, MissionData, ParsedMissionFile } from './types/mission';
import MissionView from './components/MissionView';
import { useSettings } from './hooks/useSettings';

function App() {
  const [missionData, setMissionData] = useState<MissionData | null>(null);
  const [parsedMission, setParsedMission] = useState<ParsedMissionFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { settings, setViewMode, setLanguage } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const parserRef = useRef<MissionParser | null>(null);

  const normalizeForSettings = useCallback((parsed: ParsedMissionFile) => normalizeMission(parsed, {
    coordinateFormat: settings.coordinateFormat,
    unitSystem: settings.unitSystem,
    viewMode: settings.viewMode,
  }), [settings.coordinateFormat, settings.unitSystem, settings.viewMode]);

  // Keep the parsed source in memory so display settings can be applied again
  // without asking the user to select and parse the .miz file a second time.
  useEffect(() => {
    if (parsedMission) {
      setMissionData(normalizeForSettings(parsedMission));
    }
  }, [parsedMission, normalizeForSettings]);

  const handleFileDrop = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.miz')) {
      setError('.mizファイルを選択してください');
      return;
    }

    parserRef.current?.cancel();
    const parser = new MissionParser();
    parserRef.current = parser;
    setLoading(true);
    setError(null);

    try {
      const parsed = await parser.parse(file);
      if (parserRef.current !== parser) return;

      setParsedMission(parsed);
      setMissionData(normalizeForSettings(parsed));
    } catch (err) {
      if (parserRef.current === parser) {
        setError(err instanceof Error ? err.message : 'ミッションファイルの解析に失敗しました');
      }
    } finally {
      if (parserRef.current === parser) {
        parserRef.current = null;
        setLoading(false);
      }
    }
  }, [normalizeForSettings]);

  const handleFiles = useCallback((fileList: FileList | readonly File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) {
      setError('.mizファイルを選択してください');
      return;
    }

    const mizFiles = files.filter(file => file.name.toLowerCase().endsWith('.miz'));
    if (mizFiles.length === 0) {
      setError('.mizファイルを選択してください（他の形式は読み込めません）');
      setNotice(null);
      return;
    }

    if (files.length > 1) {
      const ignoredCount = files.length - 1;
      setNotice(`複数ファイルが選択されたため、最初の.mizファイル「${mizFiles[0].name}」だけを解析します（${ignoredCount}件は無視）。`);
    } else {
      setNotice(null);
    }

    void handleFileDrop(mizFiles[0]);
  }, [handleFileDrop]);

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
    setLoading(false);
    setError(null);
    setNotice(null);
    setParsedMission(null);
    setMissionData(null);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>FastBriefing</h1>
        <div className="header-controls">
          <label>
            <input type="checkbox" checked={settings.viewMode === 'creator'} onChange={() => setViewMode(settings.viewMode === 'creator' ? 'pilot' : 'creator')} />
            {settings.viewMode === 'creator' ? '作成者ビュー' : 'パイロットビュー'}
          </label>
          <select value={settings.language} onChange={(event) => setLanguage(event.target.value as DisplaySettings['language'])} aria-label="表示言語">
            <option value="ja">日本語</option>
            <option value="en">English</option>
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
          aria-label=".mizミッションファイルを選択"
        />

        {!missionData ? (
          <div
            className={`drop-zone${isDragging ? ' dragging' : ''}`}
            onDragOver={handleDropZoneDragOver}
            aria-label=".mizミッションファイルのドロップ領域"
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
              <p>.mizファイルをここにドロップ</p>
              <p className="drop-hint" id="drop-hint">またはクリック、Enter、Spaceで選択</p>
            </label>
          </div>
        ) : (
          <MissionView mission={missionData} settings={settings} />
        )}

        {isDragging && missionData && (
          <div className="drop-overlay" role="status" aria-live="polite">
            .mizファイルをここにドロップ
          </div>
        )}

        {notice && <div className="drop-notice" role="status">{notice}</div>}

        {error && (
          <div className="error app-error" role="alert">
            <p>{error}</p>
            <div className="error-actions">
              <button type="button" className="btn btn-secondary" onClick={handleRetrySelection}>別のファイルを選ぶ</button>
              <button type="button" className="btn btn-secondary" onClick={resetMission}>やり直す</button>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true"></div>
            <p>ミッションを解析中...</p>
          </div>
        )}
      </main>
    </div>
  );
}

function hasFiles(event: globalThis.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files') || Boolean(event.dataTransfer?.files.length);
}

export default App;

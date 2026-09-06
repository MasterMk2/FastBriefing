import { useState, useCallback } from 'react';
import { MissionParser } from './core/MissionParser';
import { normalizeMission } from './core/MissionNormalizer';
import type { MissionData } from './types/mission';
import MissionView from './components/MissionView';
import { useSettings } from './hooks/useSettings';

function App() {
  const [missionData, setMissionData] = useState<MissionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings, setViewMode, setLanguage } = useSettings();
  
  const handleFileDrop = useCallback(async (file: File) => {
    if (!file.name.endsWith('.miz')) {
      setError('Please select a .miz file');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const parser = new MissionParser();
      const parsed = await parser.parse(file);
      
      const normalized = normalizeMission(parsed, {
        coordinateFormat: settings.coordinateFormat,
        unitSystem: settings.unitSystem,
        viewMode: settings.viewMode,
      });
      
      setMissionData(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse mission file');
    } finally {
      setLoading(false);
    }
  }, [settings]);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileDrop(file);
  }, [handleFileDrop]);
  
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileDrop(file);
  }, [handleFileDrop]);
  
  return (
    <div className="app">
      <header className="header">
        <h1>FastBriefing</h1>
        <div className="header-controls">
          <label>
            <input type="checkbox" checked={settings.viewMode === 'creator'} onChange={() => setViewMode(settings.viewMode === 'creator' ? 'pilot' : 'creator')} />
            {settings.viewMode === 'creator' ? '作成者ビュー' : 'パイロットビュー'}
          </label>
          <select value={settings.language} onChange={(e) => setLanguage(e.target.value as 'ja' | 'en')}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>
      </header>
      
      <main className="main">
        {!missionData ? (
          <div className="drop-zone" onDragOver={handleDragOver} onDrop={handleDrop}>
            <input type="file" accept=".miz" onChange={handleFileSelect} id="file-input" hidden />
            <label htmlFor="file-input" className="drop-label">
              <div className="drop-icon">📁</div>
              <p>.mizファイルをここにドロップ</p>
              <p className="drop-hint">またはクリックして選択</p>
            </label>
            {error && <div className="error">{error}</div>}
          </div>
        ) : (
          <MissionView mission={missionData} settings={settings} />
        )}
        
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>ミッションを解析中...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
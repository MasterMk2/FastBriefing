import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplaySettings, MissionData } from '../types/mission';
import type { WhiteboardData } from '../types/whiteboard';
import { useSettings } from '../hooks/useSettings';
import { applyViewMode } from '../utils/viewMode';
import { buildBriefingMarkdown } from '../utils/briefingMarkdown';
import { buildGeospatialExport, toGeoJson, toKml } from '../utils/geospatialExport';
import { planKneeboardPages } from '../utils/kneeboard';
import { renderKneeboardPages } from '../utils/kneeboardRenderer';
import { createKneeboardMizCopy, createKneeboardPngZip, numberedKneeboardImages } from '../utils/kneeboardArchive';
import PrintView from './PrintView';
import type { MissionMapRenderState } from './MissionMapCanvas';
import { installPrintReadinessGuard } from '../utils/printReadiness';

interface ExportTabProps {
  mission: MissionData;
  settings: DisplaySettings;
  sourceFile: File | null;
  whiteboard: WhiteboardData;
}

export default function ExportTab({ mission, settings, sourceFile, whiteboard }: ExportTabProps) {
  const { t } = useTranslation();
  const { setOutputLanguage } = useSettings();
  const viewMission = useMemo(() => applyViewMode(mission, settings.viewMode), [mission, settings.viewMode]);
  const [markdown, setMarkdown] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [pngStatus, setPngStatus] = useState('');
  const [geoStatus, setGeoStatus] = useState('');
  const [pngBusy, setPngBusy] = useState(false);
  const [kneeboardWidth, setKneeboardWidth] = useState(1536);
  const [aircraftType, setAircraftType] = useState('');
  const canExportPages = settings.briefingSections.length > 0;
  const hasPrintMap = settings.briefingSections.includes('map');
  const [printMapState, setPrintMapState] = useState<MissionMapRenderState>(hasPrintMap ? 'loading' : 'ready');
  const printMapBlocked = hasPrintMap && printMapState !== 'ready';
  const aircraftTypes = useMemo(() => [...new Set([
    ...viewMission.coalitions.blue.flights,
    ...viewMission.coalitions.red.flights,
    ...viewMission.coalitions.neutral.flights,
  ].map(flight => flight.type).filter(type => /^[A-Za-z0-9_-]+$/.test(type)))].sort(), [viewMission]);

  const outputT = (key: string, options?: Record<string, string | number>) => t(key, {
    ...options,
    lng: settings.outputLanguage,
  });

  useEffect(() => {
    setMarkdown('');
    setCopyStatus('');
  }, [settings, viewMission, whiteboard]);

  useEffect(() => {
    if (aircraftType && !aircraftTypes.includes(aircraftType)) setAircraftType('');
  }, [aircraftType, aircraftTypes]);

  useEffect(() => installPrintReadinessGuard(
    window,
    document.documentElement,
    () => printMapBlocked,
  ), [printMapBlocked]);

  const generateMarkdown = () => {
    setMarkdown(buildBriefingMarkdown(viewMission, settings, whiteboard, outputT));
    setCopyStatus('');
  };

  const copyMarkdown = async () => {
    if (!markdown) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(markdown);
      setCopyStatus(t('export.copied'));
    } catch {
      setCopyStatus(t('export.copyFailed'));
    }
  };

  const exportGeospatial = (format: 'geojson' | 'kml') => {
    const result = buildGeospatialExport(mission, settings.viewMode);
    if (result.features.length === 0) {
      setGeoStatus(t('export.geoEmpty', { skipped: result.skipped }));
      return;
    }
    const data = format === 'geojson' ? toGeoJson(result) : toKml(result);
    const type = format === 'geojson' ? 'application/geo+json' : 'application/vnd.google-earth.kml+xml';
    downloadBlob(new Blob([data], { type }), `fastbriefing-routes.${format}`);
    setGeoStatus(t('export.geoSaved', { count: result.features.length, skipped: result.skipped }));
  };

  const exportNormalizedJson = () => {
    const visibleFlights = new Set([
      ...viewMission.coalitions.blue.flights.map(flight => `blue:${flight.groupId}`),
      ...viewMission.coalitions.red.flights.map(flight => `red:${flight.groupId}`),
      ...viewMission.coalitions.neutral.flights.map(flight => `neutral:${flight.groupId}`),
    ]);
    const userNotes = settings.viewMode === 'creator' ? viewMission.userNotes : {
      ...viewMission.userNotes,
      perFlight: Object.fromEntries(Object.entries(viewMission.userNotes.perFlight)
        .filter(([key]) => visibleFlights.has(key))),
    };
    downloadBlob(
      new Blob([JSON.stringify({ ...viewMission, userNotes }, null, 2)], { type: 'application/json' }),
      'fastbriefing-mission.json',
    );
  };

  const exportKneeboard = async (format: 'zip' | 'miz') => {
    if (pngBusy || !canExportPages) return;
    setPngBusy(true);
    setPngStatus(t('export.pngGenerating'));
    try {
      const pages = planKneeboardPages(mission, settings, outputT, aircraftType || null, whiteboard);
      if (pages.length === 0) throw new Error('No briefing sections selected');
      const pngs = await renderKneeboardPages(pages, kneeboardWidth, outputT);
      const images = numberedKneeboardImages(pngs);
      let result: Uint8Array;
      let filename: string;
      if (format === 'miz') {
        if (!sourceFile) throw new Error('Mission source file unavailable');
        result = createKneeboardMizCopy(new Uint8Array(await sourceFile.arrayBuffer()), images, aircraftType || null);
        filename = `${safeFilename(sourceFile.name.replace(/\.miz$/i, ''))}-kneeboard.miz`;
      } else {
        result = createKneeboardPngZip(images);
        filename = `${safeFilename(mission.meta.sortie || 'briefing')}-kneeboard.zip`;
      }
      downloadBlob(new Blob([new Uint8Array(result)], { type: 'application/zip' }), filename);
      setPngStatus(t('export.pngSaved', { count: images.length }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPngStatus(t('export.pngFailed', { detail }));
    } finally {
      setPngBusy(false);
    }
  };

  return (
    <div className="tab-panel export">
      <div className="export-actions">
        <button type="button" onClick={generateMarkdown} className="btn btn-primary">{t('export.generateMarkdown')}</button>
        <button type="button" onClick={exportNormalizedJson} className="btn btn-secondary">{t('export.normalizedJson')}</button>
        <button type="button" onClick={() => exportGeospatial('geojson')} className="btn btn-secondary">{t('export.geoJson')}</button>
        <button type="button" onClick={() => exportGeospatial('kml')} className="btn btn-secondary">{t('export.kml')}</button>
        <button type="button" onClick={() => void copyMarkdown()} className="btn" disabled={!markdown}>{t('export.copy')}</button>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-secondary"
          disabled={printMapBlocked}
          aria-describedby={printMapBlocked ? 'print-map-status' : undefined}
        >{t('export.printPdf')}</button>
        <button
          type="button"
          onClick={() => void exportKneeboard('zip')}
          className="btn btn-secondary"
          disabled={pngBusy || !canExportPages}
          aria-describedby={!canExportPages ? 'png-empty-selection-help' : undefined}
        >{t('export.generatePng')}</button>
        <button
          type="button"
          onClick={() => void exportKneeboard('miz')}
          className="btn btn-secondary"
          disabled={pngBusy || !sourceFile || !canExportPages}
          aria-describedby={!canExportPages ? 'png-empty-selection-help' : undefined}
        >{t('export.embedMiz')}</button>
        <label>
          {t('export.kneeboardWidth')}
          <input
            type="number"
            min={768}
            max={3072}
            step={3}
            value={kneeboardWidth}
            onChange={event => setKneeboardWidth(Number(event.target.value))}
          />
        </label>
        <label>
          {t('export.kneeboardTarget')}
          <select value={aircraftType} onChange={event => setAircraftType(event.target.value)}>
            <option value="">{t('export.kneeboardAll')}</option>
            {aircraftTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          {t('app.outputLanguage')}
          <select
            value={settings.outputLanguage}
            onChange={(event) => setOutputLanguage(event.target.value as DisplaySettings['outputLanguage'])}
            aria-label={t('app.outputLanguage')}
          >
            <option value="ja">{t('app.japanese')}</option>
            <option value="en">{t('app.english')}</option>
          </select>
        </label>
        {copyStatus && <span className="hint" role="status">{copyStatus}</span>}
        {pngStatus && <span className="hint" role="status">{pngStatus}</span>}
        {geoStatus && <span className="hint" role="status">{geoStatus}</span>}
        {printMapBlocked && (
          <span id="print-map-status" className={printMapState === 'error' ? 'warning' : 'hint'} role={printMapState === 'error' ? 'alert' : 'status'}>
            {t(printMapState === 'error' ? 'export.printMapFailed' : 'export.printMapLoading')}
          </span>
        )}
        {!canExportPages && <span className="hint" id="png-empty-selection-help">{t('export.pngNoSections')}</span>}
      </div>

      {markdown && (
        <div className="markdown-preview">
          <h3>{t('export.preview')}</h3>
          <pre>{markdown}</pre>
        </div>
      )}

      <section className="section export-help">
        <h3>{t('export.printImageExport')}</h3>
        <p>{t('export.printHelp')}</p>
        <p className="hint">{t('export.pngHelp')}</p>
      </section>

      <div className="print-briefing">
        <div className="print-map-blocked-message" role="alert">
          {t(printMapState === 'error' ? 'export.printMapFailed' : 'export.printMapLoading')}
        </div>
        <PrintView
          mission={mission}
          settings={settings}
          whiteboard={whiteboard}
          onMapRenderStateChange={setPrintMapState}
        />
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function safeFilename(value: string): string {
  const filename = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return filename || 'briefing';
}
